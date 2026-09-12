import React, { act, createElement as h } from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { DemoEntry } from "../app/components/DemoEntry";
import { AccessCodeForm } from "../app/access/AccessCodeForm";
import { AccessSettings } from "../app/admin/maintenance-settings/AccessSettings";
import { siteAccessDictionaries } from "../app/i18n/site-access";
import { withFeedbackDom } from "./helpers/outreach-feedback-dom";
import type { SiteAccessSnapshot } from "../lib/site-access";

const snapshot:SiteAccessSnapshot={scope:'global',environment:'development',enabled:true,hasCode:true,sessionDays:1,revision:1,updatedAt:'2026-09-12T00:00:00Z'};
test('all five dictionaries carry entry, access and settings copy',()=>{
 assert.equal(Object.keys(siteAccessDictionaries).length,5);
 const keys=(value:unknown,prefix=''):string[]=>typeof value==='object' && value!==null ? Object.entries(value).flatMap(([key,item])=>keys(item,`${prefix}.${key}`)):[prefix];
 const expected=keys(siteAccessDictionaries.ja);
 for(const copy of Object.values(siteAccessDictionaries)) {assert.deepEqual(keys(copy),expected);assert.ok(copy.gate.description.includes('\n'));assert.ok(copy.gate.helpTitle);}
});
test('adopted neutral frame and accessible gate render without an admin link',async()=>{
 await withFeedbackDom(async(document,render)=>{
  const copy=siteAccessDictionaries.ja;
  await render(h(DemoEntry,{copy:copy.frame,sites:copy.sites.map(s=>({...s,href:`http://${s.key}.localhost:3001/`}))}));
  assert.equal(document.querySelector('header')?.textContent,'keien.dev');assert.equal(document.querySelectorAll('a').length,2);
  assert.match(document.querySelector('footer p')?.className ?? '',/text-center/);
  await render(h(AccessCodeForm,{frame:copy.frame,copy:copy.gate,onSubmit:async()=>copy.gate.error}));
  assert.equal(document.querySelector('a'),null);assert.equal(document.querySelector('#access-help strong')?.textContent,copy.gate.helpTitle);
  assert.match(document.querySelector('main > p')?.className ?? '',/whitespace-pre-line/);
  await act(async()=>document.querySelector('form')!.dispatchEvent(new document.defaultView!.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(document.querySelector('[role="alert"]')?.textContent?.includes(copy.gate.error),true);
  assert.match(document.querySelector('input')?.getAttribute('aria-describedby') ?? '',/access-error/);
 });
});
test('settings preserve conflict input, require discard on scope change, prevent duplicate save and disable readonly/unloaded',async()=>{
 await withFeedbackDom(async(document,render)=>{
  const copy=siteAccessDictionaries.ja.settings;
  let resolveSave:((s:SiteAccessSnapshot)=>void)|undefined;let saves=0;
  const props={copy,initialValues:{global:snapshot},allowedScopes:['global','lg'] as ('global'|'lg')[],updateScopes:['global'] as 'global'[],onLoad:async()=>snapshot,onSave:async()=>{saves++;return new Promise<SiteAccessSnapshot>(resolve=>{resolveSave=resolve;});}};
  await render(h(AccessSettings,props));
  const form=document.querySelector('form')!;
  await act(async()=>{form.dispatchEvent(new document.defaultView!.Event('submit',{bubbles:true,cancelable:true}));});
  assert.equal(document.querySelector('select')?.disabled,true);
  await act(async()=>{form.dispatchEvent(new document.defaultView!.Event('submit',{bubbles:true,cancelable:true}));});assert.equal(saves,1);
  await act(async()=>resolveSave!({...snapshot,revision:2}));
  assert.ok(document.body.textContent?.includes(copy.saved));
  await render(h(AccessSettings,{...props,key:'readonly',updateScopes:[]}));
  assert.equal(document.querySelector('fieldset')?.disabled,true);assert.ok(document.body.textContent?.includes(copy.readonly));
  await render(h(AccessSettings,{...props,key:'missing',initialValues:{}}));
  assert.equal(document.querySelector('button[type="submit"]')?.hasAttribute('disabled') ?? document.querySelector('form > button:last-child')?.hasAttribute('disabled'),true);
  await render(h(AccessSettings,{...props,key:'conflict',onSave:async()=>{throw new Error('SITE_ACCESS_SETTINGS_CONFLICT');}}));
  await act(async()=>document.querySelector('form')!.dispatchEvent(new document.defaultView!.Event('submit',{bubbles:true,cancelable:true})));
  assert.ok(document.body.textContent?.includes(copy.conflict));assert.equal(document.querySelector<HTMLInputElement>('input[type="number"]')?.value,'1');
  await act(async()=>document.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0].click());
  await act(async()=>{const select=document.querySelector('select')!;select.value='lg';select.dispatchEvent(new document.defaultView!.Event('change',{bubbles:true}));});
  assert.ok(document.querySelector('[role="dialog"]'));assert.ok(document.body.textContent?.includes(copy.discardTitle));
 });
});
