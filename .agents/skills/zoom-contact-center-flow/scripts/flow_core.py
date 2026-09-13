"""Conservative Zoom export graph transformations. Python 3 standard library only."""
from __future__ import annotations

import copy
import hashlib
import json
import math
import re
import uuid
from collections import Counter, deque
from pathlib import Path


class FlowError(ValueError):
    pass


def require(ok, message):
    if not ok:
        raise FlowError(message)


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':')).encode()).hexdigest()


def walk(value, path=''):
    yield path, value
    if isinstance(value, dict):
        for key, val in value.items():
            yield from walk(val, path + '/' + key.replace('~', '~0').replace('/', '~1'))
    elif isinstance(value, list):
        for i, val in enumerate(value):
            yield from walk(val, path + '/' + str(i))


def matches(path, pattern):
    a, b = path.split('/'), pattern.split('/')
    return len(a) == len(b) and all(x == y or y == '*' for x, y in zip(a, b))


def get(value, pointer):
    for part in pointer.split('/')[1:]:
        key = part.replace('~1', '/').replace('~0', '~')
        value = value[int(key)] if isinstance(value, list) else value[key]
    return value


def put(value, pointer, replacement):
    require(pointer.startswith('/') and pointer != '/', 'A non-root JSON pointer is required')
    parent_path, key = pointer.rsplit('/', 1)
    parent = get(value, parent_path)
    key = key.replace('~1', '/').replace('~0', '~')
    if isinstance(parent, list):
        index = int(key)
        require(0 <= index < len(parent), 'Patch index does not exist: ' + pointer)
        parent[index] = copy.deepcopy(replacement)
    else:
        require(key in parent, 'Patch key does not exist: ' + pointer)
        parent[key] = copy.deepcopy(replacement)


def decode(document):
    require(isinstance(document, dict) and isinstance(document.get('widgetsJson'), str),
            'Unverified envelope: need an export with string widgetsJson; do not guess its schema')
    graph = json.loads(document['widgetsJson'])
    require(isinstance(graph, dict) and isinstance(graph.get('state'), list),
            'Unverified graph: expected widgetsJson.state; obtain the channel export/profile')
    for key in ('localVariables', 'globalVariables'):
        if key in document:
            require(isinstance(document[key], str), key + ' must retain its exported string encoding')
            json.loads(document[key])
    return graph


def encode(document, nodes):
    out = copy.deepcopy(document)
    graph = decode(out)
    graph['state'] = nodes
    out['widgetsJson'] = json.dumps(graph, ensure_ascii=False, separators=(',', ':'))
    return out


def identify(document, profile=None):
    match = profile and all(k in document and document[k] == v
                            for k, v in profile['envelope_match'].items())
    return {'channel': profile['channel'] if match else 'unverified',
            'messaging_subchannel': profile.get('messaging_subchannel') if match else None,
            'profile': profile.get('name') if match else None,
            'raw_discriminators': {k: document.get(k) for k in ('studioType', 'studioScope')},
            'status': 'profile-matched' if match else 'channel-export/profile-required'}


def load_profile(path):
    p = read_json(path)
    require(p.get('channel') in ('voice', 'video', 'messaging', 'email', 'work_item'),
            'Profile channel must be voice/video/messaging/email/work_item')
    require(p.get('source') and p.get('checked_on') and p.get('envelope_match') and p.get('types'),
            'Profile needs source, checked_on, exact envelope_match and types')
    if p['channel'] == 'messaging':
        require(p.get('messaging_subchannel'), 'Profile must identify the messaging subchannel')
    return p


def rule_for(node, profile):
    rule = profile['types'].get(node['type'])
    require(rule is not None, 'Unverified widget type: ' + node['type'])
    if 'variants' in rule:
        value = get(node, rule['variant_pointer'])
        rule = rule['variants'].get(str(value))
        require(rule is not None, 'Unverified widget variant: ' + node['name'])
    return rule


def owned(node, profile):
    patterns = profile['owned_id_paths']
    return {path: val for path, val in walk(node)
            if isinstance(val, str) and val and any(matches(path, p) for p in patterns)}


