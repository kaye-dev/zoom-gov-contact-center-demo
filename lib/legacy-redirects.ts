export const FAQ_LEGACY_REDIRECTS = [
  {
    source: "/life/frequently-asked-questions/procedure-faq",
    destination: "/life/frequently-asked-questions",
    permanent: false,
  },
  {
    source: "/life/frequently-asked-questions/online-service-faq",
    destination: "/life/frequently-asked-questions",
    permanent: false,
  },
  {
    source:
      "/life/frequently-asked-questions/nanao-branch-office/branch-office-services",
    destination:
      "/life/frequently-asked-questions/administrative-service-center/service-counter-guide",
    permanent: false,
  },
  {
    source:
      "/life/frequently-asked-questions/nanao-branch-office/branch-office-access",
    destination:
      "/life/frequently-asked-questions/administrative-service-center/location-and-access",
    permanent: false,
  },
  {
    source: "/life/frequently-asked-questions/nanao-branch-office/:faq*",
    destination:
      "/life/frequently-asked-questions/administrative-service-center/:faq*",
    permanent: false,
  },
  {
    source: "/life/frequently-asked-questions/safety-net-call-center/:faq*",
    destination:
      "/life/frequently-asked-questions/welfare-consultation-desk/:faq*",
    permanent: false,
  },
  {
    source:
      "/life/frequently-asked-questions/developmental-education-support/:faq*",
    destination: "/life/frequently-asked-questions/education-support/:faq*",
    permanent: false,
  },
] as const;

const EXACT_FAQ_LEGACY_REDIRECTS = new Map<string, string>(
  FAQ_LEGACY_REDIRECTS.filter(({ source }) => !source.endsWith(":faq*")).map(
    ({ source, destination }) => [source.toLowerCase(), destination],
  ),
);

const PREFIX_FAQ_LEGACY_REDIRECTS = FAQ_LEGACY_REDIRECTS.filter(({ source }) =>
  source.endsWith(":faq*"),
).map(({ source, destination }) => ({
  sourcePrefix: source.slice(0, -":faq*".length).replace(/\/$/u, ""),
  destinationPrefix: destination
    .slice(0, -":faq*".length)
    .replace(/\/$/u, ""),
}));

/** Resolves the former Next.js config redirects inside Proxy. */
export function resolveFaqLegacyRedirect(pathname: string): string | null {
  const lookupPathname = pathname.toLowerCase();
  const exact = EXACT_FAQ_LEGACY_REDIRECTS.get(lookupPathname);
  if (exact !== undefined) return exact;

  for (const { sourcePrefix, destinationPrefix } of PREFIX_FAQ_LEGACY_REDIRECTS) {
    if (lookupPathname === sourcePrefix) return destinationPrefix;
    if (lookupPathname.startsWith(`${sourcePrefix}/`)) {
      return `${destinationPrefix}${pathname.slice(sourcePrefix.length)}`;
    }
  }
  return null;
}
