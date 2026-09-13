"""Run concrete specifications authored from four representative Japanese requests.
This is deterministic CLI evaluation, not an independent model/tool-activation evaluation.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FIXTURE=Path(__file__).parent/'fixtures'/'branching.json'


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out',required=True,type=Path);args=parser.parse_args()
    args.out.mkdir(parents=True,exist_ok=False)
    requirements={'requirements':[{'id':'R1','statement':'案内を再生し、成功・失敗ともに終了する',
                                  'widgets':['SM_Notice','RT_End'],'scenarios':['normal','failure']}],
                  'scenarios':[{'id':name,'steps':[{'widget':'Start','exit':0},{'widget':'SM_Notice','exit':i,
                               'assert':[{'pointer':'/properties/audioList/0/message','equals':'受付を終了します。'}]}],
                               'expected_end':'RT_End','terminal':True,
                               'end_assert':[{'pointer':'/properties/routeTo','equals':'Disconnect'}]}
                               for name,i in [('normal',0),('failure',1)]]}
    spec={'mode':'new','nodes':[{'name':'Start','template':'Start','targets':['SM_Notice']},
                              {'name':'SM_Notice','template':'SM_Notice','targets':['RT_End','RT_End'],
                               'set':[{'pointer':'/properties/audioList/0/message','value':'受付を終了します。'}]},
                              {'name':'RT_End','template':'RT_End','targets':[]}],
          'verification':requirements}
    new_spec=args.out/'new-spec.json';new_spec.write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n')
    reports=[]
    def run(name,prompt,source,extra):
        command=[sys.executable,str(ROOT/'flow.py'),'build','--input',str(source),'--out',str(args.out/name)]+extra
        result=subprocess.run(command,capture_output=True,text=True)
        if result.returncode:raise RuntimeError(result.stderr+result.stdout)
        report=json.loads((args.out/name/'verification.json').read_text())
        reports.append({'scenario':name,'prompt':prompt,'command':command,'exit_code':result.returncode,
                        'status':report['status'],'nodes':report['nodes'],'edges':report['edges'],
                        'terminal_paths':report['terminal_paths'],'delivery_ready':report['delivery_ready'],
                        'requirements':report.get('requirements',{}).get('passed','not-applicable')})
    run('new','音声で「受付を終了します。」と案内し、再生失敗時も含めて切断するフローを作成してください。',FIXTURE,['--spec',str(new_spec)])
    changed=json.loads(json.dumps(requirements));changed['requirements'][0]['statement']='案内を「またのご利用をお待ちしています。」へ変更し、終了経路を維持する'
    for s in changed['scenarios']:s['steps'][1]['assert'][0]['equals']='またのご利用をお待ちしています。'
    edit={'mode':'edit','edits':[{'widget':'SM_Notice','pointer':'/properties/audioList/0/message','value':'またのご利用をお待ちしています。'}],
          'verification':changed}
    edit_spec=args.out/'edit-spec.json';edit_spec.write_text(json.dumps(edit,ensure_ascii=False,indent=2)+'\n')
    run('edit','案内だけを「またのご利用をお待ちしています。」に変更してください。',args.out/'new'/'flow.json',['--spec',str(edit_spec)])
    run('compact','処理と接続を保ち、重ならない程度に余白を詰めてください。',FIXTURE,['--horizontal-gap','100','--vertical-gap','40'])
    run('all','全ての合流を分離し、終了経路を保ってください。',FIXTURE,['--separation','all'])
    assert reports[2]['nodes']==15
    assert (reports[3]['nodes'],reports[3]['edges'],reports[3]['terminal_paths'])==(208,207,124)
    (args.out/'evaluation.json').write_text(json.dumps({'method':'Deterministic CLI runs of Codex-authored specs from stated requests; no independent model evaluation',
                                                     'synthetic_fixture':True,'zoom_import':'not_checked','results':reports},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'output':str(args.out),'passed':len(reports)},ensure_ascii=False))


if __name__=='__main__':main()
