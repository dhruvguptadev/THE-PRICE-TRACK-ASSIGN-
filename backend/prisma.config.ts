import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// CLI (db pull / generate) connection. Supabase: use the Session pooler string (port 5432);
// the direct host is IPv6-only. DIRECT_URL is optional and falls back to DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL },
});
