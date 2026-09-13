#!/usr/bin/env python3
"""Inspect/build/validate/preview Zoom flow files; never accesses a Zoom account."""
from __future__ import annotations
import argparse
import copy
import json
import sys
from pathlib import Path
from flow_core import (FlowError, require, read_json, digest, decode, identify, load_profile,
                       basic_issues, graph_info, path_count, separate, equivalent, change_issues,
                       reference_hazards, apply_spec, check_requirements, walk)
from flow_layout import arrange, route, svg

DEFAULT_PROFILE=Path(__file__).resolve().parents[1]/'references'/'voice-export-profile.json'


def write_json(path,data):
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def inspection(document,profile):
    issues=basic_issues(document,profile)
    nodes=decode(document)['state']
    out={'channel':identify(document,profile),'nodes':len(nodes),
         'edges':sum(len(n['transitions']) for n in nodes if isinstance(n,dict) and isinstance(n.get('transitions'),list)), 'issues':issues,
         'schema_scope':'Observed export graph/profile only; not a full Zoom schema'}
    if not issues:
        from collections import Counter
        incoming=Counter(t['next'] for n in nodes for t in n['transitions'])
        out['shared_destinations']={name:count for name,count in incoming.items() if count>1}
        by,comp,groups,cycles=graph_info(nodes)
        out.update(terminal_paths=path_count(nodes),cycles=[groups[i] for i in sorted(cycles)],
                   split_review=reference_hazards(document,profile))
    return out


def verify(document,profile,requirements=None,source=None,mapping=None,kind=None):
    issues=basic_issues(document,profile)
    report={'validation_scope':'local graph, profile, geometry and supplied scenario assertions',
            'profile':{'name':profile['name'],'source':profile['source'],'checked_on':profile['checked_on'],
                       'channel':profile['channel'],'messaging_subchannel':profile.get('messaging_subchannel')},
            'channel':identify(document,profile),'issues':issues,
            'zoom_import':{'status':'not_checked'},'zoom_runtime':{'status':'not_checked'},
            'user_confirmation':{'status':'not_recorded'},'document_sha256':digest(document),
            'unverified':['Zoom import/runtime/rendering','Queue/asset existence and permissions',
                          'Current account/service quotas','User intent beyond supplied assertions']}
    if source is not None:
        report['baseline']=change_issues(basic_issues(source,profile),issues)
        report['source_sha256']=digest(source)
    if issues:
        report['status']='failed';return report,[]
    nodes=decode(document)['state']
    report.update(nodes=len(nodes),edges=sum(len(n['transitions']) for n in nodes),terminal_paths=path_count(nodes))
    _,_,groups,cycles=graph_info(nodes)
    report['cycles']=[groups[i] for i in sorted(cycles)]
    if cycles:report['unverified'].append('Loop bounds/termination require scenario review; finite terminal path count unavailable')
    routes,geometry=route(document,profile);report['geometry']=geometry
    if source is not None and kind in ('layout','split'):
        report['behavior_equivalent']=equivalent(source,document,mapping or {},kind)
    if requirements is not None:
        report['requirements']=check_requirements(document,requirements,(mapping or {}).get('origin'))
    if mapping is not None:report['mapping']=mapping
    # Placeholders never qualify as deliverable Zoom values; they are useful only in fixtures.
    unresolved=[]
    for n in nodes:
        for path,value in walk(n):
            if isinstance(value,str) and any(marker in value for marker in ('FIXTURE_ONLY','UNRESOLVED_')):
                unresolved.append({'widget':n['name'],'path':path})
    report['unresolved_values']=unresolved
    report['delivery_ready']=not unresolved
    report['status']='passed'
    if geometry['overlapping_widgets'] or geometry['unrouted_edges'] or geometry['connectors_through_cards']:
        report['status']='failed'
    if report.get('behavior_equivalent') is False or not report.get('requirements',{'passed':True})['passed']:
        report['status']='failed'
    if unresolved:report['unverified'].append('Synthetic/unresolved values must be replaced with verified account values')
    report['delivery_ready'] &= report['status']=='passed'
    report['local_checks_passed']=report['status']=='passed'
    return report,routes


