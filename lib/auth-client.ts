"use client";

import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { fetchWithAwsPayloadHash } from "@/lib/client-fetch";

export const authClient = createAuthClient({
  fetchOptions: {
    customFetchImpl: fetchWithAwsPayloadHash,
  },
  plugins: [adminClient()],
});
