import ManagedLegalPage from '@/components/ManagedLegalPage'
import { managedPageMetadata } from '@/lib/managed-pages'

export function generateMetadata() { return managedPageMetadata('disclaimer') }

export default function DisclaimerPage() {
  return <ManagedLegalPage slug="disclaimer" />
}
