import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const modulePromise = import(pathToFileURL(path.resolve(import.meta.dirname, '../.agents/skills/plan/scripts/parity-evidence-equivalence.mjs')).href);

test('reuse fails closed for newly discovered, missing, or changed dependencies', async () => {
  const { assessSourceCurrentness } = await modulePromise;
  const base = { targetId:'phone', sourceImpactMap:[{source:'shared',scope:'global',targetIds:[]},{source:'phone',scope:'target',targetIds:['phone']},{source:'chat',scope:'target',targetIds:['chat']}], originalSources:[{path:'shared',sha256:'a'},{path:'phone',sha256:'b'}],currentSources:[{path:'shared',sha256:'a'},{path:'phone',sha256:'b'}] };
  assert.equal(assessSourceCurrentness(base).eligible,true);
  assert.equal(assessSourceCurrentness({...base,sourceImpactMap:[...base.sourceImpactMap,{source:'new',scope:'global',targetIds:[]}]}).eligible,false);
  assert.equal(assessSourceCurrentness({...base,currentSources:[{path:'shared',sha256:'a'}]}).eligible,false);
  assert.equal(assessSourceCurrentness({...base,currentSources:[{path:'shared',sha256:'changed'},{path:'phone',sha256:'b'}]}).eligible,false);
  assert.equal(assessSourceCurrentness({...base,originalSources:[]}).eligible,false);
});
test('renaming assertion IDs preserves equivalence but changing expectations does not', async () => {
  const { equivalentAssertion } = await modulePromise;
  const probe={id:'old',kind:'control',required:true,options:{expected:'disabled'}};
  const comparison={probeId:'old',smoke:'equal',final:'equal',expected:null};
  const signature=equivalentAssertion(probe,comparison);
  assert.equal(signature,equivalentAssertion({...probe,id:'new'},{...comparison,probeId:'new'}));
  assert.notEqual(signature,equivalentAssertion({...probe,options:{expected:'visible'}},comparison));
  assert.notEqual(signature,equivalentAssertion(probe,{...comparison,final:'capture'}));
});
test('condition equivalence includes viewport, theme, fixture, auth, locale and actual operations', async () => {
  const { equivalentCondition } = await modulePromise;
  const base={row:{id:'alias',state:'alias',targetId:'phone',entry:'index.html',route:'/admin/phone-settings',surface:'page',viewport:'1440x900',theme:'light'},setup:{production:{query:{state:'default'},actions:[]},prototype:{query:{state:'default'},actions:[]}},browserSetup:{theme:'class'},comparisonConditions:{dpr:1,scroll:{x:0,y:0},locale:'ja',fixture:'a',authorization:'admin',query:'none'}};
  const signature=equivalentCondition(base);
  assert.equal(signature,equivalentCondition({...base,row:{...base.row,id:'default',state:'default'}}));
  for(const field of ['locale','fixture','authorization','dpr']) assert.notEqual(signature,equivalentCondition({...base,comparisonConditions:{...base.comparisonConditions,[field]:'changed'}}));
  for(const field of ['viewport','theme']) assert.notEqual(signature,equivalentCondition({...base,row:{...base.row,[field]:'changed'}}));
  assert.notEqual(signature,equivalentCondition({...base,setup:{...base.setup,production:{query:{state:'default'},actions:[{kind:'click'}]}}}));
});
