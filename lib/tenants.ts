import {
  normalizeOriginHostname,
  normalizeRequestHostname,
} from "./hostname";

/**
 * Industry demo sites served from this single deployment. The registry is the
 * source of truth on purpose: adding an industry must not require a database
 * migration or a new Vercel environment variable.
 */
export const TENANT_KEYS = ["lg", "univ"] as const;

export type TenantKey = (typeof TENANT_KEYS)[number];

export const DEFAULT_TENANT_KEY: TenantKey = "lg";

export type TenantFeatures = {
  /** 防災行政無線の登録フォームと ZAAD 連携（自治体のみ） */
  disasterRadio: boolean;
  /** 対象者別ナビゲーションと /audience/[slug] */
  audienceNavigation: boolean;
  /** オンライン相談（今すぐ相談）ページ */
  onlineConsultation: boolean;
  /** 学生支援ポータルと大学専用の公開ルート */
  universityPortal: boolean;
  /** 大学テナント専用のオンライン相談設定管理 */
  onlineConsultationAdmin: boolean;
};

/**
 * Document metadata for one tenant.
 *
 * Page metadata is rendered on the server, where the visitor's locale is not
 * known yet (the locale lives in localStorage and is applied on the client), so
 * these values stay single-locale exactly as the previous hardcoded metadata
 * did. They move into the tenant content dictionary once it exists.
 */
export type TenantMetadata = {
  /** `<title>` for the site root. */
  title: string;
  description: string;
  /** Short site name used as a title suffix on subordinate pages. */
  shortName: string;
};

export type TenantDefinition = {
  key: TenantKey;
  metadata: TenantMetadata;
  /** Canonical production hostname. Must be attached to the Vercel project. */
  productionHost: string;
  /** Local development label, used as `<label>.localhost`. */
  devHostLabel: string;
  /** Directory name under `docs/knowledge-base/` holding the FAQ corpus. */
  knowledgeBaseDir: string;
  /** Organization name asserted while parsing the FAQ corpus. */
  faqOrganizationName: string;
  features: TenantFeatures;
  adminSettings: readonly ("phone-settings" | "chat-settings" | "online-consultation-settings")[];
};

const TENANT_DEFINITIONS: Record<TenantKey, TenantDefinition> = {
  lg: {
    key: "lg",
    metadata: {
      title: "未来市公式ウェブサイト",
      description:
        "未来市の公式ウェブサイトです。くらしの手続き、子育て・教育、防災、ごみ・リサイクル、施設案内などの行政情報をご案内します。お困りのことは AI やお電話でご相談いただけます。",
      shortName: "未来市",
    },
    productionHost: "demo.lg.keien.dev",
    devHostLabel: "lg",
    knowledgeBaseDir: "自治体-基礎自治体-未来市",
    faqOrganizationName: "未来市",
    adminSettings: ["phone-settings", "chat-settings", "online-consultation-settings"],
    features: {
      disasterRadio: true,
      audienceNavigation: false,
      onlineConsultation: false,
      universityPortal: false,
      onlineConsultationAdmin: false,
    },
  },
  univ: {
    key: "univ",
    metadata: {
      title: "未来大学 学生支援ポータル",
      description:
        "未来大学の学生支援ポータルです。入学案内、履修・授業、学生生活、奨学金、キャリア、オンライン相談に関する情報をご案内します。",
      shortName: "未来大学",
    },
    productionHost: "demo.univ.keien.dev",
    devHostLabel: "univ",
    knowledgeBaseDir: "大学-未来大学",
    faqOrganizationName: "未来大学",
    adminSettings: ["phone-settings", "chat-settings", "online-consultation-settings"],
    features: {
      disasterRadio: false,
      audienceNavigation: false,
      onlineConsultation: true,
      universityPortal: true,
      onlineConsultationAdmin: true,
    },
  },
};

export const TENANTS: readonly TenantDefinition[] = TENANT_KEYS.map(
  (key) => TENANT_DEFINITIONS[key],
);

const DEV_HOST_SUFFIX = ".localhost";

export function isTenantKey(value: string): value is TenantKey {
  return (TENANT_KEYS as readonly string[]).includes(value);
}

export function getTenant(key: TenantKey): TenantDefinition {
  return TENANT_DEFINITIONS[key];
}

export function getDefaultTenant(): TenantDefinition {
  return TENANT_DEFINITIONS[DEFAULT_TENANT_KEY];
}

/** Production HTTPS origins for every registered tenant. */
export function listTenantProductionOrigins(): string[] {
  return TENANTS.map((tenant) => `https://${tenant.productionHost}`);
}

export function findTenantByProductionHostname(
  hostname: string,
): TenantDefinition | null {
  return (
    TENANTS.find((tenant) => tenant.productionHost === hostname) ?? null
  );
}

type TenantEnvironment = {
  [key: string]: string | undefined;
  APP_CANONICAL_ORIGIN?: string;
};

/**
 * Resolves the tenant that owns an incoming request.
 *
 * Unregistered hosts (Vercel deployment URLs, LAN addresses, tunnels) fall back
 * to the tenant owning `APP_CANONICAL_ORIGIN`, and finally to the default
 * tenant, so the site never fails to render because of an unexpected host.
 */
export function resolveTenantFromHost(
  host: string | null | undefined,
  env: TenantEnvironment = process.env,
): TenantDefinition {
  const hostname = normalizeRequestHostname(host);

  if (hostname !== null) {
    const productionTenant = findTenantByProductionHostname(hostname);
    if (productionTenant !== null) return productionTenant;

    if (hostname.endsWith(DEV_HOST_SUFFIX)) {
      const label = hostname.slice(0, -DEV_HOST_SUFFIX.length);
      const devTenant = TENANTS.find(
        (tenant) => tenant.devHostLabel === label,
      );
      if (devTenant !== undefined) return devTenant;
    }
  }

  const canonicalHostname = normalizeOriginHostname(env.APP_CANONICAL_ORIGIN);
  const canonicalTenant =
    canonicalHostname === null
      ? null
      : findTenantByProductionHostname(canonicalHostname);

  return canonicalTenant ?? getDefaultTenant();
}
