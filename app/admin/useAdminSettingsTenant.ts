"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TenantKey } from "@/lib/tenants";
import {
  ADMIN_SETTINGS_RESOURCES,
  type AdminSettingsResource,
} from "@/lib/admin-settings-tenant";
import { SettingsRequestSequence } from "@/lib/admin-settings-request";
import { useI18n } from "@/app/i18n/LanguageProvider";

export function useAdminSettingsTenant<T>(
  initialSettings: T,
  initialTenant: TenantKey,
  resource: AdminSettingsResource,
  onLoad: () => void,
) {
  const { t } = useI18n();
  const copy = t.admin.industrySettings;
  const router = useRouter();
  const pathname = usePathname();
  const [tenantKey, setTenantKey] = useState(initialTenant);
  const [settings, setSettings] = useState(initialSettings);
  const [baseline, setBaseline] = useState(initialSettings);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pending, setPending] = useState<{
    tenant?: TenantKey;
    href?: string;
    label: string;
  } | null>(null);
  const [extras, setExtras] = useState<Record<string, unknown>>({});
  const sequence = useRef(new SettingsRequestSequence());
  const abort = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const dirty = JSON.stringify(settings) !== JSON.stringify(baseline);
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });
  useEffect(
    () => () => {
      abort.current?.abort();
      sequence.current.next();
    },
    [],
  );

  async function load(next: TenantKey) {
    if (saving.current) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const request = sequence.current.next();
    setTenantKey(next);
    setLoading(true);
    setLoadError(false);
    setExtras({});
    setPending(null);
    const url = new URL(window.location.href);
    const changing = url.searchParams.get("tenant") !== next;
    if (changing) {
      const view = url.searchParams.get("view");
      url.search = "";
      url.searchParams.set("tenant", next);
      if (view) url.searchParams.set("view", view);
      router.push(url.pathname + url.search, { scroll: false });
      return; // The keyed server page loads the new scope.
    }
    try {
      const response = await fetch(`/api/admin/${resource}?tenant=${next}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json();
      if (!sequence.current.current(request)) return;
      if (
        !response.ok ||
        body.tenantKey !== next ||
        body.settings === undefined
      )
        throw new Error("settings load failed");
      setSettings(body.settings);
      setBaseline(body.settings);
      setExtras(body);
      onLoadRef.current();
    } catch {
      if (sequence.current.current(request) && !controller.signal.aborted)
        setLoadError(true);
    } finally {
      if (sequence.current.current(request)) setLoading(false);
    }
  }
  function select(next: TenantKey | "") {
    if (next === "") {
      if (saving.current) return;
      if (dirty && !loadError) setPending({ href: pathname, label: copy.placeholder });
      else router.push(pathname);
      return;
    }
    if (next === tenantKey || saving.current) return;
    if (dirty && !loadError)
      setPending({ tenant: next, label: copy.names[next] });
    else void load(next);
  }
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const navigate = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        anchor.target === "_blank"
      )
        return;
      const url = new URL(anchor.href);
      if (
        url.origin !== location.origin ||
        !ADMIN_SETTINGS_RESOURCES.some((r) => url.pathname === `/admin/${r}`)
      )
        return;
      url.searchParams.set("tenant", tenantKey);
      event.preventDefault();
      event.stopPropagation();
      if (saving.current) return;
      if (url.pathname === pathname) return;
      if (dirty && !loadError)
        setPending({
          href: url.pathname + url.search,
          label:
            anchor.textContent?.trim() ||
            anchor.getAttribute("aria-label") ||
            "",
        });
      else router.push(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [
    dirty,
    isSubmitting,
    loadError,
    tenantKey,
    copy,
    pathname,
    router,
  ]);
  async function save(value: T, payload: unknown = value) {
    if (loading || loadError || saving.current)
      throw new Error("settings unavailable");
    const target = tenantKey,
      request = sequence.current.next();
    saving.current = true;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/${resource}?tenant=${target}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (
        !sequence.current.current(request) ||
        !response.ok ||
        body?.tenantKey !== target ||
        body.settings === undefined
      )
        throw new Error("settings save failed");
      setSettings(body.settings);
      setBaseline(body.settings);
      return body.settings as T;
    } finally {
      saving.current = false;
      if (sequence.current.current(request)) setIsSubmitting(false);
    }
  }
  function discard() {
    const next = pending;
    setPending(null);
    if (!next) return;
    if (next.tenant) void load(next.tenant);
    else if (next.href) router.push(next.href);
  }
  return {
    tenantKey,
    settings,
    setSettings,
    dirty,
    loading,
    loadError,
    isSubmitting,
    pending,
    extras,
    select,
    retry: () => void load(tenantKey),
    cancel: () => {
      setPending(null);
    },
    discard,
    save,
    copy,
    tenantName: copy.names[tenantKey],
  };
}