def basic_issues(document, profile=None):
    nodes = decode(document)['state']
    issues = []
    def issue(code, widget='', detail=''):
        issues.append({'code': code, 'widget': widget, 'detail': detail})
    names, ids = [], []
    for i, n in enumerate(nodes):
        if not isinstance(n, dict) or any(k not in n for k in ('name', 'id', 'type', 'transitions')):
            issue('invalid-node', str(i)); continue
        if not all(isinstance(n[k], str) and n[k] for k in ('name', 'id', 'type')):
            issue('invalid-node-identity', str(i)); continue
        name = n['name']; names.append(name)
        if not isinstance(n['transitions'], list):
            issue('invalid-transitions', name); continue
        ids.append(n['id'])
        for t in n['transitions']:
            if not isinstance(t, dict) or not all(isinstance(t.get(k), str) and t[k]
                                                  for k in ('id', 'event', 'next')):
                issue('invalid-exit', name); continue
            ids.append(t['id'])
        if profile:
            try:
                rule = rule_for(n, profile)
                for key in rule.get('required_paths', []):
                    get(n, key)
                for key in rule.get('nonempty_paths', []):
                    if not get(n, key): issue('required-value', name, key)
                expected = rule.get('exit_counts', {})
                actual = Counter(t['event'] for t in n['transitions'])
                for event, bounds in expected.items():
                    if not bounds[0] <= actual[event] <= bounds[1]:
                        issue('required-exit', name, event)
                for event in rule.get('unique_condition_events', []):
                    conditions = [t.get('condition') for t in n['transitions'] if t['event']==event]
                    if any(not c for c in conditions) or len({digest(c) for c in conditions}) != len(conditions):
                        issue('ambiguous-condition', name, event)
                for event in actual.keys() - expected.keys():
                    issue('unverified-exit', name, event)
                for path, val in owned(n, profile).items():
                    if path != '/id' and not re.fullmatch(r'/transitions/\d+/id', path):
                        ids.append(val)
            except (FlowError, KeyError, TypeError, IndexError) as e:
                issue('profile-mismatch', name, str(e))
        for key in ('left', 'top'):
            if not isinstance(n.get(key), (int, float)) or not math.isfinite(n[key]):
                issue('invalid-coordinate', name, key)
    for n, count in Counter(names).items():
        if count > 1: issue('duplicate-name', n)
    if len(ids) != len(set(ids)): issue('duplicate-internal-id')
    if len(names) != len(nodes) or len(names) != len(set(names)) or any(
            i['code'] in ('invalid-exit', 'invalid-transitions') for i in issues):
        return issues
    lookup = {n['name']: n for n in nodes}
    starts = [n['name'] for n in nodes if n.get('start') is True or n['type'] == 'Start']
    if len(starts) != 1: issue('start-count', detail=str(len(starts)))
    for n in nodes:
        for t in n['transitions']:
            if t['next'] not in lookup: issue('missing-target', n['name'], t['next'])
            if t['next'] in starts: issue('edge-to-start', n['name'])
    if len(starts) == 1:
        seen, todo = set(), [starts[0]]
        while todo:
            name = todo.pop()
            if name in seen or name not in lookup: continue
            seen.add(name); todo.extend(t['next'] for t in lookup[name]['transitions'])
        for name in lookup.keys() - seen: issue('unreachable', name)
    if profile and identify(document, profile)['channel'] == 'unverified':
        issue('channel-profile-mismatch')
    return issues


def graph_info(nodes):
    """Iterative SCC and condensation order: bounded even on long cycles."""
    by = {n['name']: n for n in nodes}
    adjacency = {name: [t['next'] for t in n['transitions']] for name, n in by.items()}
    reverse = {name: [] for name in by}
    for name, targets in adjacency.items():
        for target in targets: reverse[target].append(name)
    seen, order = set(), []
    for root in by:
        stack = [(root, False)]
        while stack:
            name, done = stack.pop()
            if done: order.append(name); continue
            if name in seen: continue
            seen.add(name); stack.append((name, True))
            stack.extend((x, False) for x in reversed(adjacency[name]) if x not in seen)
    component, groups = {}, []
    for root in reversed(order):
        if root in component: continue
        index = len(groups); group = []; stack = [root]
        while stack:
            name = stack.pop()
            if name in component: continue
            component[name] = index; group.append(name); stack.extend(reverse[name])
        groups.append(group)
    cycles = {i for i, g in enumerate(groups) if len(g) > 1 or g[0] in adjacency[g[0]]}
    # Kosaraju's order is a topological order of the condensation graph.
    return by, component, groups, cycles


