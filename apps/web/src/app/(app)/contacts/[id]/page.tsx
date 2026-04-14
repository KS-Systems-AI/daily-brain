import type { Metadata } from 'next'
import { ContactDetailView } from '@/components/contacts/contact-detail-view'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return { title: `Contact — ${id.slice(0, 8)}…` }
}

export default async function ContactDetailPage({ params }: Props): Promise<React.JSX.Element> {
  const { id } = await params
  return <ContactDetailView contactId={id} />
}
