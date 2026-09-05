import { createElement, type ComponentType, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AdminShell } from "../app/admin/AdminShell";
import { LanguageProvider } from "../app/i18n/LanguageProvider";
import { locales } from "../app/i18n/dictionaries";

const router = { bfcacheId: "flat-test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
type WithOptionalChildren<T> = Omit<T, "children"> & { children?: ReactNode };
const Provider = LanguageProvider as ComponentType<WithOptionalChildren<ComponentProps<typeof LanguageProvider>>>;
const Shell = AdminShell as ComponentType<WithOptionalChildren<ComponentProps<typeof AdminShell>>>;
export function renderAdmin(children: ReactNode, pathname = "/admin/phone-settings") {
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
    createElement(PathnameContext.Provider, { value: pathname },
      createElement(Provider, { availableLocales: locales },
        createElement(Shell, { visibleItems: [], currentUserName: "Test Admin" }, children)))));
}
