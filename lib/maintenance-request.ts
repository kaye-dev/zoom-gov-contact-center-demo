export const INTERNAL_MAINTENANCE_PATH = "/maintenance-unavailable";
export const MAINTENANCE_REWRITE_HEADER = "x-mirai-maintenance-rewrite";
export const MAINTENANCE_REWRITE_HEADER_VALUE = "1";

const EXCLUDED_EXACT_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/change-password",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  INTERNAL_MAINTENANCE_PATH,
]);

const EXCLUDED_PATH_PREFIXES = [
  "/admin/",
  "/api/",
  "/login/",
  "/forgot-password/",
  "/change-password/",
  "/_next/",
  "/_vercel/",
  "/.well-known/",
] as const;

const PUBLIC_ASSET_EXTENSION =
  /\.(?:avif|bmp|css|csv|eot|gif|ico|jpe?g|js|json|map|md|mjs|mp3|mp4|ogg|otf|pdf|png|svg|ttf|txt|wav|webm|webmanifest|webp|woff2?|xml|zip)$/i;

/**
 * Returns true only for navigational HTML requests that should observe the
 * maintenance switch. Unknown, extensionless public URLs intentionally return
 * true so they are replaced by the maintenance page instead of a 404 while the
 * site is unavailable.
 */
export function shouldEvaluateMaintenance(request: {
  method: string;
  url: string;
}): boolean {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;

  const pathname = new URL(request.url).pathname;

  if (
    EXCLUDED_EXACT_PATHS.has(pathname) ||
    pathname === "/admin" ||
    pathname === "/api" ||
    pathname === "/_next" ||
    pathname === "/_vercel" ||
    pathname === "/.well-known" ||
    EXCLUDED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return false;
  }

  // `.html` is a public document, including the existing `/docs/*.html`
  // compatibility URLs. Other known file extensions are public assets or raw
  // documents and must remain available.
  if (!pathname.toLowerCase().endsWith(".html") && PUBLIC_ASSET_EXTENSION.test(pathname)) {
    return false;
  }

  return true;
}
