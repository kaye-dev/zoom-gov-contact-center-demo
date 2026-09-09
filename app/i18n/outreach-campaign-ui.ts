import type { Locale } from "./dictionaries";

export type OutreachCampaignDictionary = {
  confirmTitle: string;
  confirmHelp: string;
  pauseHelp: string;
  previewUnavailable: string;
};

export const outreachCampaignDictionaries: Record<Locale, OutreachCampaignDictionary> = {
  ja: {
    confirmTitle: "定型案内の実行前確認",
    confirmHelp: "最新のキャンペーン設定を表示しています。実行には、連絡先グループ、通知停止、発信元、接続設定、営業時間の照合が必要です。現在は実発信が許可されていません。",
    pauseHelp: "一時停止は新規発信の抑制を要求します。接続済みの通話を終了したとは表示しません。",
    previewUnavailable: "実行前の確認には編集権限が必要です。実行準備完了または一時停止中の案内で利用できます。",
  },
  en: {
    confirmTitle: "Review recurring notification before execution",
    confirmHelp: "These are the latest campaign settings. Execution requires verification of the contact group, opt-outs, caller ID, connection settings, and business hours. Live calling is currently disabled.",
    pauseHelp: "Pausing requests that new calls be held. It does not confirm that connected calls have ended.",
    previewUnavailable: "Review requires edit permission and a notification that is ready or paused.",
  },
  "zh-Hans": {
    confirmTitle: "定期通知执行前确认",
    confirmHelp: "此处显示最新的活动设置。执行前需要核对联系人群组、退订、主叫号码、连接设置和营业时间。目前不允许实际呼叫。",
    pauseHelp: "暂停会请求停止发起新呼叫，并不表示已接通的通话已结束。",
    previewUnavailable: "执行前确认需要编辑权限，且通知必须处于就绪或暂停状态。",
  },
  "zh-Hant": {
    confirmTitle: "定期通知執行前確認",
    confirmHelp: "此處顯示最新的活動設定。執行前需要核對聯絡人群組、退訂、主叫號碼、連線設定和營業時間。目前不允許實際呼叫。",
    pauseHelp: "暫停會要求停止發起新通話，並不表示已接通的通話已結束。",
    previewUnavailable: "執行前確認需要編輯權限，且通知必須處於就緒或暫停狀態。",
  },
  ko: {
    confirmTitle: "정기 안내 실행 전 확인",
    confirmHelp: "최신 캠페인 설정입니다. 실행하려면 연락처 그룹, 수신 거부, 발신 번호, 연결 설정 및 운영 시간을 확인해야 합니다. 현재 실제 발신은 허용되지 않습니다.",
    pauseHelp: "일시 중지는 신규 발신의 억제를 요청합니다. 연결된 통화가 종료되었다는 의미는 아닙니다.",
    previewUnavailable: "실행 전 확인에는 편집 권한이 필요하며, 안내가 준비 완료 또는 일시 중지 상태여야 합니다.",
  },
};
