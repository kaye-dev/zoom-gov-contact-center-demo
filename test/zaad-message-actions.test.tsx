import assert from "node:assert/strict";
import test from "node:test";
import React, { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { LanguageProvider } from "../app/i18n/LanguageProvider";
import type { ImportedAudioMessage } from "../lib/zaad/message-import-contracts";
import type { OutreachPanelProps } from "../app/admin/zaad/OutreachView";

const message:ImportedAudioMessage={id:'audio',sourceKind:'IMPORTED_AUDIO',name:'音声テスト',body:'取得した本文',bodyState:'PROVIDER_RETURNED',bodyFetchedAt:'2026-09-11T00:00:00.000Z',voiceId:'Takumi',languageCode:'ja-JP',observedDigest:'a'.repeat(64),expectedDigest:'b'.repeat(64),generationState:'IMPORTED_AUDIO',zoomAssetId:'asset',assetItemId:'item',updatedAt:'2026-09-11T00:00:00.000Z'};
function component<T>(name:string,mocks:Record<string,unknown>):T{
 const filename=path.resolve(`app/admin/zaad/${name}.tsx`),require=createRequire(filename),target={exports:{}};
 const code=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)((id:string)=>id in mocks?mocks[id]:require(id),target,target.exports);
 return (target.exports as Record<string,T>)[name];
}
async function withDom(work:(document:Document,render:(element:React.ReactNode)=>Promise<void>)=>Promise<void>){
 const dom=new JSDOM('<html lang="ja"><body><div id="root"></div></body></html>',{url:'http://localhost/'}),before=new Map<string,PropertyDescriptor|undefined>();
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,HTMLButtonElement:dom.window.HTMLButtonElement,Element:dom.window.Element,Node:dom.window.Node,Event:dom.window.Event,CustomEvent:dom.window.CustomEvent,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,React,IS_REACT_ACT_ENVIRONMENT:true})){before.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const root=createRoot(dom.window.document.getElementById('root')!);
 try{await work(dom.window.document,element=>act(async()=>root.render(h(LanguageProvider,{availableLocales:['ja'],tenantKey:'lg',children:element}))));}finally{await act(async()=>root.unmount());for(const[key,value]of before){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}dom.window.close();}
}
const props:OutreachPanelProps={tenant:'lg',permissions:{create:true,update:true,delete:true},fullAccess:true,setDirty:()=>{}};
test('MESSAGE-ACTIONS-01: menu does not navigate the row; delete remains local and saving blocks duplicate submissions',async()=>withDom(async(document,render)=>{
 const navigated:string[]=[],writes:unknown[]=[];let rows=[message],complete:(value:unknown)=>void=()=>{};
 const Messages=component<React.ComponentType<OutreachPanelProps>>('OutreachMessages',{
  'next/navigation':{useRouter:()=>({push:(href:string)=>navigated.push(href),replace:()=>{}}),useSearchParams:()=>new URLSearchParams('tenant=lg&view=messages')},
  './outreach-client':{outreachRequest:async()=>({items:rows,total:rows.length}),outreachMutation:async(...args:unknown[])=>{writes.push(args);return new Promise(resolve=>{complete=resolve;});},OutreachApiError:class extends Error{}},
  './OutreachView':{OutreachLoading:()=>null,OutreachFailure:()=>null},'./OutreachListActions':{OutreachListActions:({children}:{children:React.ReactNode})=>h('div',null,children),outreachTabAction:''},
 });
 await render(h(Messages,{...props,fullAccess:false,permissions:{create:false,update:false,delete:false}}));
 const readonlyMenu=document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
 await act(async()=>readonlyMenu.click());
 assert.ok(Array.from(document.querySelectorAll('[role="menuitem"]')).every(item=>item.getAttribute('aria-disabled')==='true'));
 await act(async()=>readonlyMenu.click());
 await render(h(Messages,props));
 assert.equal(document.querySelectorAll('thead th').length,5);assert.ok(!document.body.textContent!.includes('担当部署'));
 const menu=document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
 await act(async()=>menu.click());assert.equal(navigated.length,0);
 const items=Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));assert.deepEqual(items.map(x=>x.textContent),['編集','削除']);
 await act(async()=>items[0].click());assert.ok(navigated[0].includes('message-audio-detail'));
 await act(async()=>menu.click());
 await act(async()=>Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(x=>x.textContent==='削除')!.click());
 assert.equal(navigated.length,1);
 const dialog=document.querySelector('[role="dialog"]')!;assert.ok(dialog.textContent!.includes('Zoom'));
 const submit=Array.from(dialog.querySelectorAll('button')).at(-1)!;
 await act(async()=>{submit.click();submit.click();});assert.equal(writes.length,1);assert.equal(submit.disabled,true);
 const args=writes[0] as [string,string,Record<string,unknown>,string];assert.equal(args[1],'imported-audio-messages/audio');assert.equal(args[3],'DELETE');assert.equal(args[2].expectedDigest,message.expectedDigest);assert.ok(!('version'in args[2]));
 rows=[];await act(async()=>complete({status:'COMPLETED'}));assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(document.querySelectorAll('tbody tr').length,0);assert.ok(document.querySelector('[role="status"]'));
 await render(h(Messages,{...props,fullAccess:false,permissions:{create:false,update:false,delete:false}}));
}));
test('MESSAGE-WRITE-01: fetched body is the initial replacement text and a name-only save sends no TTS or counter',async()=>withDom(async(document,render)=>{
 const writes:unknown[]=[],dirty:boolean[]=[];let saved=0;let complete:(value:unknown)=>void=()=>{};
 const Editor=component<React.ComponentType<OutreachPanelProps&{message:ImportedAudioMessage;saved:()=>void}>>('OutreachImportedAudioEditor',{
  './outreach-client':{outreachMutation:async(...args:unknown[])=>{writes.push(args);return new Promise(resolve=>{complete=resolve;});},OutreachApiError:class extends Error{}},'./DetailPageBreadcrumb':{DetailPageBreadcrumb:()=>null},'./OutreachAudioPlayer':{OutreachAudioPlayer:()=>null},
 });
 await render(h(Editor,{...props,message,setDirty:value=>dirty.push(value),saved:()=>saved++}));
 const checkbox=document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;assert.equal(checkbox.checked,false);
 await act(async()=>checkbox.click());assert.equal(document.querySelector('textarea')!.value,message.body);
 await act(async()=>checkbox.click());
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(writes.length,0);
 let dialog=document.querySelector('[role="dialog"]')!;
 assert.ok(dialog.textContent!.includes('保存するとZoom Contact Centerの音声アイテムを更新します。'));
 const cancel=Array.from(dialog.querySelectorAll('button')).find(node=>node.textContent==='キャンセル')!;
 assert.equal(document.activeElement,cancel);
 await act(async()=>cancel.click());assert.equal(writes.length,0);assert.equal(document.querySelector('[role="dialog"]'),null);
 assert.equal(document.querySelector<HTMLInputElement>('input:not([type="checkbox"])')!.value,message.name);
 assert.ok(!document.body.textContent!.includes('保存するとZoom Contact Centerの音声アイテムを更新します。'));
 await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 dialog=document.querySelector('[role="dialog"]')!;
 await act(async()=>{const button=Array.from(dialog.querySelectorAll('button')).find(node=>node.textContent==='Zoomに保存')!;button.click();button.click();});
 assert.equal(writes.length,1);
 assert.equal(dialog.getAttribute('aria-busy'),'true');
 assert.ok(Array.from(dialog.querySelectorAll('button')).every(button=>button.disabled));
 await act(async()=>document.dispatchEvent(new document.defaultView!.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 assert.ok(document.querySelector('[role="dialog"]'));
 await act(async()=>complete({status:'COMPLETED'}));
 assert.equal(document.querySelector('[role="dialog"]'),null);
 const args=writes[0] as [string,string,Record<string,unknown>,string];assert.equal(args[3],'PATCH');assert.equal(args[2].replaceAudio,false);assert.equal(args[2].expectedDigest,message.expectedDigest);
 for(const key of ['body','voiceId','version','revision','departmentKey'])assert.equal(key in args[2],false);
 assert.equal(saved,1);assert.equal(dirty.at(-1),false);
}));
test('MESSAGE-PLAY-04: returning from audio details reloads provider body and concurrency metadata',async()=>withDom(async(document,render)=>{
 let query=new URLSearchParams('tenant=lg&view=messages'),catalogReads=0;
 let row:ImportedAudioMessage={...message,body:null,bodyState:'UNCHECKED'};
 const Messages=component<React.ComponentType<OutreachPanelProps>>('OutreachMessages',{
  'next/navigation':{useRouter:()=>({push:()=>{},replace:()=>{}}),useSearchParams:()=>query},
  './outreach-client':{outreachRequest:async(_tenant:string,route:string)=>{if(route==='message-catalog'){catalogReads++;return{items:[row],total:1};}return{message:row};},OutreachApiError:class extends Error{}},
  './OutreachImportedAudioEditor':{OutreachImportedAudioEditor:()=>h('p',null,'audio detail')},
  './DetailPageBreadcrumb':{DetailPageBreadcrumb:()=>null},
  './OutreachView':{OutreachLoading:()=>null,OutreachFailure:()=>null},'./OutreachListActions':{OutreachListActions:({children}:{children:React.ReactNode})=>h('div',null,children),outreachTabAction:''},
 });
 await render(h(Messages,props));assert.equal(catalogReads,1);assert.ok(document.body.textContent!.includes('本文の取得状況は未確認です。'));
 query=new URLSearchParams('tenant=lg&view=messages&state=message-audio-detail&detail=audio');
 await render(h(Messages,props));assert.equal(catalogReads,1);
 row={...message,expectedDigest:'c'.repeat(64)};
 query=new URLSearchParams('tenant=lg&view=messages');
 await render(h(Messages,props));assert.equal(catalogReads,2);assert.ok(document.body.textContent!.includes('取得した本文'));assert.ok(!document.body.textContent!.includes('本文の取得状況は未確認です。'));
}));

test('MESSAGE-BODY-UI-01: text is preserved literally and body provenance stays distinct',async()=>withDom(async(document,render)=>{
 const Editor=component<React.ComponentType<OutreachPanelProps&{message:ImportedAudioMessage;saved:()=>void}>>('OutreachImportedAudioEditor',{
  './outreach-client':{loadImportedAudio:async()=>'',OutreachApiError:class extends Error{}},'./DetailPageBreadcrumb':{DetailPageBreadcrumb:()=>null},'./OutreachAudioPlayer':{OutreachAudioPlayer:()=>null},
 });
 const body='第1段落\n\n・案内 <script>alert(1)</script>\n  続き';
 for(const state of ['PROVIDER_RETURNED','USER_AUTHORED','UNCHECKED','UNAVAILABLE'] as const){
  const row={...message,bodyState:state,body:state==='UNAVAILABLE'?null:body};
  await render(h(Editor,{...props,key:state,message:row,saved:()=>{}}));
  const heading=Array.from(document.querySelectorAll('h2')).find(node=>node.textContent==='読み上げ本文')!;
  const section=document.querySelector(`section[aria-labelledby="${heading.id}"]`)!;
  assert.equal(section.querySelector('script'),null);
  if(state==='UNAVAILABLE')assert.ok(section.textContent!.includes('本文未取得'));
  else{
   assert.equal(section.querySelector('p.whitespace-pre-wrap')!.textContent,body);
   const source=state==='PROVIDER_RETURNED'?'Zoomから取得した本文':state==='USER_AUTHORED'?'サイトで入力した本文':'前回取得した参考本文';
   assert.ok(section.textContent!.includes(source));
   if(state==='UNCHECKED'){assert.ok(section.textContent!.includes(message.bodyFetchedAt!));assert.ok(section.textContent!.includes('未確認'));}
  }
  await act(async()=>document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  assert.equal(document.querySelector('textarea')!.value,row.body??'');
 }
}));

test('MESSAGE-SYNC-LAYOUT-01: disclosure is independent of selection, requests and import identity',async()=>withDom(async(document,render)=>{
 let reads=0;const dirty:boolean[]=[],writes:unknown[][]=[],confirmed:string[][]=[];
 const rows=[{assetId:'private-asset-a',assetItemId:'same-item',name:'候補A',languageCode:'ja-JP',voiceId:null,body:'全文\n第2段落',bodyState:'PROVIDER_RETURNED',selectable:true,imported:true,observedDigest:'digest-a',expectedUpdatedAt:null},{assetId:'private-asset-b',assetItemId:'same-item',name:'候補B',languageCode:'ja-JP',voiceId:null,body:null,bodyState:'UNAVAILABLE',selectable:true,imported:false,observedDigest:'digest-b',expectedUpdatedAt:null}];
 const Sync=component<React.ComponentType<OutreachPanelProps&{confirmed:(ids:string[])=>Promise<void>}>>('OutreachMessageSync',{
  './DetailPageBreadcrumb':{DetailPageBreadcrumb:()=>null},
  './outreach-client':{outreachRequest:async()=>{reads++;return{items:rows,accountId:'account',incomplete:false};},outreachMutation:async(...args:unknown[])=>{writes.push(args);return{status:'COMPLETED',result:{ids:['one','two']}};},OutreachApiError:class extends Error{}},
 });
 await render(h(Sync,{...props,setDirty:value=>dirty.push(value),confirmed:async ids=>{confirmed.push(ids);}}));
 assert.equal(document.querySelectorAll('thead th').length,4);
 assert.equal(document.querySelectorAll('colgroup col').length,4);
 assert.ok(!document.body.textContent!.includes('private-asset'));assert.ok(!document.body.textContent!.includes('取り込み済み'));assert.ok(!document.body.textContent!.includes('第2段落'));
 const buttons=()=>Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'));
 const first=buttons()[0];first.focus();await act(async()=>first.click());
 assert.equal(first.getAttribute('aria-expanded'),'true');assert.equal(document.activeElement,first);
 assert.equal(document.getElementById(first.getAttribute('aria-controls')!)!.querySelector('p')!.textContent,rows[0].body);
 assert.ok(first.querySelector('svg path'));
 await act(async()=>buttons()[1].click());assert.equal(document.querySelectorAll('td[colspan="4"]').length,2);assert.ok(document.body.textContent!.includes('本文未取得'));
 await act(async()=>first.click());assert.equal(buttons()[1].getAttribute('aria-expanded'),'true');assert.equal(dirty.length,0);assert.equal(reads,1);assert.equal(writes.length,0);
 const reload=Array.from(document.querySelectorAll('button')).find(node=>node.textContent==='再取得')!;
 await act(async()=>reload.click());assert.equal(reads,2);assert.ok(buttons().every(node=>node.getAttribute('aria-expanded')==='false'));
 for(const box of document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))await act(async()=>box.click());
 await act(async()=>buttons()[0].click());assert.equal(dirty.length,2);assert.ok(Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).every(node=>node.checked));
 const submit=Array.from(document.querySelectorAll('button')).find(node=>node.textContent==='取り込む')!;await act(async()=>submit.click());
 assert.equal(writes.length,1);const payload=writes[0][2] as {items:unknown[]};assert.deepEqual(payload.items,rows.map(({assetId,assetItemId,observedDigest,expectedUpdatedAt})=>({assetId,assetItemId,observedDigest,expectedUpdatedAt})));assert.deepEqual(confirmed,[['one','two']]);assert.equal(dirty.at(-1),false);
}));
