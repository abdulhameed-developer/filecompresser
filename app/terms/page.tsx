import ManagedLegalPage from '@/components/ManagedLegalPage'
import { managedPageMetadata } from '@/lib/managed-pages'

export const metadata = managedPageMetadata('terms')

export default function TermsPage() {
  return <ManagedLegalPage slug="terms" />
}
