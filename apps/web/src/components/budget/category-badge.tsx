'use client'

import { cn } from '@/lib/utils'

type Props = {
  name: string
  color: string | null
  className?: string
}

export function CategoryBadge({ name, color, className }: Props): React.JSX.Element {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', className)}
      style={{ backgroundColor: `${color ?? '#94a3b8'}20`, color: color ?? '#94a3b8' }}
    >
      {name}
    </span>
  )
}
