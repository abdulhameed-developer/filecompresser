import ManagedLegalPage from '@/components/ManagedLegalPage'
import { managedPageMetadata } from '@/lib/managed-pages'

export const metadata = managedPageMetadata('disclaimer')

export default function DisclaimerPage() {
  return <ManagedLegalPage slug="disclaimer" />
}
