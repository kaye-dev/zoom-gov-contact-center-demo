import { safePublicReturnTo } from "@/lib/public-site-routing";
import { AccessCodeClient } from "./AccessCodeClient";

export default async function AccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <AccessCodeClient returnTo={safePublicReturnTo(params.returnTo)} />;
}
