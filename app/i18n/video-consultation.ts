import type { SiteLocale } from "@/lib/site-settings";
import { intakeDictionaries, type IntakeCopy } from "./consultation-intake";
export type VideoConsultationDictionary = { starting: string; active: string; ended: string; returnHelp: string; failed: string; reset: string; intake: IntakeCopy };
export const videoConsultationDictionaries: Record<SiteLocale, VideoConsultationDictionary> = {
  ja: { intake: intakeDictionaries['ja'], ended: "相談は終了しました。アンケートが表示された場合は、そのままご回答いただけます。", returnHelp: "アンケートに回答する場合は、送信を終えてから相談一覧へ戻ってください。戻ると通話画面が閉じます。", reset: "画面を閉じて相談一覧に戻る", starting: "ビデオ相談を起動しています…", active: "ビデオ相談を開いています", failed: "ビデオ相談を開始できませんでした。受付状況と通信環境を確認して、もう一度お試しください。" },
  en: { intake: intakeDictionaries['en'], ended: "The consultation has ended. If a survey appears, you can answer it here.", returnHelp: "If you choose to answer the survey, submit it before returning to consultations. Returning closes the call screen.", reset: "Close and return to consultations", starting: "Starting video consultation…", active: "Video consultation is open", failed: "Could not start the video consultation. Check availability and your connection, then try again." },
  "zh-Hans": { intake: intakeDictionaries['zh-Hans'], ended: "咨询已结束。如显示问卷，您可以继续在此填写。", returnHelp: "如需填写问卷，请提交后再返回咨询列表。返回会关闭通话画面。", reset: "关闭并返回咨询列表", starting: "正在启动视频咨询…", active: "视频咨询已打开", failed: "无法启动视频咨询。请检查服务状态和网络连接，然后重试。" },
  "zh-Hant": { intake: intakeDictionaries['zh-Hant'], ended: "諮詢已結束。如顯示問卷，您可以繼續在此填寫。", returnHelp: "如需填寫問卷，請提交後再返回諮詢列表。返回會關閉通話畫面。", reset: "關閉並返回諮詢列表", starting: "正在啟動視訊諮詢…", active: "視訊諮詢已開啟", failed: "無法啟動視訊諮詢。請檢查服務狀態和網路連線，然後重試。" },
  ko: { intake: intakeDictionaries['ko'], ended: "상담이 종료되었습니다. 설문이 표시되면 여기에서 응답할 수 있습니다.", returnHelp: "설문에 응답하려면 제출을 마친 후 상담 목록으로 돌아가세요. 돌아가면 통화 화면이 닫힙니다.", reset: "화면을 닫고 상담 목록으로 돌아가기", starting: "영상 상담을 시작하고 있습니다…", active: "영상 상담이 열려 있습니다", failed: "영상 상담을 시작할 수 없습니다. 접수 상태와 네트워크 연결을 확인한 후 다시 시도해 주세요." },
};