def path_count(nodes):
    by, comp, groups, cycles = graph_info(nodes)
    if cycles: return None
    count = {}
    for group in reversed(groups):
        name = group[0]
        count[name] = sum(count[t['next']] for t in by[name]['transitions']) or 1
    start = next(n['name'] for n in nodes if n.get('start') is True or n['type'] == 'Start')
    return count[start]


def reference_hazards(document, profile):
    """Detect references outside explicitly owned definitions/edge targets. Never rewrite code."""
    nodes = decode(document)['state']
    tokens = {n['name'] for n in nodes} | {v for n in nodes for v in owned(n, profile).values()}
    pattern = re.compile(r'(?<![\w])(?:' + '|'.join(re.escape(x) for x in sorted(tokens, key=len, reverse=True)) + r')(?![\w])')
    hazards = []
    for n in nodes:
        for path, value in walk(n):
            if path in ('/name', '/type') or any(matches(path, p) for p in profile['owned_id_paths']) or matches(path, '/transitions/*/next'):
                continue
            if isinstance(value, str) and value:
                # Unknown embedded IDs are ambiguous, even if not referenced elsewhere.
                key = path.rsplit('/', 1)[-1]
                id_like = key.lower().endswith('id') or key == 'id'
                classified = any(matches(path, p) for p in profile.get('external_id_paths', []))
                if id_like and not classified:
                    hazards.append({'widget': n['name'], 'path': path, 'reason': 'unclassified-id'})
                elif pattern.search(value):
                    hazards.append({'widget': n['name'], 'path': path, 'reason': 'widget-or-internal-id-reference'})
                elif re.search(r'(variable|script|expression)|/code(?:/|$)', path, re.I):
                    hazards.append({'widget': n['name'], 'path': path, 'reason': 'variable-or-executable-content-review'})
    extra = copy.deepcopy(document); extra.pop('widgetsJson')
    graph = decode(document); graph.pop('state')
    for namespace, data in [('envelope', extra), ('graph', graph)]:
        for path, value in walk(data):
            if isinstance(value, str) and pattern.search(value):
                hazards.append({'widget': namespace, 'path': path, 'reason': 'widget-or-internal-id-reference'})
    for key in ('localVariables', 'globalVariables'):
        if document.get(key) and json.loads(document[key]):
            hazards.append({'widget': 'envelope', 'path': '/' + key, 'reason': 'variable-scope-review'})
    return hazards


def allocate_name(original, index, used, reserved, limit):
    if index == 1 and original not in used:
        used.add(original); return original
    while True:
        suffix = '_' + str(index).zfill(3)
        require(len(suffix) < limit, 'Naming budget exhausted')
        name = original[:limit-len(suffix)] + suffix
        if name not in used and name not in reserved:
            used.add(name); return name
        index += 1


def fresh_node(node, profile, name):
    out = copy.deepcopy(node); out['name'] = name
    mapping = {}
    for path, value in owned(node, profile).items():
        new = str(uuid.uuid4()); mapping[path] = {'from': value, 'to': new}
        put(out, path, new)
    return out, mapping


def expansion_count(nodes, mode, selected):
    by, comp, groups, cycles = graph_info(nodes)
    incoming = Counter(); incoming[comp[next(n['name'] for n in nodes if n.get('start') is True or n['type']=='Start')]] = 1
    copies = {}
    for i, group in enumerate(groups):
        name = group[0]
        copies[i] = 1 if i in cycles or mode != 'all' and name not in selected else incoming[i]
        for n in group:
            for t in by[n]['transitions']:
                if comp[t['next']] != i: incoming[comp[t['next']]] += copies[i]
    return sum(copies[i] * len(g) for i, g in enumerate(groups))


