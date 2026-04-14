import { AppShell } from '@/components/layout/app-shell'

export default function AppGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>): React.JSX.Element {
  return <AppShell>{children}</AppShell>
}