def summary(report,source_path,operation):
    lines=['# フロー作成結果','',f'- 操作: {operation}',f'- 入力: {source_path}',
           f'- ローカル検証: {report["status"]}',f'- ノード / 接続: {report.get("nodes","未集計")} / {report.get("edges","未集計")}',
           '- Zoomへの取り込み・実行・実画面確認: 未実施',
           '- ユーザーによる確認: 未記録','',
           'ローカル検証は対応プロファイル、グラフ構造、配置、指定されたシナリオの範囲です。',
           '生成SVGの線描画はZoomエディタの描画と一致する保証はありません。','']
    if 'behavior_equivalent' in report:lines.append(f'処理の同等性: {report["behavior_equivalent"]}')
    if 'requirements' in report:
        lines+=['','## 要件への対応','']
        for r in report['requirements']['requirements']:
            lines.append(f'- {r["id"]}: {r["statement"]} — {"PASS" if r["passed"] else "FAIL"} ({", ".join(r["widgets"])})')
    lines+=['','## 未確認・不足','']+[f'- {s}' for s in report.get('unverified',[])]
    if report.get('unresolved_values'):lines.append('- 仮値が残るため、このJSONを取り込み用の完成品として渡さない。verification.jsonのunresolved_valuesを解決する。')
    if report.get('issues'):lines+=['', '## 構造上の問題','',json.dumps(report['issues'],ensure_ascii=False,indent=2)]
    if report.get('geometry',{}).get('shared_destinations'):
        lines+=['','合流は共通処理の再利用として保持されています。全分離の指定時に残った合流は循環などの保持理由を確認してください。']
    lines+=['','## 取り込み時の案内','',
            '取り込みを依頼された場合、対象アカウント・チャネル・キュー・アセットと下書きを確認し、取り込み後のエラーと保存後の表示を確認する。公開は依頼範囲に従う。',
            'ZoomはJSONの手編集をサポート対象としていないため、ローカル合格と取り込み成功を区別する。',
            '[Zoom公式インポート仕様](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058787)','']
    return '\n'.join(lines)


def parser():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    for command in ('inspect','build','validate','preview'):
        c=sub.add_parser(command)
        c.add_argument('--input',required=True,type=Path)
        c.add_argument('--profile',type=Path,default=DEFAULT_PROFILE)
        if command!='inspect':c.add_argument('--out',required=True,type=Path,help='New output directory (never overwrite)')
        if command in ('build','validate'):
            c.add_argument('--requirements',type=Path)
        if command=='build':
            c.add_argument('--spec',type=Path,help='Template-backed new/edit logical specification')
            c.add_argument('--separation',choices=('reuse','terminals','selected','all'),default='reuse')
            c.add_argument('--target',action='append',default=[])
            c.add_argument('--max-nodes',type=int,default=1000,help='Local processing budget, NOT a Zoom service quota')
            c.add_argument('--horizontal-gap',type=float,default=100)
            c.add_argument('--vertical-gap',type=float,default=40)
        if command=='validate':
            c.add_argument('--source',type=Path)
            c.add_argument('--proof',type=Path,help='Earlier verification.json with mapping and source digest')
            c.add_argument('--kind',choices=('layout','split'))
    return p


