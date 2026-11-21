import ManagedLegalPage from '@/components/ManagedLegalPage'
import { managedPageMetadata } from '@/lib/managed-pages'

export const metadata = managedPageMetadata('privacy')

export default function PrivacyPage() {
  return <ManagedLegalPage slug="privacy" />
}
