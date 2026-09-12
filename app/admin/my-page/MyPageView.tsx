"use client";
export type MyPageCopy = { title: string; description: string; name: string; email: string; noAccess: string; denied: string };
export function MyPageView({name, email, hasAccess, denied, copy}: {name: string; email: string; hasAccess: boolean; denied: boolean; copy: MyPageCopy}) {
return <section className="max-w-3xl"><h1 className="text-2xl font-bold">{copy.title}</h1><p className="mt-3 text-sm text-fg-muted">{copy.description}</p>{denied && <p role="alert" className="mt-6 text-sm text-fg">{copy.denied}</p>}<dl className="mt-8 divide-y divide-line border-y border-line">{[[copy.name,name],[copy.email,email]].map(([label,value])=><div key={label} className="grid gap-2 py-5 sm:grid-cols-[12rem_minmax(0,1fr)]"><dt className="text-sm font-semibold">{label}</dt><dd className="break-words text-sm">{value}</dd></div>)}</dl>{!hasAccess && <p className="mt-6 text-sm text-fg-muted">{copy.noAccess}</p>}</section>;
}
