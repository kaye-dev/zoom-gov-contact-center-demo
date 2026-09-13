"""Size-aware compact tree/layered layout and obstacle-checked SVG routing."""
from __future__ import annotations
import copy
import html
from collections import Counter
from flow_core import decode, encode, graph_info, require


def size(node, profile):
    dims=profile['dimensions'].get(node['type'], profile['dimensions'].get('default'))
    require(dims is not None, 'Widget dimensions need a profile entry: '+node['type'])
    width=max(dims['width'], 36+len(node['name'])*9)
    return width, dims['header']+dims['exit_height']*len(node['transitions'])


def ports(node, profile):
    dims=profile['dimensions'].get(node['type'],profile['dimensions'].get('default'))
    return node['top']+dims.get('input_y',45), [node['top']+dims['header']+dims['exit_height']*(i+.5)
                                               for i in range(len(node['transitions']))]


def rectangles(document, profile):
    return {n['name']:(n['left'],n['top'],*size(n,profile)) for n in decode(document)['state']}


def arrange(document, profile, hgap=100, vgap=40):
    require(hgap>=32 and vgap>=24, 'Routing needs horizontal gap >=32 and vertical gap >=24 pixels')
    nodes=copy.deepcopy(decode(document)['state']); by,comp,groups,cycles=graph_info(nodes)
    incoming=Counter(t['next'] for n in nodes for t in n['transitions'])
    root=next(n['name'] for n in nodes if n.get('start') is True or n['type']=='Start')
    levels={}; coords={}
    if not cycles and all(incoming[n]==1 for n in by if n!=root):
        # Bottom-up contour packing preserves exit order without large empty leaf rows.
        packed={}
        for group in reversed(groups):
            name=group[0]; children=[t['next'] for t in by[name]['transitions']]
            contour={}; local={}; root_centers=[]
            for child in children:
                child_coords, child_contour=packed.pop(child)
                shift=max([contour[d][1]+vgap-lo for d,(lo,hi) in child_contour.items() if d in contour] or [0])
                for key,(depth,y) in child_coords.items():local[key]=(depth+1,y+shift)
                root_centers.append(child_coords[child][1]+shift+size(by[child],profile)[1]/2)
                for d,(lo,hi) in child_contour.items():
                    old=contour.get(d,(lo+shift,hi+shift))
                    contour[d]=(min(old[0],lo+shift),max(old[1],hi+shift))
            height=size(by[name],profile)[1]
            y=(root_centers[0]+root_centers[-1])/2-height/2 if children else 0
            local[name]=(0,y)
            packed[name]=(local,{0:(y,y+height),**{d+1:v for d,v in contour.items()}})
        coords=packed[root][0]
    else:
        # Condensation ranks allow explicit loops; barycenter ordering groups related branches.
        rank={i:0 for i in range(len(groups))}
        for i,g in enumerate(groups):
            for name in g:
                for t in by[name]['transitions']:
                    j=comp[t['next']]
                    if j!=i:rank[j]=max(rank[j],rank[i]+1)
        parents={n:[] for n in by}
        for n in nodes:
            for t in n['transitions']:parents[t['next']].append(n['name'])
        for level in sorted(set(rank.values())):
            members=[n['name'] for n in nodes if rank[comp[n['name']]]==level]
            def score(name):
                previous=[coords[p][1]+size(by[p],profile)[1]/2 for p in parents[name] if p in coords]
                return sum(previous)/len(previous) if previous else 0
            members.sort(key=score); bottom=0
            for name in members:
                height=size(by[name],profile)[1]
                y=max(bottom,score(name)-height/2)
                coords[name]=(level,y);bottom=y+height+vgap
    min_y=min(y for _,y in coords.values())
    for name,(level,y) in coords.items():levels[level]=max(levels.get(level,0),size(by[name],profile)[0])
    x=80; xs={}
    for level in sorted(levels):xs[level]=x;x+=levels[level]+hgap
    for n in nodes:
        level,y=coords[n['name']];n['left']=round(xs[level],2);n['top']=round(y-min_y+80,2)
    return encode(document,nodes)


def crosses(a,b,rect):
    x,y,w,h=rect; x1,y1=a; x2,y2=b; eps=.001
    if abs(y1-y2)<eps:
        return y+eps<y1<y+h-eps and max(min(x1,x2),x+eps)<min(max(x1,x2),x+w-eps)
    if abs(x1-x2)<eps:
        return x+eps<x1<x+w-eps and max(min(y1,y2),y+eps)<min(max(y1,y2),y+h-eps)
    return True


def overlaps(rects):
    result=[]; items=list(rects.items())
    for i,(a,(x,y,w,h)) in enumerate(items):
        for b,(xx,yy,ww,hh) in items[i+1:]:
            if max(x,xx)<min(x+w,xx+ww) and max(y,yy)<min(y+h,yy+hh):result.append([a,b])
    return result


