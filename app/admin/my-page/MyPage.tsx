"use client";

import { useI18n } from "@/app/i18n/LanguageProvider";
import { useAdminNavigationContext } from "../AdminShell";
import { MyPageView } from "./MyPageView";

export function MyPage(props: { name: string; email: string; denied: boolean }) {
  const { t } = useI18n();
  const { model } = useAdminNavigationContext();
  return <MyPageView {...props} hasAccess={model.primaryItems.length > 0} copy={t.admin.myPage} />;
}
