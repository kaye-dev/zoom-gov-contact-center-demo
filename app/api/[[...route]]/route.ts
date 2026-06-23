import { Hono } from "hono";
import { handle } from "hono/vercel";

import {
  countDemoRecords,
  createDemoRecord,
  ensureDatabase,
  getDatabasePath,
  listDemoRecords,
  MAX_DEMO_RECORD_MESSAGE_LENGTH,
} from "@/lib/server/db";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");

app.get("/health", (c) => {
  ensureDatabase();

  return c.json({
    status: "ok",
    database: {
      driver: "sqlite",
      orm: "drizzle",
      path: getDatabasePath(),
      demoRecordCount: countDemoRecords(),
    },
  });
});

app.get("/demo-records", (c) => {
  return c.json({
    records: listDemoRecords(),
  });
});

app.post("/demo-records", async (c) => {
  const body = await readJsonBody(c.req.raw);

  if (!isDemoRecordPayload(body)) {
    return c.json({ error: "Request body must include a message string." }, 400);
  }

  const message = body.message.trim();
  if (message.length === 0) {
    return c.json({ error: "Message must not be empty." }, 400);
  }

  if (message.length > MAX_DEMO_RECORD_MESSAGE_LENGTH) {
    return c.json(
      {
        error: `Message must be ${MAX_DEMO_RECORD_MESSAGE_LENGTH} characters or fewer.`,
      },
      400,
    );
  }

  return c.json({ record: createDemoRecord(message) }, 201);
});

const handler = handle(app);

export const GET = handler;
export const POST = handler;

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isDemoRecordPayload(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}
