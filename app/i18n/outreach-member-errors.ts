import type { Locale } from "./dictionaries";

type MemberErrorCode = "CAMPAIGN_REFERENCE_UNKNOWN" | "GROUP_IN_USE" | "PROVIDER_RESOURCE_CHANGED";
export type OutreachMemberErrors = Record<MemberErrorCode, string>;
export const outreachMemberErrors: Record<Locale, Record<MemberErrorCode, string>> = {
  ja: {
    CAMPAIGN_REFERENCE_UNKNOWN: "状態を確認できない定型案内があるため、所属を変更できません。Zoom側で定型案内の状態を確認してから再試行してください。",
    GROUP_IN_USE: "このグループは定型案内で使用中のため、所属を変更できません。Zoom側で利用状況を確認してください。",
    PROVIDER_RESOURCE_CHANGED: "取得後にZoom側の連絡先が変更されました。入力内容を控え、この画面を閉じてグループを開き直し、最新の内容を確認してください。",
  },
  en: {
    CAMPAIGN_REFERENCE_UNKNOWN: "Group membership cannot be changed while a campaign status is unknown. Check the campaign status in Zoom, then retry.",
    GROUP_IN_USE: "This group is in use by a campaign, so its membership cannot be changed. Check its usage in Zoom.",
    PROVIDER_RESOURCE_CHANGED: "The Zoom contact changed after it was loaded. Keep a copy of your input, close this dialog, and reopen the group to review the latest information.",
  },
  "zh-Hans": {
    CAMPAIGN_REFERENCE_UNKNOWN: "存在状态不明的外呼活动，无法更改群组成员。请在Zoom中确认活动状态后重试。",
    GROUP_IN_USE: "该群组正被外呼活动使用，无法更改成员。请在Zoom中确认使用情况。",
    PROVIDER_RESOURCE_CHANGED: "加载后Zoom联系人已发生变化。请先保留输入内容，关闭此窗口并重新打开群组，确认最新信息。",
  },
  "zh-Hant": {
    CAMPAIGN_REFERENCE_UNKNOWN: "存在狀態不明的外撥活動，無法變更群組成員。請在Zoom中確認活動狀態後重試。",
    GROUP_IN_USE: "此群組正由外撥活動使用，無法變更成員。請在Zoom中確認使用情況。",
    PROVIDER_RESOURCE_CHANGED: "載入後Zoom聯絡人已發生變更。請先保留輸入內容，關閉此視窗並重新開啟群組，確認最新資訊。",
  },
  ko: {
    CAMPAIGN_REFERENCE_UNKNOWN: "상태를 확인할 수 없는 캠페인이 있어 그룹 구성원을 변경할 수 없습니다. Zoom에서 캠페인 상태를 확인한 후 다시 시도하세요.",
    GROUP_IN_USE: "캠페인에서 이 그룹을 사용 중이므로 구성원을 변경할 수 없습니다. Zoom에서 사용 현황을 확인하세요.",
    PROVIDER_RESOURCE_CHANGED: "불러온 후 Zoom 연락처가 변경되었습니다. 입력 내용을 따로 보관하고 이 창을 닫은 후 그룹을 다시 열어 최신 정보를 확인하세요.",
  },
};
