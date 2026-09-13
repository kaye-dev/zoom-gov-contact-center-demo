"""Behavioral regression tests. Fixtures are synthetic, never import them into Zoom."""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from flow_core import *
from flow_layout import arrange, route, svg, rectangles
from flow import verify, DEFAULT_PROFILE

FIXTURE=Path(__file__).parent/'fixtures'/'branching.json'


class FlowTests(unittest.TestCase):
    def setUp(self):
        self.doc=read_json(FIXTURE); self.profile=load_profile(DEFAULT_PROFILE)

    def simple(self):
        nodes=decode(self.doc)['state']; by={n['name']:n for n in nodes}
        a=copy.deepcopy(by['Start']);b=copy.deepcopy(by['SM_Notice']);c=copy.deepcopy(by['RT_End'])
        a['transitions'][0]['next']=b['name']
        for t in b['transitions']:t['next']=c['name']
        return encode(self.doc,[a,b,c])

    def requirements(self):
        return {'requirements':[{'id':'R1','statement':'案内後は正常時も失敗時も終了する','widgets':['SM_Notice','RT_End'],
                                 'scenarios':['normal','error']}],
                'scenarios':[{'id':k,'steps':[{'widget':'Start','exit':0},{'widget':'SM_Notice','exit':i}],
                              'expected_end':'RT_End','terminal':True} for k,i in [('normal',0),('error',1)]]}

    def test_original_topology(self):
        self.assertEqual(basic_issues(self.doc,self.profile),[])
        self.assertEqual(path_count(decode(self.doc)['state']),124)

    def test_full_expansion_regression(self):
        expanded,m=separate(self.doc,self.profile,'all')
        nodes=decode(expanded)['state']
        self.assertEqual(len(nodes),208);self.assertEqual(sum(len(n['transitions']) for n in nodes),207)
        self.assertEqual(path_count(nodes),124)
        self.assertTrue(equivalent(self.doc,expanded,m,'split'))
        self.assertTrue(all(c==1 for c in Counter(t['next'] for n in nodes for t in n['transitions']).values()))
        self.assertEqual(basic_issues(expanded,self.profile),[])

    def test_default_reuse_preserves_processing_and_order(self):
        doc,m=separate(self.doc,self.profile)
        doc=arrange(doc,self.profile)
        self.assertEqual(len(decode(doc)['state']),15)
        self.assertTrue(equivalent(self.doc,doc,m,'layout'))

    def test_selected_and_terminals(self):
        doc,m=separate(self.doc,self.profile,'selected',['SM_Prelude','RT_End'])
        incoming=Counter(t['next'] for n in decode(doc)['state'] for t in n['transitions'])
        self.assertTrue(all(incoming[n]<=1 for n,base in m['origin'].items() if base in ('SM_Prelude','RT_End')))
        self.assertTrue(any(count>1 for count in incoming.values()))
        term,tm=separate(self.doc,self.profile,'terminals')
        self.assertTrue(all(base=='RT_End' for name,base in tm['origin'].items() if name!=base))
        self.assertTrue(equivalent(self.doc,term,tm,'split'))

    def test_cycles_preserved_but_safe_branch_split(self):
        doc=self.simple();nodes=decode(doc)['state']
        nodes[1]['transitions'][0]['next']='SM_Notice'
        doc=encode(doc,nodes)
        out,m=separate(doc,self.profile,'all')
        self.assertEqual(len(decode(out)['state']),3)
        self.assertTrue(m['preserved_cycles'])
        self.assertIsNone(path_count(decode(out)['state']))
        self.assertTrue(equivalent(doc,out,m,'split'))
        self.assertEqual(decode(out)['state'][1]['transitions'][0]['next'],'SM_Notice')
        laid=arrange(out,self.profile);r,g=route(laid,self.profile)
        self.assertFalse(g['unrouted_edges']);self.assertFalse(g['connectors_through_cards'])

    def test_multi_node_cycle_multiple_entries(self):
        doc=self.simple();nodes=decode(doc)['state'];a=copy.deepcopy(nodes[1]);b,_=fresh_node(a,self.profile,'SM_Other')
        a['transitions'][0]['next']='SM_Other';b['transitions'][0]['next']='SM_Notice'
        doc=encode(doc,[nodes[0],a,b,nodes[2]])
        out,m=separate(doc,self.profile,'all')
        self.assertEqual(len(m['preserved_cycles'][0]),2)
        self.assertTrue(equivalent(doc,out,m,'split'))

    def test_missing_target_and_pre_existing_issue(self):
        nodes=decode(self.doc)['state'];nodes[0]['transitions'][0]['next']='Missing'
        bad=encode(self.doc,nodes);before=basic_issues(bad,self.profile)
        self.assertTrue(any(i['code']=='missing-target' for i in before))
        report,_=verify(bad,self.profile,source=bad)
        self.assertEqual(report['status'],'failed');self.assertFalse(report['baseline']['introduced'])
        self.assertTrue(report['baseline']['pre_existing'])

    def test_duplicate_names_and_owned_ids(self):
        nodes=decode(self.doc)['state'];nodes[1]['name']=nodes[0]['name']
        self.assertIn('duplicate-name',[i['code'] for i in basic_issues(encode(self.doc,nodes),self.profile)])
        nodes=decode(self.doc)['state'];nodes[1]['id']=nodes[0]['id']
        self.assertIn('duplicate-internal-id',[i['code'] for i in basic_issues(encode(self.doc,nodes),self.profile)])

    def test_name_truncation_collision(self):
        used=set();reserved={'abcdefghijklmnop_002','abcdefghijklmnop_003'}
        a=allocate_name('abcdefghijklmnopAAAA',2,used,reserved,20)
        b=allocate_name('abcdefghijklmnopBBBB',2,used,reserved,20)
        self.assertNotEqual(a,b);self.assertNotIn(a,reserved);self.assertLessEqual(len(a),20)

    def test_external_ids_preserved_and_tampering_detected(self):
        out,m=separate(self.doc,self.profile,'all');nodes=decode(out)['state'];source={n['name']:n for n in decode(self.doc)['state']}
        for n in nodes:
            if 'queueId' in n.get('properties',{}):self.assertEqual(n['properties']['queueId'],source[m['origin'][n['name']]]['properties']['queueId'])
        desk=next(n for n in nodes if m['origin'][n['name']]=='RT_Desk');desk['properties']['queueId']='ALTERED_EXTERNAL_ID'
        self.assertFalse(equivalent(self.doc,encode(out,nodes),m,'split'))

    def test_internal_reference_blocks_split_but_layout_allowed(self):
        nodes=decode(self.doc)['state'];nodes[1]['properties']['customReference']='{{CI_Menu.output}}'
        doc=encode(self.doc,nodes)
        with self.assertRaisesRegex(FlowError,'reference review'):separate(doc,self.profile,'all')
        out,m=separate(doc,self.profile);self.assertTrue(equivalent(doc,arrange(out,self.profile),m,'layout'))

    def test_unknown_id_and_script_block(self):
        for key,value in [('customId','example-id'),('expression','lookup(output)'),('script','return 7;')]:
            nodes=decode(self.doc)['state'];nodes[1]['properties'][key]=value
            with self.subTest(key=key),self.assertRaisesRegex(FlowError,'reference review'):
                separate(encode(self.doc,nodes),self.profile,'all')

    def test_variable_scope_blocks(self):
        self.doc['localVariables']='[{"name":"choice"}]'
        with self.assertRaisesRegex(FlowError,'reference review'):separate(self.doc,self.profile,'all')

    def test_unknown_fields_roundtrip_preserved(self):
        self.doc['futureMetadata']={'id':'external-top-level','flag':7}
        graph=decode(self.doc);graph['futureCanvas']={'version':3};self.doc['widgetsJson']=json.dumps(graph)
        out,m=separate(self.doc,self.profile,'all');out=arrange(out,self.profile)
        self.assertTrue(equivalent(self.doc,out,m,'split'))
        self.assertEqual(decode(out)['futureCanvas'],{'version':3})

    def test_estimate_stops_before_expansion(self):
        with self.assertRaisesRegex(FlowError,'208 nodes'):separate(self.doc,self.profile,'all',max_nodes=207)
        p=copy.deepcopy(self.profile);p['verified_max_nodes']=20
        with self.assertRaisesRegex(FlowError,'limit 20'):separate(self.doc,p,'all')

    def test_geometry_for_reuse_and_full(self):
        for mode in ['reuse','all']:
            with self.subTest(mode=mode):
                doc,m=separate(self.doc,self.profile,mode);doc=arrange(doc,self.profile)
                routes,g=route(doc,self.profile)
                self.assertFalse(g['overlapping_widgets']);self.assertFalse(g['connectors_through_cards']);self.assertFalse(g['unrouted_edges'])
                self.assertEqual(len(routes),sum(len(n['transitions']) for n in decode(doc)['state']))
                self.assertIn('<svg',svg(doc,self.profile,routes))

    def test_adjust_spacing_and_detect_overlap(self):
        wide=arrange(self.doc,self.profile,200,100);tight=arrange(self.doc,self.profile,100,40)
        self.assertLess(max(r[0] for r in rectangles(tight,self.profile).values()),max(r[0] for r in rectangles(wide,self.profile).values()))
        self.assertTrue(equivalent(wide,tight,{},'layout'))
        nodes=decode(tight)['state'];nodes[1]['left']=nodes[0]['left'];nodes[1]['top']=nodes[0]['top']
        report,_=verify(encode(tight,nodes),self.profile)
        self.assertEqual(report['status'],'failed');self.assertTrue(report['geometry']['overlapping_widgets'])

    def test_channel_unknown_never_falls_back_to_voice(self):
        for channel in ('voice','video','messaging','email','work_item'):
            d=copy.deepcopy(self.doc);d['studioType']='UNVERIFIED_'+channel
            with self.subTest(channel=channel):
                self.assertEqual(identify(d,self.profile)['channel'],'unverified')
                self.assertIn('channel-profile-mismatch',[i['code'] for i in basic_issues(d,self.profile)])

    def test_channel_adapter_interface_with_synthetic_discriminators(self):
        # Tests adapter plumbing ONLY, not Zoom export formats for unobserved channels.
        for channel in ('voice','video','messaging','email','work_item'):
            p=copy.deepcopy(self.profile);p['channel']=channel;p['envelope_match']={'studioType':'SYNTHETIC_'+channel}
            if channel=='messaging':p['messaging_subchannel']='SYNTHETIC_web_chat'
            d=copy.deepcopy(self.doc);d['studioType']='SYNTHETIC_'+channel
            self.assertEqual(identify(d,p)['channel'],channel)
            self.assertEqual(basic_issues(d,p),[])

    def test_unknown_widget_and_required_exits(self):
        nodes=decode(self.doc)['state'];nodes[1]['type']='UnknownFutureWidget'
        self.assertIn('profile-mismatch',[i['code'] for i in basic_issues(encode(self.doc,nodes),self.profile)])
        nodes=decode(self.doc)['state'];nodes[1]['transitions'].pop()
        self.assertIn('required-exit',[i['code'] for i in basic_issues(encode(self.doc,nodes),self.profile)])

    def test_duplicate_menu_conditions_and_empty_queue(self):
        nodes=decode(self.doc)['state'];menu=next(n for n in nodes if n['type']=='CollectInput')
        menu['transitions'][1]['condition']=copy.deepcopy(menu['transitions'][0]['condition'])
        self.assertIn('ambiguous-condition',[i['code'] for i in basic_issues(encode(self.doc,nodes),self.profile)])
        nodes=decode(self.doc)['state'];desk=next(n for n in nodes if n['name']=='RT_Desk');desk['properties']['queueId']=''
        self.assertIn('required-value',[i['code'] for i in basic_issues(encode(self.doc,nodes),self.profile)])

    def test_non_menu_collect_variant_is_not_accepted(self):
        nodes=decode(self.doc)['state'];next(n for n in nodes if n['type']=='CollectInput')['properties']['collectType']='UnverifiedTextInput'
        self.assertIn('profile-mismatch',[i['code'] for i in basic_issues(encode(self.doc,nodes),self.profile)])

    def test_invalid_node_shape_reports_failure(self):
        from flow import inspection
        for nodes in ([None], [{'name':'Malformed'}], []):
            result=inspection(encode(self.doc,nodes),self.profile)
            self.assertTrue(result['issues'])

    def test_new_template_with_event_hook_requires_review(self):
        self.doc['eventAction']={'hook':'example-handler'}
        with self.assertRaisesRegex(FlowError,'event actions'):
            apply_spec(self.doc,{'mode':'new','nodes':[]},self.profile)

    def test_template_backed_new_and_scenarios(self):
        spec={'mode':'new','nodes':[{'name':'Start','template':'Start','targets':['SM_Notice']},
                                   {'name':'SM_Notice','template':'SM_Notice','targets':['RT_End','RT_End']},
                                   {'name':'RT_End','template':'RT_End','targets':[]}],
              'envelope_set':[{'pointer':'/flowName','value':'New synthetic announcement'}]}
        doc=apply_spec(self.doc,spec,self.profile)
        self.assertEqual(len(decode(doc)['state']),3);self.assertEqual(basic_issues(doc,self.profile),[])
        self.assertTrue(check_requirements(doc,self.requirements())['passed'])
        for a in decode(doc)['state']:self.assertNotIn(a['id'],[n['id'] for n in decode(self.doc)['state']])

    def test_explicit_edit_and_property_assertion(self):
        doc=self.simple();spec={'mode':'edit','edits':[{'widget':'SM_Notice','pointer':'/properties/audioList/0/message','value':'New message'}]}
        edited=apply_spec(doc,spec,self.profile);req=self.requirements()
        req['scenarios'][0]['steps'][1]['assert']=[{'pointer':'/properties/audioList/0/message','equals':'New message'}]
        self.assertTrue(check_requirements(edited,req)['passed'])
        self.assertFalse(check_requirements(doc,req)['passed'])
        self.assertFalse(equivalent(doc,edited,{},'layout'))

    def test_edit_cannot_hide_id_replacement_in_bulk_patch(self):
        node=next(n for n in decode(self.doc)['state'] if n['name']=='SM_Notice')
        props=copy.deepcopy(node['properties']);props['audioList'][0]['id']='replacement'
        with self.assertRaisesRegex(FlowError,'owned IDs'):
            apply_spec(self.doc,{'mode':'edit','edits':[{'widget':'SM_Notice','pointer':'/properties','value':props}]},self.profile)

    def test_missing_and_wrong_requirement_coverage(self):
        req=self.requirements();req['requirements'][0]['widgets'].append('Missing')
        self.assertFalse(check_requirements(self.simple(),req)['passed'])
        req=self.requirements();req['scenarios'][0]['steps'][1]['exit']=999
        self.assertFalse(check_requirements(self.simple(),req)['passed'])
        with self.assertRaises(FlowError):check_requirements(self.simple(),{})

    def test_fixture_cannot_be_claimed_deliverable(self):
        doc=arrange(self.doc,self.profile);report,_=verify(doc,self.profile)
        self.assertEqual(report['status'],'passed');self.assertFalse(report['delivery_ready'])
        self.assertTrue(report['unresolved_values']);self.assertEqual(report['zoom_import']['status'],'not_checked')

    def test_cli_roundtrip_no_overwrite_source_unchanged(self):
        before=FIXTURE.read_bytes()
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp)/'out'
            command=[sys.executable,str(ROOT/'flow.py'),'build','--input',str(FIXTURE),'--out',str(output)]
            first=subprocess.run(command,capture_output=True,text=True);self.assertEqual(first.returncode,0,first.stderr)
            self.assertEqual(set(p.name for p in output.iterdir()),{'flow.json','flow.svg','verification.json','summary.md'})
            original=(output/'flow.json').read_bytes();again=subprocess.run(command,capture_output=True,text=True)
            self.assertEqual(again.returncode,2);self.assertEqual(original,(output/'flow.json').read_bytes())
            command=[sys.executable,str(ROOT/'flow.py'),'validate','--input',str(output/'flow.json'),
                     '--source',str(FIXTURE),'--kind','layout','--out',str(Path(temp)/'validation')]
            result=subprocess.run(command,capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(FIXTURE.read_bytes(),before)

    def test_cli_rejects_forged_proof_external_normalization(self):
        with tempfile.TemporaryDirectory() as temp:
            temp=Path(temp);out,m=separate(self.doc,self.profile,'all');out=arrange(out,self.profile)
            target=next(n for n in decode(out)['state'] if m['origin'][n['name']]=='RT_Desk')
            m['id_changes'][target['name']]['/properties/queueId']={'from':'before','to':'after'}
            (temp/'flow.json').write_text(json.dumps(out));(temp/'proof.json').write_text(json.dumps({'mapping':m,'source_sha256':digest(self.doc)}))
            result=subprocess.run([sys.executable,str(ROOT/'flow.py'),'validate','--input',str(temp/'flow.json'),
                                   '--source',str(FIXTURE),'--kind','split','--proof',str(temp/'proof.json'),'--out',str(temp/'out')],capture_output=True,text=True)
            self.assertEqual(result.returncode,2);self.assertIn('non-owned',result.stderr)


if __name__=='__main__':unittest.main()
