export type GroupSortKey = "name" | "updatedAt" | "contactCount";
export type GroupListSummary = { id: string; name: string; updatedAt: string | null; contactCount: number | null };

export function formatGroupUpdatedAt(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function sortContactLists<T extends GroupListSummary>(rows: readonly T[], key: GroupSortKey, direction: "asc" | "desc", locale: string): T[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => {
    if (key === "name") return (direction === "asc" ? 1 : -1) * collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
    const left = key === "updatedAt" ? (a.updatedAt ? Date.parse(a.updatedAt) : NaN) : a.contactCount;
    const right = key === "updatedAt" ? (b.updatedAt ? Date.parse(b.updatedAt) : NaN) : b.contactCount;
    const leftMissing = left === null || !Number.isFinite(left), rightMissing = right === null || !Number.isFinite(right);
    if (leftMissing || rightMissing) return leftMissing === rightMissing ? a.id.localeCompare(b.id) : leftMissing ? 1 : -1;
    return (direction === "asc" ? 1 : -1) * (left! - right!) || a.id.localeCompare(b.id);
  });
}
