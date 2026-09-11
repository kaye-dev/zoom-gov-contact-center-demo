"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Checkbox } from "@/app/components/Checkbox";
import { Select } from "@/app/components/Select";
import { useI18n } from "@/app/i18n/LanguageProvider";
import { MUNICIPAL_CONSENT_VERSION, MUNICIPAL_TOPICS, parseMunicipalRegistration, type MunicipalTopic } from "@/lib/zaad/municipal/contracts";
import { registrationInputClass as input, outreachPrimary as primary, outreachSecondary as secondary } from "./StudentNotificationRegistration";
export function MunicipalNotificationRegistration() {
  const { t } = useI18n(), d = t.municipalOutreach;
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [district, setDistrict] = useState("");
  const [topics, setTopics] = useState<MunicipalTopic[]>([]), [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState(""), [end, setEnd] = useState(""), [consent, setConsent] = useState(false);
  const [stage, setStage] = useState<"input" | "confirm" | "sending" | "accepted">("input"), [error, setError] = useState("");
  const operation = useRef<string | null>(null), busy = useRef(false), heading = useRef<HTMLHeadingElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const payload = () => ({ operationKey: operation.current ?? "preview_00000000", name, phone, district, topics, availability: topics.includes("elder-watch") ? { weekdays: days, windows: [{ start, end }] } : null, consent, consentVersion: MUNICIPAL_CONSENT_VERSION });
  function report(message: string) { setError(message); requestAnimationFrame(() => errorRef.current?.focus()); }
  function review() {
    try { parseMunicipalRegistration(payload()); setError(""); setStage("confirm"); requestAnimationFrame(() => heading.current?.focus()); }
    catch { report(d.invalid); }
  }
  async function submit() {
    if (busy.current) return;
    busy.current = true; operation.current ??= crypto.randomUUID(); setStage("sending"); setError("");
    try {
      const response = await fetch("/api/municipal-notification-registrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()), cache: "no-store" });
      if (!response.ok) throw new Error("REGISTRATION_FAILED");
      const result = await response.json();
      if (result.status !== "accepted") throw new Error("INVALID_RESPONSE");
      setStage("accepted"); requestAnimationFrame(() => heading.current?.focus());
    } catch { setStage("confirm"); report(d.error); }
    finally { busy.current = false; }
  }
  return <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12" aria-busy={stage === "sending"}>
    <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold tracking-tight sm:text-3xl">{stage === "accepted" ? d.accepted : d.title}</h1>
    <p className="mt-4 leading-7 text-muted">{stage === "accepted" ? d.acceptedHelp : d.intro}</p>
    {error && <p ref={errorRef} role="alert" tabIndex={-1} className="mt-5 rounded-lg border border-line bg-surface px-4 py-3 text-error">{error}</p>}
    {stage === "input" ? <form className="mt-8 space-y-6" onSubmit={event => { event.preventDefault(); review(); }}>
      <label className="block font-medium">{d.name}<input className={input} required maxLength={100} autoComplete="name" value={name} onChange={event => { setName(event.target.value); operation.current = null; }} /></label>
      <label className="block font-medium">{d.phone}<input className={input} required type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={event => { setPhone(event.target.value); operation.current = null; }} /></label>
      <label className="block font-medium">{d.district}<Select containerClassName="mt-2" required value={district} onChange={event => { setDistrict(event.target.value); operation.current = null; }}><option value="">{d.choose}</option>{Object.entries(d.districts).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label>
      <fieldset className="space-y-3"><legend className="mb-3 font-semibold">{d.notices}</legend>{MUNICIPAL_TOPICS.map(topic => <label key={topic} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4"><Checkbox checked={topics.includes(topic)} onChange={event => { setTopics(current => event.target.checked ? [...current, topic] : current.filter(value => value !== topic)); operation.current = null; }} /><span>{d.topics[topic]}</span></label>)}</fieldset>
      {topics.includes("elder-watch") && <fieldset className="rounded-lg border border-line bg-surface p-4"><legend className="px-1 font-semibold">{d.days}</legend><div className="flex flex-wrap gap-4">{d.weekdays.map((day, index) => <label className="flex items-center gap-2" key={day}><Checkbox checked={days.includes(index)} onChange={event => { setDays(current => event.target.checked ? [...current, index] : current.filter(value => value !== index)); operation.current = null; }} />{day}</label>)}</div><div className="mt-4 grid grid-cols-2 gap-4"><label>{d.start}<input className={input} required type="time" value={start} onChange={event => { setStart(event.target.value); operation.current = null; }} /></label><label>{d.end}<input className={input} required type="time" value={end} onChange={event => { setEnd(event.target.value); operation.current = null; }} /></label></div><p className="mt-3 text-sm text-muted">{d.availability}</p></fieldset>}
      <p className="text-sm leading-6 text-muted">{d.boundary}</p><p className="text-sm leading-6">{d.consent}</p>
      <label className="flex items-start gap-3"><Checkbox required checked={consent} onChange={event => { setConsent(event.target.checked); operation.current = null; }} /><span>{d.consentLabel}</span></label>
      <button className={primary} type="submit">{d.confirm}</button>
    </form> : stage === "accepted" ? <div className="mt-6 space-y-4"><p className="text-sm leading-6 text-muted">{d.boundary}</p><Link className={secondary + " inline-flex"} href="/">{d.home}</Link></div> : <div className="mt-8 space-y-6">
      <dl className="divide-y divide-line rounded-lg border border-line px-4">{[[d.name, name], [d.phone, phone], [d.district, d.districts[district]], [d.notices, topics.map(topic => d.topics[topic]).join(" / ")], ...(topics.includes("elder-watch") ? [[d.days, days.map(day => d.weekdays[day]).join(" / ")], [d.availability, `${start}–${end}`]] : [])].map(([label, value]) => <div key={label} className="py-4"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
      <p className="text-sm leading-6 text-muted">{d.boundary}</p><p className="text-sm leading-6">{d.consent}</p>
      <div className="flex flex-wrap gap-3"><button className={secondary} disabled={stage === "sending"} onClick={() => { setStage("input"); setError(""); }}>{d.back}</button><button className={primary} disabled={stage === "sending"} onClick={() => void submit()}>{stage === "sending" ? d.submitting : d.submit}</button></div>
    </div>}
  </section>;
}
