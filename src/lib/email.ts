import nodemailer from 'nodemailer'

const host = process.env.SMTP_HOST
const port = Number(process.env.SMTP_PORT) || 587
const user = process.env.SMTP_USER
const pass = process.env.SMTP_PASSWORD
const from = process.env.EMAIL_FROM || '"StayJoy" <noreply@stayjoy.io.vn>'

const isConfigured = !!(host && user && pass)

let transporter: nodemailer.Transporter | null = null

if (isConfigured) {
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for port 465, false for other ports
    auth: {
      user,
      pass,
    },
  })
} else {
  console.warn('[Email Service] SMTP is not configured. Email notifications will be skipped.')
}

/**
 * Sends an email notification to the specified recipient.
 * 
 * @param to - Recipient email address
 * @param subject - Email subject line
 * @param text - Plain text email content
 * @param html - Optional HTML email content
 * @returns Promise<boolean> indicating whether the email was sent successfully
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<boolean> {
  if (!transporter) {
    console.warn('[Email Service] Cannot send email. SMTP is not configured.')
    return false
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html: html || undefined,
    })
    console.log(`[Email Service] Email sent successfully: ${info.messageId} to ${to}`)
    return true
  } catch (err) {
    console.error(`[Email Service] Failed to send email to ${to}:`, err)
    return false
  }
}
