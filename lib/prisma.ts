import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

/// Neon's pooler suspends the compute after inactivity; the connection that
/// wakes it can time out even though the query itself was fine. These codes
/// are all "the connection didn't work", never "the query was wrong" — safe
/// to retry with backoff instead of surfacing a 500 on the page's first load.
const RETRYABLE_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"]);
const RETRYABLE_KINDS = ["DatabaseNotReachable", "ConnectionClosed", "SocketTimeout", "TooManyConnections"];

function isRetryable(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | undefined;
  if (err?.code && RETRYABLE_CODES.has(err.code)) return true;
  return RETRYABLE_KINDS.some((kind) => err?.message?.includes(kind));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

  return new PrismaClient({ adapter }).$extends({
    query: {
      async $allOperations({ query, args }) {
        const attempts = 3;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            return await query(args);
          } catch (error) {
            if (attempt === attempts || !isRetryable(error)) throw error;
            await sleep(300 * attempt);
          }
        }
        throw new Error("unreachable");
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
