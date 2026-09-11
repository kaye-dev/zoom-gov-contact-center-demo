import type { Locale } from "@/app/i18n/dictionaries";
const keys=["title","help","bodyMissing","voiceUnknown","imported","select","language","action","saved","restriction","detail","source","showBody","hideBody"] as const;
const rows:Record<Locale,string[]>={
ja:["Zoomメッセージの同期","Zoomの音声アセットを選択して取り込みます。読み上げ本文は未取得として保持します。Zoom側の音声は変更しません。","本文未取得","音声情報なし","取り込み済み","選択","言語","取り込む","音声メッセージを{count}件取り込みました。","本文未取得のため、本文編集・読み上げ生成・本文を必要とする配信には使用できません。","取り込んだ音声メッセージ","音声はZoomに保持されています。","読み上げ本文を表示","読み上げ本文を閉じる"],
en:["Sync Zoom messages","Select Zoom audio assets to import. Speech text remains unavailable. Audio in Zoom is unchanged.","Text unavailable","Voice unavailable","Imported","Select","Language","Import","Imported {count} audio messages.","Text editing, speech generation and delivery requiring text are unavailable.","Imported audio message","Audio remains in Zoom.","Show speech text","Hide speech text"],
"zh-Hans":["同步Zoom消息","选择Zoom音频资源并导入。朗读文本保持未获取状态，不更改Zoom音频。","文本未获取","无语音信息","已导入","选择","语言","导入","已导入{count}条音频消息。","文本未获取，无法编辑文本、生成语音或用于需要文本的发送。","已导入的音频消息","音频保留在Zoom中。","显示朗读文本","收起朗读文本"],
"zh-Hant":["同步Zoom訊息","選擇Zoom音訊資源並匯入。朗讀文字保持未取得狀態，不變更Zoom音訊。","文字未取得","無語音資訊","已匯入","選擇","語言","匯入","已匯入{count}則音訊訊息。","文字未取得，無法編輯文字、產生語音或用於需要文字的傳送。","已匯入的音訊訊息","音訊保留在Zoom中。","顯示朗讀文字","收合朗讀文字"],
ko:["Zoom 메시지 동기화","Zoom 오디오 자산을 선택하여 가져옵니다. 읽기 본문은 미확인 상태로 유지하며 Zoom 오디오는 변경하지 않습니다.","본문 미확인","음성 정보 없음","가져옴","선택","언어","가져오기","오디오 메시지 {count}개를 가져왔습니다.","본문 편집, 음성 생성 및 본문이 필요한 발송에 사용할 수 없습니다.","가져온 오디오 메시지","오디오는 Zoom에 유지됩니다.","읽기 본문 표시","읽기 본문 닫기"]};
export const messageImportDictionaries=Object.fromEntries(Object.entries(rows).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[key,values[i]]))])) as Record<Locale,Record<typeof keys[number],string>>;

export type MessageImportDictionary = (typeof messageImportDictionaries)[Locale];

