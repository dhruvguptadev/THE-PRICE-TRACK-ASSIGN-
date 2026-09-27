import { db } from './prisma.js';

/** One statement per chunk: Prisma has no bulk upsert, so use unnest() arrays via $executeRaw. */
const UPSERT_CHUNK = 500;

export async function upsertCatalog(products) {
  for (let i = 0; i < products.length; i += UPSERT_CHUNK) {
    const chunk = products.slice(i, i + UPSERT_CHUNK);
    await db().$executeRaw`
      insert into catalog_products (store_product_id, slug, name, brand, category, sku, last_seen_at)
      select *, now() from unnest(
        ${chunk.map((p) => p.id)}::int[],
        ${chunk.map((p) => p.slug ?? String(p.id))}::text[],
        ${chunk.map((p) => p.name)}::text[],
        ${chunk.map((p) => p.brand ?? null)}::text[],
        ${chunk.map((p) => p.category ?? null)}::text[],
        ${chunk.map((p) => p.sku ?? null)}::text[]
      )
      on conflict (store_product_id) do update set
        slug = excluded.slug, name = excluded.name, brand = excluded.brand,
        category = excluded.category, sku = excluded.sku, last_seen_at = now()`;
  }
}

export function countCatalog() {
  return db().catalog_products.count();
}

/** Case-insensitive partial match on name or brand; prefix matches rank first (raw SQL for the ranking). */
export function searchCatalog(q, limit) {
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  return db().$queryRaw`
    select store_product_id, name, brand, category
      from catalog_products
     where name ilike ${`%${escaped}%`} or brand ilike ${`%${escaped}%`}
     order by (lower(name) like lower(${`${escaped}%`})) desc, name asc
     limit ${limit}`;
}
