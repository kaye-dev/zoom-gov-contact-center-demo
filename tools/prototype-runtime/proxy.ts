import { NextResponse } from "next/server";

// Establish the host's proxy boundary so ancestor application auth is not used.
export function proxy() {
  return NextResponse.next();
}
