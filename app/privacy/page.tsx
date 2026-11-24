import ManagedLegalPage from '@/components/ManagedLegalPage'
import { managedPageMetadata } from '@/lib/managed-pages'

export function generateMetadata() { return managedPageMetadata('privacy') }

export default function PrivacyPage() {
  return <ManagedLegalPage slug="privacy" />
}