def separate(document, profile, mode='reuse', selected=(), max_nodes=1000):
    nodes = decode(document)['state']; by, comp, groups, cycles = graph_info(nodes)
    selected = set(selected)
    require(selected <= by.keys(), 'Unknown split target: ' + ', '.join(selected-by.keys()))
    if mode == 'terminals':
        selected = {n['name'] for n in nodes if not n['transitions'] and n['type'] == 'RouteTo'
                    and n.get('properties', {}).get('routeTo') == 'Disconnect'}
    estimate = expansion_count(nodes, mode, selected)
    limit = min(max_nodes, profile.get('verified_max_nodes', max_nodes))
    require(estimate <= limit, f'Expansion needs {estimate} nodes; limit {limit}. Choose reuse/selected split or a reviewed higher local budget')
    if estimate > len(nodes):
        hazards = reference_hazards(document, profile)
        require(not hazards, 'Split requires reference review: ' + json.dumps(hazards[:8], ensure_ascii=False))
    if mode == 'reuse':
        return copy.deepcopy(document), {'origin': {n:n for n in by}, 'id_changes': {n:{} for n in by},
                                        'estimated_nodes': len(nodes), 'preserved_cycles': [groups[i] for i in sorted(cycles)]}
    counts = Counter(); used = set(); reserved = set(by); result = []; origin = {}; id_map = {}; memo = {}
    tasks = deque()
    def request(name):
        i = comp[name]
        shared = i in cycles or mode != 'all' and name not in selected
        if shared and name in memo: return memo[name]
        counts[name] += 1
        newname = allocate_name(name, counts[name], used, reserved, profile.get('name_limit', 64))
        if counts[name] > 1:
            out, changes = fresh_node(by[name], profile, newname)
        else:
            out, changes = copy.deepcopy(by[name]), {}
        out['name'] = newname; result.append(out); origin[newname] = name; id_map[newname] = changes
        if shared: memo[name] = newname
        tasks.append(out); return newname
    root = next(n['name'] for n in nodes if n.get('start') is True or n['type']=='Start')
    request(root)
    while tasks:
        out = tasks.popleft()
        for t in out['transitions']: t['next'] = request(t['next'])
    require(len(result) == estimate, 'Expansion estimator mismatch')
    return encode(document, result), {'origin': origin, 'id_changes': id_map,
                                     'estimated_nodes': estimate, 'preserved_cycles': [groups[i] for i in sorted(cycles)]}


def equivalent(before, after, mapping, kind):
    old = decode(before); new = decode(after)
    left, right = copy.deepcopy(before), copy.deepcopy(after)
    left.pop('widgetsJson'); right.pop('widgetsJson')
    if left != right: return False
    if {k:v for k,v in old.items() if k!='state'} != {k:v for k,v in new.items() if k!='state'}: return False
    lookup = {n['name']: n for n in old['state']}
    if kind == 'layout':
        if len(old['state']) != len(new['state']): return False
        for a,b in zip(old['state'],new['state']):
            a,b = copy.deepcopy(a), copy.deepcopy(b)
            for key in ('top','left'): a.pop(key,None); b.pop(key,None)
            if a != b: return False
        return True
    if set(mapping['origin']) != {n['name'] for n in new['state']}: return False
    if set(mapping['origin'].values()) != set(lookup): return False
    for n in new['state']:
        base = mapping['origin'].get(n['name']); candidate = copy.deepcopy(n)
        if base not in lookup: return False
        for path, change in mapping['id_changes'].get(n['name'], {}).items():
            if get(candidate,path) != change['to'] or get(lookup[base],path) != change['from']: return False
            put(candidate,path,change['from'])
        candidate['name'] = base
        for t in candidate['transitions']:
            if t['next'] not in mapping['origin']: return False
            t['next'] = mapping['origin'][t['next']]
        a = copy.deepcopy(lookup[base])
        for key in ('top','left'): candidate.pop(key,None); a.pop(key,None)
        if candidate != a: return False
    # Per-copy ordered transition equality is a bisimulation, including cycles.
    # The root must represent the source root (reachability checked separately).
    roots = [n for n in new['state'] if n.get('start') is True or n['type']=='Start']
    return len(roots)==1 and mapping['origin'][roots[0]['name']] == next(n['name'] for n in old['state'] if n.get('start') is True or n['type']=='Start')


def change_issues(before, after):
    b = {json.dumps(x,sort_keys=True) for x in before}; a = {json.dumps(x,sort_keys=True) for x in after}
    return {key:[json.loads(x) for x in sorted(values)] for key,values in
            [('pre_existing',a&b),('introduced',a-b),('resolved',b-a)]}


