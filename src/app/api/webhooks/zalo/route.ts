import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Zalo OA Webhook Bridge
 *
 * Receives messages from Zalo OA webhook, then forwards them into Chatwoot
 * via the Chatwoot API Channel (incoming message endpoint).
 *
 * Flow:
 *   Zalo OA → POST /api/webhooks/zalo → Chatwoot API Channel → Chatwoot Webhook → n8n
 *
 * Zalo webhook payload (message event):
 *   {
 *     "app_id": "...",
 *     "user_id_by_app": "...",
 *     "event_name": "user_send_text",
 *     "message": { "text": "...", "msg_id": "..." },
 *     "sender": { "id": "..." },
 *     "timestamp": "..."
 *   }
 *
 * Environment:
 *   CHATWOOT_BASE_URL=https://app.chatwoot.com
 *   CHATWOOT_ACCOUNT_ID=156301
 *   CHATWOOT_API_TOKEN=your-agent-bot-token
 *   ZALO_WEBHOOK_SECRET=your-zalo-oa-secret (for verification)
 */

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/webhooks/zalo
 * Zalo OA webhook verification (Zalo sends GET with challenge)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const challenge = searchParams.get('challenge')

  if (challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ status: 'ok' })
}

/**
 * POST /api/webhooks/zalo
 * Receives Zalo OA messages and forwards to Chatwoot API Channel
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Only process user_send_text events
    const eventName = body.event_name
    if (eventName !== 'user_send_text' && eventName !== 'user_send_image') {
      return NextResponse.json({ status: 'ignored', event: eventName })
    }

    const senderId = body.sender?.id || body.user_id_by_app
    const messageText = body.message?.text || ''
    const appId = body.app_id

    if (!senderId || !messageText) {
      return NextResponse.json({ error: 'Missing sender or message' }, { status: 400 })
    }

    // Look up channel mapping to find the Chatwoot inbox for this Zalo OA
    const supabase = createServiceClient()

    const { data: channelMapping } = await supabase
      .from('channel_mappings')
      .select('inbox_id, property_id, config')
      .eq('channel', 'zalo')
      .eq('is_active', true)
      .filter('config->>zalo_oa_id', 'eq', appId)
      .single()

    if (!channelMapping || !channelMapping.inbox_id) {
      console.error(`[Zalo Webhook] No channel mapping found for app_id: ${appId}`)
      return NextResponse.json({ error: 'No mapping found' }, { status: 404 })
    }

    // Forward to Chatwoot API Channel
    const chatwootBaseUrl = process.env.CHATWOOT_BASE_URL || 'https://app.chatwoot.com'
    const chatwootAccountId = process.env.CHATWOOT_ACCOUNT_ID
    const chatwootApiToken = process.env.CHATWOOT_API_TOKEN

    if (!chatwootAccountId || !chatwootApiToken) {
      console.error('[Zalo Webhook] Missing CHATWOOT_ACCOUNT_ID or CHATWOOT_API_TOKEN')
      return NextResponse.json({ error: 'Chatwoot not configured' }, { status: 500 })
    }

    // Create or find contact + conversation in Chatwoot via API channel
    const chatwootUrl = `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/conversations`

    // First, try to find existing conversation for this sender
    const searchRes = await fetch(
      `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/contacts/search?q=${senderId}`,
      {
        headers: {
          'api_access_token': chatwootApiToken,
        },
      }
    )

    let conversationId: string | null = null

    if (searchRes.ok) {
      const searchData = await searchRes.json()
      const contact = searchData.payload?.find(
        (c: { identifier: string }) => c.identifier === senderId
      )

      if (contact) {
        // Find open conversation for this contact in this inbox
        const convsRes = await fetch(
          `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/contacts/${contact.id}/conversations`,
          {
            headers: { 'api_access_token': chatwootApiToken },
          }
        )

        if (convsRes.ok) {
          const convsData = await convsRes.json()
          const openConv = convsData.payload?.find(
            (c: { inbox_id: number; status: string }) =>
              String(c.inbox_id) === channelMapping.inbox_id && c.status !== 'resolved'
          )
          if (openConv) {
            conversationId = String(openConv.id)
          }
        }
      }
    }

    if (conversationId) {
      // Send message to existing conversation
      const msgRes = await fetch(
        `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api_access_token': chatwootApiToken,
          },
          body: JSON.stringify({
            content: messageText,
            message_type: 'incoming',
          }),
        }
      )

      if (!msgRes.ok) {
        const errText = await msgRes.text()
        console.error('[Zalo Webhook] Failed to send message to Chatwoot:', errText)
        return NextResponse.json({ error: 'Failed to forward message' }, { status: 500 })
      }
    } else {
      // Create new conversation via API channel
      // First create contact
      const contactRes = await fetch(
        `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/contacts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api_access_token': chatwootApiToken,
          },
          body: JSON.stringify({
            identifier: senderId,
            name: `Zalo User ${senderId.slice(-6)}`,
            custom_attributes: { source: 'zalo', zalo_user_id: senderId },
          }),
        }
      )

      let contactId: string
      if (contactRes.ok) {
        const contactData = await contactRes.json()
        contactId = contactData.payload?.contact?.id || contactData.payload?.id
      } else {
        // Contact might already exist
        const searchAgain = await fetch(
          `${chatwootBaseUrl}/api/v1/accounts/${chatwootAccountId}/contacts/search?q=${senderId}`,
          { headers: { 'api_access_token': chatwootApiToken } }
        )
        const searchAgainData = await searchAgain.json()
        contactId = searchAgainData.payload?.[0]?.id
        if (!contactId) {
          return NextResponse.json({ error: 'Failed to create/find contact' }, { status: 500 })
        }
      }

      // Create conversation
      const convRes = await fetch(chatwootUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': chatwootApiToken,
        },
        body: JSON.stringify({
          contact_id: contactId,
          inbox_id: channelMapping.inbox_id,
          message: { content: messageText },
          status: 'pending',
        }),
      })

      if (!convRes.ok) {
        const errText = await convRes.text()
        console.error('[Zalo Webhook] Failed to create conversation:', errText)
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
      }
    }

    return NextResponse.json({ status: 'forwarded' })
  } catch (error) {
    console.error('[POST /api/webhooks/zalo]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
