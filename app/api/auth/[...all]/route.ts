import { toNextJsHandler } from "better-auth/next-js";

import { createAuth } from "@/lib/auth";
import {
  connectDatabaseWithRetry,
  createDatabaseContext,
} from "@/lib/server/prisma";

export const runtime = "nodejs";
const ADMIN_AUTH_API_PREFIX = "/api/auth/admin";

export async function GET(request: Request) {
  return handleAuthRequest("GET", request);
}

export async function POST(request: Request) {
  return handleAuthRequest("POST", request);
}

async function handleAuthRequest(method: "GET" | "POST", request: Request) {
  const pathname = new URL(request.url).pathname;
  if (
    pathname === ADMIN_AUTH_API_PREFIX ||
    pathname.startsWith(`${ADMIN_AUTH_API_PREFIX}/`)
  ) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const database = createDatabaseContext();

  try {
    await connectDatabaseWithRetry(database.prisma);
    const handlers = toNextJsHandler(createAuth(database.prisma));
    return await handlers[method](request);
  } finally {
    await database.close();
  }
}