def check_requirements(document, requirements, origin=None):
    nodes = decode(document)['state']; by = {n['name']:n for n in nodes}
    origin = origin or {n:n for n in by}
    tests = []; reqs = requirements.get('requirements', [])
    scenarios = requirements.get('scenarios', [])
    require(reqs and scenarios, 'Creation/edit needs requirements and executable scenarios')
    require(len({r['id'] for r in reqs}) == len(reqs), 'Duplicate requirement ID')
    require(len({s['id'] for s in scenarios}) == len(scenarios), 'Duplicate scenario ID')
    start = next(n['name'] for n in nodes if n.get('start') is True or n['type']=='Start')
    for s in scenarios:
        current = start; passed = True; visited = [origin[current]]; assertions = 0
        for step in s['steps']:
            if step['widget'] != origin[current]: passed=False; break
            for assertion in step.get('assert', []):
                assertions += 1
                try: passed &= get(by[current],assertion['pointer']) == assertion['equals']
                except (KeyError,IndexError,TypeError): passed=False
            exit_index = step['exit']
            if not isinstance(exit_index,int) or not 0<=exit_index<len(by[current]['transitions']): passed=False; break
            current = by[current]['transitions'][exit_index]['next']; visited.append(origin[current])
        passed &= origin[current] == s['expected_end']
        if s.get('terminal',False): passed &= not by[current]['transitions']
        for assertion in s.get('end_assert',[]):
            assertions += 1
            try: passed &= get(by[current],assertion['pointer']) == assertion['equals']
            except (KeyError,IndexError,TypeError): passed=False
        tests.append({'id':s['id'],'passed':bool(passed),'visited':visited,'assertions':assertions})
    bytest = {t['id']:t for t in tests}
    coverage = []
    for r in reqs:
        named = r.get('widgets',[]); linked = r.get('scenarios',[])
        ok = bool(r.get('statement') and named and linked) and all(x in origin.values() for x in named)
        ok &= all(x in bytest and bytest[x]['passed'] for x in linked)
        ok &= all(any(x in bytest[s]['visited'] for s in linked if s in bytest) for x in named)
        coverage.append({'id':r['id'],'statement':r['statement'],'passed':bool(ok),
                         'widgets':named,'scenarios':linked})
    return {'passed':all(x['passed'] for x in tests+coverage), 'scenarios':tests, 'requirements':coverage,
            'scope':'Static path/property assertions; not media playback, queue availability or live execution'}


def apply_spec(document, spec, profile):
    """Model converts intent into template-backed nodes or explicit pointer edits."""
    mode = spec['mode']; out = copy.deepcopy(document); nodes = decode(out)['state']
    if mode == 'new':
        require(document.get('eventAction') in (None, '', [], {}), 'New-flow template has event actions; prepare a reviewed clean template')
        require(not reference_hazards(document,profile), 'Template contains references requiring scope review')
        templates = {n['name']:n for n in nodes}; result=[]; names=set()
        for item in spec['nodes']:
            name = item['name']; require(isinstance(name,str) and 0<len(name)<=profile.get('name_limit',64), 'New name exceeds profile naming convention'); require(name not in names, 'Duplicate logical name'); names.add(name)
            require(item['template'] in templates, 'Missing verified widget template')
            node,_ = fresh_node(templates[item['template']],profile,name)
            for patch in item.get('set',[]): put(node,patch['pointer'],patch['value'])
            require(len(item['targets'])==len(node['transitions']), 'Every template exit needs a target')
            for t,target in zip(node['transitions'],item['targets']): t['next']=target
            result.append(node)
        out=encode(out,result)
    elif mode == 'edit':
        by={n['name']:n for n in nodes}
        for edit in spec['edits']:
            require(edit['widget'] in by, 'Edit target does not exist')
            require(edit['pointer'] not in ('/name','/id','/type') and not re.fullmatch(r'/transitions/\d+/id',edit['pointer']),
                    'Identity/type changes require a verified template and explicit reference migration')
            previous_identity = owned(by[edit['widget']], profile)
            put(by[edit['widget']],edit['pointer'],edit['value'])
            current_identity = owned(by[edit['widget']], profile)
            require(all(current_identity.get(path)==value for path,value in previous_identity.items()),
                    'Edit changes/removes owned IDs; use a verified template and explicit identity migration')
        out=encode(out,nodes)
    else: raise FlowError('Spec mode must be new or edit')
    for patch in spec.get('envelope_set',[]):
        require(patch['pointer'] in ('/flowName','/desc','/versionDesc'), 'Envelope schema/identity cannot be patched')
        put(out,patch['pointer'],patch['value'])
    return out
