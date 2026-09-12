import type { SiteLocale } from "@/lib/site-settings";
import { intakeDictionaries, type IntakeCopy } from "./consultation-intake";
export type VideoConsultationDictionary = { starting: string; active: string; failed: string; reset: string; intake: IntakeCopy };
export const videoConsultationDictionaries: Record<SiteLocale, VideoConsultationDictionary> = {
  ja: { intake: intakeDictionaries['ja'], reset: "相談を終了して戻る", starting: "ビデオ相談を起動しています…", active: "ビデオ相談を開いています", failed: "ビデオ相談を開始できませんでした。受付状況と通信環境を確認して、もう一度お試しください。" },
  en: { intake: intakeDictionaries['en'], reset: "End consultation and return", starting: "Starting video consultation…", active: "Video consultation is open", failed: "Could not start the video consultation. Check availability and your connection, then try again." },
  "zh-Hans": { intake: intakeDictionaries['zh-Hans'], reset: "结束咨询并返回", starting: "正在启动视频咨询…", active: "视频咨询已打开", failed: "无法启动视频咨询。请检查服务状态和网络连接，然后重试。" },
  "zh-Hant": { intake: intakeDictionaries['zh-Hant'], reset: "結束諮詢並返回", starting: "正在啟動視訊諮詢…", active: "視訊諮詢已開啟", failed: "無法啟動視訊諮詢。請檢查服務狀態和網路連線，然後重試。" },
  ko: { intake: intakeDictionaries['ko'], reset: "상담을 종료하고 돌아가기", starting: "영상 상담을 시작하고 있습니다…", active: "영상 상담이 열려 있습니다", failed: "영상 상담을 시작할 수 없습니다. 접수 상태와 네트워크 연결을 확인한 후 다시 시도해 주세요." },
};
