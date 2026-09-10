import type { AdminNavigationItemKey } from "@/app/admin/admin-navigation";

export const visibleItems: AdminNavigationItemKey[] = ["reservations", "zaad", "users", "roles", "phone-settings", "chat-settings", "online-consultation-settings", "developer-api", "language-settings", "maintenance-settings"];
export const copy = { heading: "連絡先グループ", name: "グループ名", search: "検索", save: "保存", saving: "保存中", saved: "保存しました", error: "保存できませんでした" };
export const fixture = { name: "防災連絡グループ", currentUserName: "Demo Admin" };
export async function mockSave(name: string) { return name; }

// A service-shaped adapter verifies transfer without contacting an actual API.
const localService = { async update(input: { name: string }) { return { name: input.name }; } };
export async function connectedSave(name: string) { return (await localService.update({ name })).name; }
