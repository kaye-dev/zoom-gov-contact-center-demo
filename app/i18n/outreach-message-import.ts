import type { Locale } from "@/app/i18n/dictionaries";
const keys=["title","help","bodyMissing","voiceUnknown","imported","select","language","action","saved","restriction","detail","source"] as const;
const rows:Record<Locale,string[]>={
ja:["Zoomメッセージの同期","Zoomの音声アセットを選択して取り込みます。読み上げ本文は未取得として保持します。Zoom側の音声は変更しません。","本文未取得","音声情報なし","取り込み済み","選択","言語","取り込む","音声メッセージを{count}件取り込みました。","本文未取得のため、本文編集・読み上げ生成・本文を必要とする配信には使用できません。","取り込んだ音声メッセージ","音声はZoomに保持されています。"],
en:["Sync Zoom messages","Select Zoom audio assets to import. Speech text remains unavailable. Audio in Zoom is unchanged.","Text unavailable","Voice unavailable","Imported","Select","Language","Import","Imported {count} audio messages.","Text editing, speech generation and delivery requiring text are unavailable.","Imported audio message","Audio remains in Zoom."],
"zh-Hans":["同步Zoom消息","选择Zoom音频资源并导入。朗读文本保持未获取状态，不更改Zoom音频。","文本未获取","无语音信息","已导入","选择","语言","导入","已导入{count}条音频消息。","文本未获取，无法编辑文本、生成语音或用于需要文本的发送。","已导入的音频消息","音频保留在Zoom中。"],
"zh-Hant":["同步Zoom訊息","選擇Zoom音訊資源並匯入。朗讀文字保持未取得狀態，不變更Zoom音訊。","文字未取得","無語音資訊","已匯入","選擇","語言","匯入","已匯入{count}則音訊訊息。","文字未取得，無法編輯文字、產生語音或用於需要文字的傳送。","已匯入的音訊訊息","音訊保留在Zoom中。"],
ko:["Zoom 메시지 동기화","Zoom 오디오 자산을 선택하여 가져옵니다. 읽기 본문은 미확인 상태로 유지하며 Zoom 오디오는 변경하지 않습니다.","본문 미확인","음성 정보 없음","가져옴","선택","언어","가져오기","오디오 메시지 {count}개를 가져왔습니다.","본문 편집, 음성 생성 및 본문이 필요한 발송에 사용할 수 없습니다.","가져온 오디오 메시지","오디오는 Zoom에 유지됩니다."]};
export type MessageImportDictionary = Record<typeof keys[number],string>;
export const messageImportDictionaries=Object.fromEntries(Object.entries(rows).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[key,values[i]]))])) as Record<Locale,Record<typeof keys[number],string>>;
