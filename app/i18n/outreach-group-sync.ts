import type { Locale } from "./dictionaries";

export type GroupSyncDictionary = {
  title: string; destination: string; name: string; updatedAt: string; contacts: string;
  search: string; selectAll: string; add: string; success: string; loadFailed: string;
  incomplete: string; conflict: string; accountChanged: string; resultUnknown: string; checkResult: string;
  limit: string; permission: string; detach: string; detachTitle: string; detachHelp: string;
  sharedEdit: string; sharedMemberDelete: string; unassigned: string;
};
export const groupSyncDictionaries: Record<Locale, GroupSyncDictionary> = {
  ja: {
    title: "連絡先グループを同期", destination: "追加先: {tenant}", name: "リスト名", updatedAt: "最終更新日", contacts: "連絡先数",
    search: "リスト名で検索", selectAll: "表示中のリストをすべて選択", add: "選択したリストを追加（{count}件）", success: "{count}件の連絡先グループを追加しました。",
    loadFailed: "連絡先リストを取得できませんでした。再試行してください。", incomplete: "一覧の取得が完了していません。再試行後に追加してください。",
    conflict: "リストの状態が変わりました。一覧を再取得して選び直してください。", accountChanged: "Zoomアカウントの設定が変わりました。一覧を再取得して選び直してください。",
    resultUnknown: "追加結果を確認できませんでした。「結果を確認」で登録状況を確認してください。", checkResult: "結果を確認", limit: "一度に追加できるリストは100件までです。",
    permission: "同期には全権アクセスと更新権限が必要です。", detach: "追加解除", detachTitle: "連絡先グループの追加を解除", detachHelp: "選択中の業種から追加を解除します。Zoomのリスト、他の業種、ZAADの連絡先は削除されません。",
    sharedEdit: "名前や連絡先の変更はZoomにも反映されます。同じリストを使う他の業種にも反映されます。", sharedMemberDelete: "この連絡先をZoomのリストから削除します。同じリストを使う他の業種にも反映されます。ZAADの連絡先は削除されません。", unassigned: "未指定",
  },
  en: {
    title: "Sync contact groups", destination: "Add to: {tenant}", name: "List name", updatedAt: "Last updated", contacts: "Contacts",
    search: "Search by list name", selectAll: "Select all visible lists", add: "Add selected lists ({count})", success: "Added {count} contact groups.",
    loadFailed: "Unable to load contact lists. Please try again.", incomplete: "The list inventory is incomplete. Retry before adding lists.", conflict: "The lists have changed. Reload and select them again.", accountChanged: "The Zoom account settings have changed. Reload and select lists again.",
    resultUnknown: "The result could not be confirmed. Use Check result to verify the addition.", checkResult: "Check result", limit: "You can add up to 100 lists at a time.", permission: "Sync requires full access and update permission.",
    detach: "Remove from this industry", detachTitle: "Remove contact group from this industry", detachHelp: "Remove this group from the selected industry. The Zoom list, other industries, and ZAAD contacts will be retained.",
    sharedEdit: "Name and contact changes also update Zoom and other industries using this list.", sharedMemberDelete: "Delete this contact from the Zoom list. This also affects other industries using this list. ZAAD contacts will be retained.", unassigned: "Unassigned",
  },
  "zh-Hans": {
    title: "同步联系人群组", destination: "添加到：{tenant}", name: "列表名称", updatedAt: "最后更新", contacts: "联系人数",
    search: "按列表名称搜索", selectAll: "选择所有当前显示的列表", add: "添加所选列表（{count}个）", success: "已添加{count}个联系人群组。",
    loadFailed: "无法获取联系人列表，请重试。", incomplete: "列表尚未获取完整，请重试后再添加。", conflict: "列表状态已更改，请重新获取并选择。", accountChanged: "Zoom账户设置已更改，请重新获取并选择列表。",
    resultUnknown: "无法确认添加结果，请使用“确认结果”检查。", checkResult: "确认结果", limit: "一次最多添加100个列表。", permission: "同步需要完整访问权限和更新权限。",
    detach: "取消添加", detachTitle: "取消添加联系人群组", detachHelp: "从所选行业中移除此群组。不会删除Zoom列表、其他行业或ZAAD联系人。",
    sharedEdit: "名称和联系人的更改也会同步到Zoom及使用同一列表的其他行业。", sharedMemberDelete: "将从Zoom列表中删除此联系人，也会影响使用同一列表的其他行业。不会删除ZAAD联系人。", unassigned: "未指定",
  },
  "zh-Hant": {
    title: "同步聯絡人群組", destination: "新增至：{tenant}", name: "清單名稱", updatedAt: "最後更新", contacts: "聯絡人數",
    search: "依清單名稱搜尋", selectAll: "選取所有目前顯示的清單", add: "新增所選清單（{count}個）", success: "已新增{count}個聯絡人群組。",
    loadFailed: "無法取得聯絡人清單，請重試。", incomplete: "清單尚未取得完整，請重試後再新增。", conflict: "清單狀態已變更，請重新取得並選取。", accountChanged: "Zoom帳戶設定已變更，請重新取得並選取清單。",
    resultUnknown: "無法確認新增結果，請使用「確認結果」檢查。", checkResult: "確認結果", limit: "一次最多新增100個清單。", permission: "同步需要完整存取權限和更新權限。",
    detach: "取消新增", detachTitle: "取消新增聯絡人群組", detachHelp: "從所選行業中移除此群組。不會刪除Zoom清單、其他行業或ZAAD聯絡人。",
    sharedEdit: "名稱和聯絡人的變更也會同步至Zoom及使用同一清單的其他行業。", sharedMemberDelete: "將從Zoom清單中刪除此聯絡人，也會影響使用同一清單的其他行業。不會刪除ZAAD聯絡人。", unassigned: "未指定",
  },
  ko: {
    title: "연락처 그룹 동기화", destination: "추가 대상: {tenant}", name: "목록 이름", updatedAt: "최종 업데이트", contacts: "연락처 수",
    search: "목록 이름으로 검색", selectAll: "표시된 모든 목록 선택", add: "선택한 목록 추가({count}개)", success: "연락처 그룹 {count}개를 추가했습니다.",
    loadFailed: "연락처 목록을 가져오지 못했습니다. 다시 시도하세요.", incomplete: "목록을 모두 가져오지 못했습니다. 다시 시도한 후 추가하세요.", conflict: "목록 상태가 변경되었습니다. 다시 불러와 선택하세요.", accountChanged: "Zoom 계정 설정이 변경되었습니다. 목록을 다시 불러와 선택하세요.",
    resultUnknown: "추가 결과를 확인하지 못했습니다. 결과 확인을 눌러 확인하세요.", checkResult: "결과 확인", limit: "한 번에 최대 100개의 목록을 추가할 수 있습니다.", permission: "동기화에는 전체 액세스 및 업데이트 권한이 필요합니다.",
    detach: "추가 해제", detachTitle: "연락처 그룹 추가 해제", detachHelp: "선택한 업종에서 그룹 추가를 해제합니다. Zoom 목록, 다른 업종 및 ZAAD 연락처는 삭제되지 않습니다.",
    sharedEdit: "이름과 연락처 변경은 Zoom 및 같은 목록을 사용하는 다른 업종에도 반영됩니다.", sharedMemberDelete: "이 연락처를 Zoom 목록에서 삭제합니다. 같은 목록을 사용하는 다른 업종에도 반영됩니다. ZAAD 연락처는 삭제되지 않습니다.", unassigned: "미지정",
  },
};
