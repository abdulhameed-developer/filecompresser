import ManagedLegalPage from '@/components/ManagedLegalPage'
import { managedPageMetadata } from '@/lib/managed-pages'

export function generateMetadata() { return managedPageMetadata('terms') }

export default function TermsPage() {
  return <ManagedLegalPage slug="terms" />
}
