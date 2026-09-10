import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import Entry from "@prototype/entry";
import config from "../../preview-config.json";

export default async function PrototypePage({ params }: { params: Promise<{ path?: string[] }> }) {
  const requested = `/${((await params).path ?? []).join("/")}`;
  if (requested === "/" && config.route !== "/") redirect(config.route);
  if (requested !== config.route) notFound();
  return <Suspense><Entry /></Suspense>;
}