def route(document, profile):
    nodes=decode(document)['state'];by={n['name']:n for n in nodes};rects=rectangles(document,profile)
    routes=[];fails=[];used=Counter()
    def clean(points):
        out=[]
        for p in points:
            if not out or p!=out[-1]:out.append(p)
        return out
    def clear(points):
        return all(not crosses(a,b,r) for a,b in zip(points,points[1:]) for r in rects.values())
    for n in nodes:
        x,y,w,h=rects[n['name']]; _,exit_ys=ports(n,profile)
        for i,t in enumerate(n['transitions']):
            target=by[t['next']];dx,dy,dw,dh=rects[target['name']]
            sy=exit_ys[i];ty=ports(target,profile)[0];sx=x+w
            candidates=[]
            # Adjacent columns need only a local lane. Different exits use separated lanes.
            if dx>sx:
                for fraction in (.5,.3,.7):
                    mid=sx+(dx-sx)*fraction
                    candidates.append(clean([(sx,sy),(mid,sy),(mid,ty),(dx,ty)]))
            left_gap=min([rx-sx for rx,ry,rw,rh in rects.values() if rx>sx] or [100])
            right_gap=min([dx-(rx+rw) for rx,ry,rw,rh in rects.values() if rx+rw<dx] or [100])
            a=sx+min(24,left_gap*.4);b=dx-min(24,right_gap*.4)
            lanes={sy,ty,min(sy,ty)-24,max(sy,ty)+24}
            for rx,ry,rw,rh in rects.values():lanes.update((ry-12,ry+rh+12))
            for lane in sorted(lanes,key=lambda yy:abs(yy-sy)+abs(yy-ty)):
                candidates.append(clean([(sx,sy),(a,sy),(a,lane),(b,lane),(b,ty),(dx,ty)]))
            best=None;best_score=float('inf')
            for points in candidates:
                segments=list(zip(points,points[1:]))
                cost=sum(abs(p[0]-q[0])+abs(p[1]-q[1]) for p,q in segments)+20*len(segments)
                cost+=sum(100*used[tuple(sorted((p,q)))] for p,q in segments)
                if cost<best_score and clear(points):best,best_score=points,cost
            if best is None:
                fails.append({'from':n['name'],'exit':i,'to':target['name']})
                continue
            for p,q in zip(best,best[1:]):used[tuple(sorted((p,q)))]+=1
            routes.append({'from':n['name'],'exit':i,'to':target['name'],'points':best})
    hits=[]
    for r in routes:
        for a,b in zip(r['points'],r['points'][1:]):
            for name,rect in rects.items():
                if crosses(a,b,rect):hits.append({'from':r['from'],'to':r['to'],'widget':name})
    return routes,{'overlapping_widgets':overlaps(rects),'unrouted_edges':fails,
                   'connectors_through_cards':hits,'shared_exact_segments':sum(v-1 for v in used.values() if v>1),
                   'shared_destinations':dict((k,v) for k,v in Counter(t['next'] for n in nodes for t in n['transitions']).items() if v>1),
                   'zoom_rendering':'unverified','dimensions_basis':profile.get('dimensions_basis','profile')}


def svg(document,profile,routes):
    nodes=decode(document)['state'];rects=rectangles(document,profile)
    all_x=[r[0] for r in rects.values()]+[r[0]+r[2] for r in rects.values()]+[p[0] for e in routes for p in e['points']]
    all_y=[r[1] for r in rects.values()]+[r[1]+r[3] for r in rects.values()]+[p[1] for e in routes for p in e['points']]
    x0=min(all_x)-40;y0=min(all_y)-40;width=max(all_x)-x0+40;height=max(all_y)-y0+40
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{x0} {y0} {width} {height}">',
           '<title>Flow layout preview (Zoom rendering unverified)</title>',
           f'<rect x="{x0}" y="{y0}" width="{width}" height="{height}" fill="#f8fafc"/>',
           '<style>text{font-family:system-ui,sans-serif;fill:#172554;font-size:13px}.name{font-size:15px;font-weight:600}.type{fill:#64748b;font-size:12px}</style>',
           '<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0L7,3.5L0,7" fill="#64748b"/></marker></defs>']
    for index,edge in enumerate(routes):
        pts=' '.join(f'{x},{y}' for x,y in edge['points']);desc=f"{edge['from']} [exit {edge['exit']}] → {edge['to']}"
        parts.append(f'<polyline points="{pts}" fill="none" stroke="#64748b" stroke-width="1.4" marker-end="url(#arrow)"><title>{html.escape(desc)}</title></polyline>')
    for n in nodes:
        x,y,w,h=rects[n['name']];_,exit_ys=ports(n,profile)
        parts.append(f'<g><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="white" stroke="#cbd5e1"/>')
        parts.append(f'<text class="type" x="{x+12}" y="{y+21}">{html.escape(n["type"])}</text>')
        parts.append(f'<text class="name" x="{x+12}" y="{y+46}">{html.escape(n["name"])}</text>')
        for i,t in enumerate(n['transitions']):
            label=str(t.get('friendlyName',t['event']));limit=max(12,int((w-50)/14))
            short=label if len(label)<=limit else label[:limit-1]+'…'
            yy=exit_ys[i]
            parts.append(f'<text x="{x+12}" y="{yy+4}"><title>{html.escape(label)}</title>{i}: {html.escape(short)}</text><circle cx="{x+w}" cy="{yy}" r="3" fill="#64748b"/>')
        parts.append('</g>')
    parts.append('</svg>');return '\n'.join(parts)+'\n'
