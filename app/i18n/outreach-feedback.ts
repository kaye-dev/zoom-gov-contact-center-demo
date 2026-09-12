import type { Locale } from "./dictionaries";
export type OutreachFeedbackDictionary = { dismiss: string; syncCounts: string };
export const outreachFeedbackDictionaries: Record<Locale, OutreachFeedbackDictionary> = {
  ja: { dismiss: "通知を閉じる", syncCounts: "同期済み {synced}件・失敗 {failed}件・未処理 {pending}件" },
  en: { dismiss: "Dismiss notification", syncCounts: "Synced: {synced}; failed: {failed}; pending: {pending}" },
  "zh-Hans": { dismiss: "关闭通知", syncCounts: "已同步 {synced} 条；失败 {failed} 条；待处理 {pending} 条" },
  "zh-Hant": { dismiss: "關閉通知", syncCounts: "已同步 {synced} 筆；失敗 {failed} 筆；待處理 {pending} 筆" },
  ko: { dismiss: "알림 닫기", syncCounts: "동기화 완료 {synced}건 · 실패 {failed}건 · 미처리 {pending}건" },
};
