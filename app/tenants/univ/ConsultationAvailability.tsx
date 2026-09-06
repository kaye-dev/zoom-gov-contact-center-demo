"use client";
import { useEffect, useState } from "react";
import type { UniversityConsultationService } from "@/lib/online-consultation-settings";

type Status = { open: boolean; services: { serviceKey: UniversityConsultationService; available: boolean }[] };
export function ConsultationAvailability({ labels }: { labels: Record<UniversityConsultationService, string> }) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => { let live = true; const load = () => fetch("/api/public/consultation-availability", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => live && setStatus(data)).catch(() => live && setStatus(null)); load(); const id = window.setInterval(load, 30_000); return () => { live = false; window.clearInterval(id); }; }, []);
  return <div className="mt-6 grid gap-3 md:grid-cols-3">{(Object.keys(labels) as UniversityConsultationService[]).map((serviceKey) => { const available = status?.open && status.services.find((item) => item.serviceKey === serviceKey)?.available; return <div className="rounded-xl border border-slate-200 p-4" key={serviceKey}><p className="font-semibold">{labels[serviceKey]}</p><p className={available ? "mt-2 text-sm text-emerald-700" : "mt-2 text-sm text-slate-500"}>{available ? "受付中" : "ただいま受付していません"}</p></div>; })}</div>;
}
