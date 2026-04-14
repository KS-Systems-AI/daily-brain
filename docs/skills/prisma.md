# Skill: Prisma + Supabase

## Connection
```env
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
```

## Standard Model Pattern
```prisma
model Contact {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId String    @db.Uuid
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  attrs       Json      @default("{}")
  @@index([workspaceId])
  @@map("contacts")
}
```

## Prisma Client singleton
```ts
import { PrismaClient } from '@prisma/client'
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

## Key Rules
- ALWAYS use DIRECT_URL for migrations, DATABASE_URL for queries
- NEVER skip workspaceId scoping
- NEVER hard delete — always set deletedAt
- Run prisma generate after every schema change
