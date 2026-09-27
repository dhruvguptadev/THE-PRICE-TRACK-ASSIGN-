import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { getPool } from './pool.js';

// Created lazily so modules can be imported (e.g. by unit tests) without a database.
// Prisma shares the app's pg.Pool, so the advisory lock and Prisma use one set of connections.
let prisma = null;

export function db() {
  if (!prisma) prisma = new PrismaClient({ adapter: new PrismaPg(getPool()) });
  return prisma;
}

export async function disconnectPrisma() {
  if (prisma) await prisma.$disconnect().catch(() => {});
  prisma = null;
}

/** Interactive transaction with room for pooler latency (Prisma's default is 5 s). */
export const transaction = (fn) => db().$transaction(fn, { maxWait: 10_000, timeout: 20_000 });

export const isUniqueViolation = (error) => error?.code === 'P2002';
