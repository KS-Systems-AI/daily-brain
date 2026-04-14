import type { Metadata } from 'next'
import { CompaniesListPage } from '@/components/companies/companies-list-page'

export const metadata: Metadata = {
  title: 'Unternehmen — Daily Brain',
}

export default function CompaniesPage(): React.JSX.Element {
  return <CompaniesListPage />
}
