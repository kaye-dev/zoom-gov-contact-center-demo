import { useI18n } from "@/app/i18n/LanguageProvider";
export function OutreachTableSkeleton({ columns }: { columns: number }) {
 const {t}=useI18n();
 return <tr><td colSpan={columns} className="px-4 py-3"><div role="status" aria-label={t.admin.zaad.common.loading} className="space-y-4">{[0,1,2].map(row=><div key={row} className="h-5 animate-pulse rounded bg-surface-hover motion-reduce:animate-none" />)}</div></td></tr>;
}