const editKeys=["help","replace","bodyHelp","effect","save","saved","unlink","unlinkHelp","unlinked","source","restricted","confirmTitle"] as const;
const editRows:Record<Locale,string[]>={
ja:["保存するとZoom Contact Centerの音声アイテムを更新します。","読み上げ本文・音声を変更する","本文を取得できた場合は初期入力しています。本文未取得の場合は、新しい全文を入力してください。","この音声を使用するZoom側のフローにも変更が反映されます。","Zoomに保存","Zoomのメッセージを更新しました。","取り込みを解除","サイトの一覧から削除します。Zoom側の音声と過去の履歴は残ります。同期から再び取り込めます。","取り込みを解除しました。Zoom側の音声は残っています。","サイトで入力した本文（Zoomから取得した本文ではありません）","この音声は本文を必要とする配信には使用できません。","Zoomの音声を更新しますか？"],
en:["Saving updates the audio item in Zoom Contact Center.","Change speech text and voice","Retrieved text is prefilled. If text is unavailable, enter the full replacement.","Changes also affect Zoom flows using this audio.","Save to Zoom","Updated the Zoom message.","Remove import","Remove from this site. Zoom audio and historical records remain. You can import it again.","Import removed. Audio remains in Zoom.","Text entered on this site (not retrieved from Zoom)","This audio cannot be used for delivery requiring text.","Update the Zoom audio?"],
"zh-Hans":["保存将更新Zoom Contact Center中的音频项目。","更改朗读文本和语音","已获取的文本会预填。未获取文本时，请输入完整的新文本。","更改也会影响使用此音频的Zoom流程。","保存到Zoom","已更新Zoom消息。","解除导入","从本站列表移除。Zoom音频和历史记录会保留，可再次导入。","已解除导入，Zoom音频已保留。","在本站输入的文本（并非从Zoom获取）","此音频不能用于需要文本的发送。","要更新Zoom音频吗？"],
"zh-Hant":["儲存將更新Zoom Contact Center中的音訊項目。","變更朗讀文字和語音","已取得的文字會預填。未取得文字時，請輸入完整的新文字。","變更也會影響使用此音訊的Zoom流程。","儲存至Zoom","已更新Zoom訊息。","解除匯入","從本站清單移除。Zoom音訊和歷史紀錄會保留，可再次匯入。","已解除匯入，Zoom音訊已保留。","在本站輸入的文字（並非從Zoom取得）","此音訊不能用於需要文字的傳送。","要更新Zoom音訊嗎？"],
ko:["저장하면 Zoom Contact Center의 오디오 항목이 업데이트됩니다.","읽기 텍스트 및 음성 변경","가져온 텍스트는 미리 입력됩니다. 텍스트가 없으면 전체 내용을 입력하세요.","이 오디오를 사용하는 Zoom 흐름에도 변경 사항이 반영됩니다.","Zoom에 저장","Zoom 메시지를 업데이트했습니다.","가져오기 해제","이 사이트 목록에서 삭제합니다. Zoom 오디오와 과거 기록은 유지되며 다시 가져올 수 있습니다.","가져오기를 해제했습니다. Zoom 오디오는 유지됩니다.","이 사이트에서 입력한 텍스트 (Zoom에서 가져온 텍스트가 아님)","이 오디오는 텍스트가 필요한 발신에 사용할 수 없습니다.","Zoom 오디오를 업데이트할까요?"]};
export const messageEditDictionaries=Object.fromEntries(Object.entries(editRows).map(([locale,values])=>[locale,Object.fromEntries(editKeys.map((key,i)=>[key,values[i]]))])) as Record<Locale,Record<typeof editKeys[number],string>>;

export const audioPlaybackDictionaries:Record<Locale,{load:string;loading:string;failed:string;retry:string;unknown:string;label:string;source:string;bodyLabel:string;cached:string}>={
ja:{bodyLabel:"読み上げ本文",cached:"前回取得した参考本文",load:"音声を読み込む",loading:"音声を取得中…",failed:"音声を取得できませんでした。",retry:"再試行",unknown:"本文の取得状況は未確認です。",label:"音声の再生・一時停止",source:"Zoomから取得した本文"},
en:{bodyLabel:"Spoken text",cached:"Previously retrieved reference text",load:"Load audio",loading:"Loading audio…",failed:"Unable to load audio.",retry:"Retry",unknown:"Text availability is unverified.",label:"Play or pause audio",source:"Text retrieved from Zoom"},
"zh-Hans":{bodyLabel:"朗读文本",cached:"上次获取的参考文本",load:"加载音频",loading:"正在加载音频…",failed:"无法加载音频。",retry:"重试",unknown:"文本获取情况尚未确认。",label:"播放或暂停音频",source:"从Zoom获取的文本"},
"zh-Hant":{bodyLabel:"朗讀文字",cached:"上次取得的參考文字",load:"載入音訊",loading:"正在載入音訊…",failed:"無法載入音訊。",retry:"重試",unknown:"文字取得情況尚未確認。",label:"播放或暫停音訊",source:"從Zoom取得的文字"},
ko:{bodyLabel:"읽어 줄 본문",cached:"이전에 가져온 참고 본문",load:"오디오 불러오기",loading:"오디오 불러오는 중…",failed:"오디오를 불러오지 못했습니다.",retry:"다시 시도",unknown:"텍스트 제공 여부를 확인하지 못했습니다.",label:"오디오 재생 및 일시정지",source:"Zoom에서 가져온 텍스트"}};

export type MessageEditDictionary = (typeof messageEditDictionaries)[Locale];
export type AudioPlaybackDictionary = (typeof audioPlaybackDictionaries)[Locale];
