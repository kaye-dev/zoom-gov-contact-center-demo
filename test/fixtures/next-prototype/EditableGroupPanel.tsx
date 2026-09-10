"use client";

import { useState, type FormEvent } from "react";
import { SearchInput } from "@/app/components/admin/SearchInput";

export type EditableGroupPanelProps = {
  name: string;
  onSave: (name: string) => Promise<string>;
  copy: { heading: string; name: string; search: string; save: string; saving: string; saved: string; error: string };
};

export function EditableGroupPanel({ name, onSave, copy }: EditableGroupPanelProps) {
  const [value, setValue] = useState(name);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"ready" | "saving" | "saved" | "error">("ready");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (state === "saving") return;
    setState("saving");
    try {
      setValue(await onSave(value));
      setState("saved");
    } catch { setState("error"); }
  }
  return (
    <section className="max-w-2xl space-y-6" aria-labelledby="group-heading">
      <h1 id="group-heading" className="text-2xl font-bold text-fg">{copy.heading}</h1>
      <SearchInput label={copy.search} value={search} onChange={event => setSearch(event.target.value)} placeholder={copy.search} />
      <form onSubmit={event => void submit(event)} className="space-y-4">
        <label htmlFor="group-name" className="block text-sm font-medium text-fg">{copy.name}</label>
        <input id="group-name" value={value} onChange={event => setValue(event.target.value)} required className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg focus:border-accent focus:outline-none" />
        <button type="submit" disabled={state === "saving"} className="cursor-pointer rounded-md bg-accent px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50">{state === "saving" ? copy.saving : copy.save}</button>
        <p role="status" className="text-sm text-fg-muted">{state === "saved" ? `${copy.saved}: ${value}` : state === "error" ? copy.error : ""}</p>
      </form>
    </section>
  );
}
