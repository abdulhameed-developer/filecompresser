import Icon from './Icon'
import Link from 'next/link'
import Image from 'next/image'
import { footerColumns } from '@/lib/nav'
import { getSiteSettings } from '@/lib/site-settings'
import SupportEmailLink from './SupportEmailLink'

/**
 * The one footer, rendered once by the root layout.
 *
 * Columns are generated from the tool registry (see `lib/nav.ts`), so a footer
 * link can never point at a route that does not exist, and a new tool cannot be
 * added without appearing in the footer.
 */
export default function SiteFooter() {
  const year = new Date().getFullYear()
  const { supportEmail } = getSiteSettings()

  return (
    <footer className="siteFooter">
      <div className="footerTop">
        <div className="footerBrand">
          <Link prefetch={false} className="brand" href="/">
            <Image className="brandMark" src="/logo.png" alt="FileCompresser — home" width={223} height={68} />
          </Link>
          <p>
            Smaller files, processed privately in your browser. No uploads, no accounts, no
            watermarks.
          </p>
          <p className="footerContact">
            <Link prefetch={false} href="/contact">Help & contact</Link>
          </p>
          {supportEmail && <p className="footerContact"><SupportEmailLink email={supportEmail} /></p>}
          <p className="footerContact"><a href="/THIRD-PARTY-NOTICES.txt">Open-source notices &amp; source</a></p>
        </div>

        {footerColumns().map((column) => (
          // Distinct from the header's "Primary" landmark: two `navigation`
          // regions with the same name are ambiguous to switch between.
          <nav className="footerCol" key={column.title} aria-label={`Footer: ${column.title}`}>
            <h2>{column.title}</h2>
            <ul>
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link prefetch={false} href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="footerBottom">
        <span>
          © {year} filecompresser.
        </span>
        <span className="footerPrivacy">
          <Icon name="shield" /> Your files are processed on your device and never
          uploaded.
        </span>
      </div>
    </footer>
  )
}
