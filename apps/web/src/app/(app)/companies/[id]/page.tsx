import type { Metadata } from 'next'
import { CompanyDetailView } from '@/components/companies/company-detail-view'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return { title: `Company — ${id.slice(0, 8)}…` }
}

export default async function CompanyDetailPage({ params }: Props): Promise<React.JSX.Element> {
  const { id } = await params
  return <CompanyDetailView companyId={id} />
}
