'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'

const PROVIDER_MODELS: Record<string, string[]> = {
  gemini: ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-haiku-20240307', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  groq: 'Groq',
}

interface TestResult {
  success: boolean
  answer?: string
  error?: string
  latency_ms: number
}

interface Property {
  id: string
  name: string
}

export default function LLMSettingsPage() {
  const { toast } = useToast()

  // Property selector
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('') // '' = global

  // Primary
  const [provider, setProvider] = useState('gemini')
  const [model, setModel] = useState('gemini-2.0-flash-lite')
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  // Fallback
  const [fallbackProvider, setFallbackProvider] = useState('')
  const [fallbackModel, setFallbackModel] = useState('')
  const [fallbackApiKey, setFallbackApiKey] = useState('')
  const [showFallbackApiKey, setShowFallbackApiKey] = useState(false)

  // State
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [maskedKey, setMaskedKey] = useState<string | null>(null)
  const [maskedFallbackKey, setMaskedFallbackKey] = useState<string | null>(null)

  // Test
  const [testQuestion, setTestQuestion] = useState('Phòng đôi giá bao nhiêu?')
  const [testingPrimary, setTestingPrimary] = useState(false)
  const [testingFallback, setTestingFallback] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // Load properties list
  useEffect(() => {
    async function loadProperties() {
      try {
        const res = await fetch('/api/admin/llm-settings/properties')
        if (res.ok) {
          const data = await res.json()
          setProperties(data.properties ?? [])
        }
      } catch (err) {
        console.error('Failed to load properties:', err)
      }
    }
    loadProperties()
  }, [])

  // Load settings when property selection changes
  useEffect(() => {
    loadSettings()
  }, [selectedPropertyId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSettings() {
    setLoading(true)
    try {
      const url = selectedPropertyId
        ? `/api/admin/llm-settings?property_id=${selectedPropertyId}`
        : '/api/admin/llm-settings'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load settings')
      const data = await res.json()

      if (data.settings) {
        setProvider(data.settings.provider)
        setModel(data.settings.model)
        setMaskedKey(data.settings.api_key_masked)
        setFallbackProvider(data.settings.fallback_provider || '')
        setFallbackModel(data.settings.fallback_model || '')
        setMaskedFallbackKey(data.settings.fallback_api_key_masked)
        setIsActive(data.settings.is_active)
        setUpdatedAt(data.settings.updated_at)
      } else {
        // No config for this scope — reset form
        setProvider('gemini')
        setModel('gemini-2.0-flash-lite')
        setMaskedKey(null)
        setFallbackProvider('')
        setFallbackModel('')
        setMaskedFallbackKey(null)
        setIsActive(false)
        setUpdatedAt(null)
      }
      setApiKey('')
      setFallbackApiKey('')
    } catch (err) {
      console.error('Failed to load LLM settings:', err)
      toast({ title: 'Lỗi', description: 'Không thể tải cấu hình AI', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // When provider changes, update model to first suggestion
  function handleProviderChange(value: string) {
    setProvider(value)
    setModel(PROVIDER_MODELS[value]?.[0] || '')
  }

  function handleFallbackProviderChange(value: string) {
    setFallbackProvider(value)
    setFallbackModel(PROVIDER_MODELS[value]?.[0] || '')
  }

  // Save settings
  async function handleSave() {
    if (!apiKey && !maskedKey) {
      toast({ title: 'Lỗi', description: 'Vui lòng nhập API Key', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const body: Record<string, string | null> = {
        provider,
        model,
        api_key: apiKey || '__KEEP_EXISTING__',
        fallback_provider: fallbackProvider || null,
        fallback_model: fallbackModel || null,
        fallback_api_key: fallbackApiKey || (fallbackProvider ? '__KEEP_EXISTING__' : null),
        property_id: selectedPropertyId || null,
      }

      const res = await fetch('/api/admin/llm-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      toast({ title: 'Thành công', description: 'Đã lưu cấu hình AI' })
      setIsActive(true)
      setUpdatedAt(new Date().toISOString())
      // Clear raw keys after save (they're now stored in DB)
      if (apiKey) {
        setMaskedKey('****' + apiKey.slice(-4))
        setApiKey('')
      }
      if (fallbackApiKey) {
        setMaskedFallbackKey('****' + fallbackApiKey.slice(-4))
        setFallbackApiKey('')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định'
      toast({ title: 'Lỗi', description: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Test connection
  async function handleTest(type: 'primary' | 'fallback') {
    const isPrimary = type === 'primary'
    const testProvider = isPrimary ? provider : fallbackProvider
    const testModel = isPrimary ? model : fallbackModel
    const testKey = isPrimary ? apiKey : fallbackApiKey

    if (!testProvider || !testModel || !testKey) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng nhập đầy đủ Provider, Model và API Key để test',
        variant: 'destructive',
      })
      return
    }

    if (!testQuestion.trim()) {
      toast({ title: 'Lỗi', description: 'Vui lòng nhập câu hỏi test', variant: 'destructive' })
      return
    }

    isPrimary ? setTestingPrimary(true) : setTestingFallback(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/admin/llm-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: testProvider,
          model: testModel,
          api_key: testKey,
          question: testQuestion,
        }),
      })

      const data = await res.json()
      setTestResult(data)
    } catch (err) {
      setTestResult({ success: false, error: 'Network error', latency_ms: 0 })
    } finally {
      isPrimary ? setTestingPrimary(false) : setTestingFallback(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Cấu Hình AI Model</h1>
        <p className="text-muted-foreground">Đang tải...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Cấu Hình AI Model</h1>
        {isActive && <Badge variant="default">Active</Badge>}
      </div>

      {/* Property Selector */}
      <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
        <Label className="font-semibold">Phạm vi cấu hình</Label>
        <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
          <SelectTrigger>
            <SelectValue placeholder="Global (tất cả property)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Global (mặc định cho tất cả)</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {selectedPropertyId
            ? 'Cấu hình riêng cho property này. Nếu không có, sẽ dùng config Global.'
            : 'Cấu hình mặc định áp dụng cho tất cả property chưa có config riêng.'}
        </p>
      </div>

      {updatedAt && (
        <p className="text-sm text-muted-foreground">
          Cập nhật lần cuối: {new Date(updatedAt).toLocaleString('vi-VN')}
        </p>
      )}

      {/* Primary Provider */}
      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="font-semibold">Primary Provider</h2>

        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={handleProviderChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(PROVIDER_MODELS[provider] || []).map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>API Key</Label>
          <div className="flex gap-2">
            <Input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={maskedKey || 'Nhập API key...'}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowApiKey(!showApiKey)}
              title={showApiKey ? 'Ẩn' : 'Hiện'}
            >
              {showApiKey ? '🙈' : '👁'}
            </Button>
          </div>
          {maskedKey && !apiKey && (
            <p className="text-xs text-muted-foreground">Key hiện tại: {maskedKey}</p>
          )}
        </div>
      </div>

      {/* Fallback Provider */}
      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="font-semibold">Fallback Provider (tuỳ chọn)</h2>

        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={fallbackProvider} onValueChange={handleFallbackProviderChange}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn fallback provider..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Không dùng —</SelectItem>
              {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {fallbackProvider && fallbackProvider !== 'none' && (
          <>
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={fallbackModel} onValueChange={setFallbackModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(PROVIDER_MODELS[fallbackProvider] || []).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex gap-2">
                <Input
                  type={showFallbackApiKey ? 'text' : 'password'}
                  value={fallbackApiKey}
                  onChange={(e) => setFallbackApiKey(e.target.value)}
                  placeholder={maskedFallbackKey || 'Nhập API key...'}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowFallbackApiKey(!showFallbackApiKey)}
                  title={showFallbackApiKey ? 'Ẩn' : 'Hiện'}
                >
                  {showFallbackApiKey ? '🙈' : '👁'}
                </Button>
              </div>
              {maskedFallbackKey && !fallbackApiKey && (
                <p className="text-xs text-muted-foreground">Key hiện tại: {maskedFallbackKey}</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Test Connection */}
      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="font-semibold">Test Connection</h2>

        <div className="space-y-2">
          <Label>Câu hỏi test</Label>
          <Input
            value={testQuestion}
            onChange={(e) => setTestQuestion(e.target.value)}
            placeholder="Nhập câu hỏi để test..."
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => handleTest('primary')}
            disabled={testingPrimary || testingFallback}
            variant="outline"
          >
            {testingPrimary ? 'Đang test...' : 'Test Primary'}
          </Button>
          {fallbackProvider && fallbackProvider !== 'none' && (
            <Button
              onClick={() => handleTest('fallback')}
              disabled={testingPrimary || testingFallback}
              variant="outline"
            >
              {testingFallback ? 'Đang test...' : 'Test Fallback'}
            </Button>
          )}
        </div>

        {testResult && (
          <div className={`rounded-md p-3 text-sm ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            {testResult.success ? (
              <>
                <p className="font-medium text-green-700">
                  ✓ {testResult.latency_ms}ms
                </p>
                <p className="mt-1 text-green-800 whitespace-pre-wrap">
                  {testResult.answer}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-red-700">
                  ✗ Lỗi ({testResult.latency_ms}ms)
                </p>
                <p className="mt-1 text-red-800">{testResult.error}</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? 'Đang lưu...' : 'Lưu Cấu Hình'}
      </Button>
    </div>
  )
}
