import { parseSupportEmail } from '@/lib/site-settings'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

/** Keep the public support link usable without Cloudflare's email decode script. */
export default function SupportEmailLink({ email, editorial = false }: { email: string; editorial?: boolean }) {
  const address = parseSupportEmail(email)
  if (!address) return null
  const escaped = escapeHtml(address)
  // Cloudflare documents these comments as a per-address obfuscation opt-out:
  // https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/
  // Only a validated mailbox and a fixed class enter this HTML fragment.
  const html = `<!--email_off--><a${editorial ? ' class="editorialLink"' : ''} href="mailto:${escaped}">${escaped}</a><!--/email_off-->`
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
