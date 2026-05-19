/**
 * LLM Provider — Multi-model support with fallback
 *
 * Supports: Gemini, OpenAI, Anthropic
 * Fallback: If primary model fails, tries next in chain
 *
 * Config priority:
 *   1. Database (llm_settings table) — admin UI changes take effect immediately
 *   2. Environment variables (fallback if DB config not found)
 *
 * Env vars (fallback):
 *   LLM_PROVIDER=gemini|openai|anthropic (default: gemini)
 *   LLM_MODEL=model-name (optional, uses default per provider)
 *   LLM_FALLBACK_PROVIDER=openai|anthropic|gemini (optional)
 *   GEMINI_API_KEY=...
 *   OPENAI_API_KEY=...
 *   ANTHROPIC_API_KEY=...
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'

export interface LLMRequest {
  systemMessage: string
  userMessage: string
}

export interface LLMResponse {
  answer: string
  provider: string
  model: string
}

interface ProviderConfig {
  name: string
  apiKey: string | undefined
  model: string
  call: (req: LLMRequest, apiKey: string, model: string) => Promise<string>
}

// --- Gemini ---
async function callGemini(req: LLMRequest, apiKey: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: req.userMessage }] }],
      systemInstruction: { parts: [{ text: req.systemMessage }] },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gemini ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = await response.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

// --- OpenAI ---
async function callOpenAI(req: LLMRequest, apiKey: string, model: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: req.systemMessage },
        { role: 'user', content: req.userMessage },
      ],
      max_tokens: 1024,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = await response.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

// --- Anthropic ---
async function callAnthropic(req: LLMRequest, apiKey: string, model: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: req.systemMessage,
      messages: [{ role: 'user', content: req.userMessage }],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Anthropic ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = await response.json()
  return data?.content?.[0]?.text ?? ''
}

// --- Groq ---
async function callGroq(req: LLMRequest, apiKey: string, model: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: req.systemMessage },
        { role: 'user', content: req.userMessage },
      ],
      max_tokens: 1024,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Groq ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = await response.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

// --- Provider Registry ---

const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-2.0-flash-lite',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
  groq: 'llama-3.3-70b-versatile',
}

function getProviderConfig(name: string): ProviderConfig | null {
  const model = process.env.LLM_MODEL || DEFAULT_MODELS[name] || ''

  switch (name) {
    case 'gemini':
      return { name: 'gemini', apiKey: process.env.GEMINI_API_KEY, model, call: callGemini }
    case 'openai':
      return { name: 'openai', apiKey: process.env.OPENAI_API_KEY, model, call: callOpenAI }
    case 'anthropic':
      return { name: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, model, call: callAnthropic }
    case 'groq':
      return { name: 'groq', apiKey: process.env.GROQ_API_KEY, model, call: callGroq }
    default:
      return null
  }
}

// --- DB Config ---

interface DBConfig {
  provider: string
  model: string
  apiKey: string
  fallbackProvider: string | null
  fallbackModel: string | null
  fallbackApiKey: string | null
}

/**
 * Reads LLM config from the llm_settings table (service role, bypasses RLS).
 * Priority: property-specific config → global config → null
 *
 * @param propertyId - If provided, looks for property-specific config first
 */
async function getConfigFromDB(propertyId?: string): Promise<DBConfig | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) return null

  try {
    const serviceClient = createServiceClient(url, serviceKey)

    // If propertyId provided, try property-specific config first
    if (propertyId) {
      const { data: propertyConfig } = await serviceClient
        .from('llm_settings')
        .select('provider, model, api_key, fallback_provider, fallback_model, fallback_api_key')
        .eq('is_active', true)
        .eq('property_id', propertyId)
        .single()

      if (propertyConfig) {
        return {
          provider: propertyConfig.provider,
          model: propertyConfig.model,
          apiKey: propertyConfig.api_key,
          fallbackProvider: propertyConfig.fallback_provider,
          fallbackModel: propertyConfig.fallback_model,
          fallbackApiKey: propertyConfig.fallback_api_key,
        }
      }
    }

    // Fallback to global config (property_id IS NULL)
    const { data, error } = await serviceClient
      .from('llm_settings')
      .select('provider, model, api_key, fallback_provider, fallback_model, fallback_api_key')
      .eq('is_active', true)
      .is('property_id', null)
      .single()

    if (error || !data) return null

    return {
      provider: data.provider,
      model: data.model,
      apiKey: data.api_key,
      fallbackProvider: data.fallback_provider,
      fallbackModel: data.fallback_model,
      fallbackApiKey: data.fallback_api_key,
    }
  } catch (err) {
    console.error('[LLM] Failed to read config from DB:', err)
    return null
  }
}

