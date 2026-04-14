import type { Metadata } from 'next'
import { ContactsListPage } from '@/components/contacts/contacts-list-page'

export const metadata: Metadata = {
  title: 'Personen — Daily Brain',
}

export default function ContactsPage(): React.JSX.Element {
  return <ContactsListPage />
}