def main(argv=None):
    args=parser().parse_args(argv)
    try:
        source_path=args.input.resolve(strict=True);raw=source_path.read_bytes();document=json.loads(raw)
        profile=load_profile(args.profile)
        if args.command=='inspect':
            result=inspection(document,profile);print(json.dumps(result,ensure_ascii=False,indent=2))
            return 0 if not result['issues'] else 2
        out=args.out.resolve()
        require(not out.exists(),'Output directory already exists; choose a fresh path: '+str(out))
        require(out!=source_path and source_path not in out.parents,'Output cannot replace or be inside an input file')
        before=copy.deepcopy(document);mapping=None;kind=None
        requirements=read_json(args.requirements) if getattr(args,'requirements',None) else None
        operation=args.command
        if args.command=='build':
            require(args.max_nodes>0,'max-nodes must be positive')
            issues=basic_issues(before,profile)
            # An edit may repair baseline graph problems. Layout/split may not silently discard them.
            spec=read_json(args.spec) if args.spec else None
            if spec:
                require(identify(before,profile)['channel']!='unverified','Obtain matching channel export/profile')
                document=apply_spec(before,spec,profile)
                requirements=requirements or spec.get('verification')
                require(requirements is not None,'New/edit needs requirement-to-scenario verification')
                operation=spec['mode']
            else:
                require(not issues,'Source issues need explicit repair before layout/split: '+json.dumps(issues,ensure_ascii=False))
            require(not basic_issues(document,profile),'Generated logical graph fails profile/graph checks: '+json.dumps(basic_issues(document,profile),ensure_ascii=False))
            require(args.separation=='selected' or not args.target,'--target requires --separation selected')
            require(args.separation!='selected' or args.target,'selected needs at least one --target')
            semantic_base=copy.deepcopy(document)
            document,mapping=separate(document,profile,args.separation,args.target,args.max_nodes)
            document=arrange(document,profile,args.horizontal_gap,args.vertical_gap)
            kind='layout' if args.separation=='reuse' else 'split'
            report,routes=verify(document,profile,requirements,semantic_base,mapping,kind)
            if spec:
                report['transformation_equivalent']=report.pop('behavior_equivalent',None)
                report['baseline']=change_issues(issues,basic_issues(document,profile))
                report['input_sha256']=digest(before)
                report['spec_sha256']=digest(spec)
                report['unverified'].append('Intent-to-spec mapping is authored by Codex; scenario coverage needs semantic review')
            report['operation']=operation;report['separation']=args.separation;report['comparison_kind']=kind
            report['local_max_nodes']=args.max_nodes
            report['zoom_max_nodes']=profile.get('verified_max_nodes','unverified')
        else:
            comparison_source=read_json(args.source) if getattr(args,'source',None) else None
            proof=read_json(args.proof) if getattr(args,'proof',None) else None
            if args.command=='validate':
                require(bool(args.source)==bool(args.kind),'--source and --kind are required together')
                if args.kind=='split':
                    require(proof is not None,'Split equivalence requires --proof')
                    require(proof.get('source_sha256')==digest(comparison_source),'Proof source digest mismatch')
                    mapping=proof.get('mapping')
                    require(mapping is not None,'Proof missing mapping')
                    # Only allow rewriting paths that the active profile owns.
                    import re
                    from flow_core import matches
                    for changes in mapping['id_changes'].values():
                        require(all(any(matches(path,p) for p in profile['owned_id_paths']) for path in changes),
                                'Proof attempts to normalize non-owned settings/IDs')
                kind=args.kind
            report,routes=verify(document,profile,requirements,comparison_source,mapping,kind)
            report['operation']=operation
        report['source_file']=str(source_path)
        # Persist checks first; invalid results are diagnostic artifacts, never disguised as complete.
        out.mkdir(parents=True,exist_ok=False)
        write_json(out/'flow.json',document)
        require(read_json(out/'flow.json')==document,'JSON readback mismatch')
        report['json_readback']=True
        if not report.get('issues'):
            (out/'flow.svg').write_text(svg(document,profile,routes),encoding='utf-8')
        write_json(out/'verification.json',report)
        (out/'summary.md').write_text(summary(report,source_path,operation),encoding='utf-8')
        require(source_path.read_bytes()==raw,'Source changed during processing')
        print(json.dumps({'output':str(out),'status':report['status'],'nodes':report.get('nodes'),
                          'delivery_ready':report.get('delivery_ready',False),'zoom_import':'not_checked'},ensure_ascii=False))
        return 0 if report['status']=='passed' else 2
    except (FlowError,KeyError,TypeError,IndexError,ValueError,OSError,RecursionError) as e:
        print(json.dumps({'status':'blocked','error':str(e)},ensure_ascii=False),file=sys.stderr)
        return 2


if __name__=='__main__':
    sys.exit(main())
