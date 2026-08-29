import { PrismaClient } from "@prisma/client";

// Single shared Prisma instance (avoids exhausting Postgres connections
// under ts-node-dev hot-reload and across the API + worker processes).
export const prisma = new PrismaClient();