// --- Main Function ---

/**
 * Calls the configured LLM with fallback support.
 *
 * Priority for config:
 * 1. Database — property-specific config (if propertyId provided)
 * 2. Database — global config (property_id IS NULL)
 * 3. Environment variables (fallback if DB config not found)
 *
 * Provider chain: primary → fallback → others with keys
 *
 * @param req - The LLM request (system + user message)
 * @param propertyId - Optional property ID for per-property LLM config
 */
export async function callLLM(req: LLMRequest, propertyId?: string): Promise<LLMResponse> {
  // Try DB config first (property-specific → global)
  const dbConfig = await getConfigFromDB(propertyId)

  if (dbConfig) {
    // Use DB-based config
    const callFn = getCallFunction(dbConfig.provider)
    if (callFn) {
      try {
        const answer = await callFn(req, dbConfig.apiKey, dbConfig.model)
        return { answer, provider: dbConfig.provider, model: dbConfig.model }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[LLM] DB primary (${dbConfig.provider}) failed:`, msg)

        // Try DB fallback
        if (dbConfig.fallbackProvider && dbConfig.fallbackApiKey) {
          const fallbackFn = getCallFunction(dbConfig.fallbackProvider)
          if (fallbackFn) {
            try {
              const fallbackModel = dbConfig.fallbackModel || DEFAULT_MODELS[dbConfig.fallbackProvider] || ''
              const answer = await fallbackFn(req, dbConfig.fallbackApiKey, fallbackModel)
              return { answer, provider: dbConfig.fallbackProvider, model: fallbackModel }
            } catch (fallbackErr) {
              const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
              console.error(`[LLM] DB fallback (${dbConfig.fallbackProvider}) failed:`, fallbackMsg)
            }
          }
        }
      }
    }
    // If DB config providers all failed, fall through to env-based config
  }

  // Fallback: env-based config (original behavior)
  const primaryName = process.env.LLM_PROVIDER || 'gemini'
  const fallbackName = process.env.LLM_FALLBACK_PROVIDER || ''

  // Build provider chain: primary → fallback → others with keys
  const chain: string[] = [primaryName]
  if (fallbackName && fallbackName !== primaryName) chain.push(fallbackName)

  // Add any other provider that has a key configured
  const allProviders = ['gemini', 'openai', 'anthropic', 'groq']
  for (const p of allProviders) {
    if (!chain.includes(p)) chain.push(p)
  }

  const errors: string[] = []

  for (const providerName of chain) {
    const config = getProviderConfig(providerName)
    if (!config || !config.apiKey) continue

    try {
      const answer = await config.call(req, config.apiKey, config.model)
      return { answer, provider: config.name, model: config.model }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${providerName}: ${msg}`)
      console.error(`[LLM] ${providerName} failed:`, msg)
      // Continue to next provider
    }
  }

  // All providers failed
  throw new Error(`All LLM providers failed:\n${errors.join('\n')}`)
}

// Helper to get the call function by provider name
function getCallFunction(provider: string): ((req: LLMRequest, apiKey: string, model: string) => Promise<string>) | null {
  switch (provider) {
    case 'gemini': return callGemini
    case 'openai': return callOpenAI
    case 'anthropic': return callAnthropic
    case 'groq': return callGroq
    default: return null
  }
}
