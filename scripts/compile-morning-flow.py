"""Compile a bounded Central line directional study from pinned NUMBAT evidence."""
import argparse
import hashlib
import importlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile

numbat = importlib.import_module('compile-numbat')
STATIONS = [('STPu', '940GZZLUSPU'), ('BNKu', '940GZZLUBNK'), ('LSTu', '940GZZLULVT'),
            ('BNGu', '940GZZLUBLG'), ('MLEu', '940GZZLUMED'), ('SFDu', '940GZZLUSTD'), ('LEYu', '940GZZLULYN')]

def sample(points, count=33):
    lengths = [0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + math.dist(a, b))
    result = []
    for i in range(count):
        distance = lengths[-1] * i / (count - 1)
        j = next((j for j in range(1, len(points)) if lengths[j] >= distance), len(points)-1)
        fraction = (distance - lengths[j-1]) / (lengths[j]-lengths[j-1]) if lengths[j] > lengths[j-1] else 0
        result.append([round(a + (b-a)*fraction, 6) for a,b in zip(points[j-1],points[j])])
    return result

def compile_flow(workbook):
    if hashlib.sha256(Path(workbook).read_bytes()).hexdigest() != numbat.SOURCE_SHA256:
        raise ValueError('Re-audit a changed Friday workbook')
    network_path = Path('fixtures/tfl/all-change-rail-led-morning.json')
    diagram_path = Path('fixtures/tfl/all-change-diagram.json')
    network, diagram = [json.loads(p.read_text()) for p in [network_path, diagram_path]]
    if hashlib.sha256(network_path.read_bytes()).hexdigest() != diagram['metadata']['sourceSha256']:
        raise ValueError('Diagram/network identity mismatch')
    catalogue = json.loads(Path('fixtures/passenger-demand/catalogue.json').read_text())
    stops = {stop[4]: (i, stop) for i, stop in enumerate(network['stops'])}
    diagram_stops = {s[0]: s[1:] for s in diagram['stops']}
    stations = []
    for asc, stop_id in STATIONS:
        _, stop = stops[stop_id]
        area = catalogue['areas'][asc]
        stations.append({**area, 'stopId': stop_id, 'label': stop[2], 'geo': stop[:2], 'diagram': diagram_stops[stop_id]})
    pairs = {(a[0], b[0]) for a,b in zip(STATIONS, STATIONS[1:])}
    pairs |= {(b,a) for a,b in list(pairs)}
    by_asc = {s['asc']: s for s in stations}
    links, ledger, boarding = [], [], {asc: {} for asc, _ in STATIONS}
    with ZipFile(workbook) as archive:
        strings = [''.join(s.itertext()) for s in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        rel = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = {s.attrib['name']: 'xl/' + rel[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']] for s in ET.fromstring(archive.read('xl/workbook.xml')).find('s:sheets', numbat.NS)}
        for row_number, row in numbat.sheet_rows(archive, sheets['Link_Loads'], strings):
            if row_number == 3: numbat.check_headers(row, 17)
            if row_number <= 3 or row.get(1) != 'Central' or (row.get(5), row.get(8)) not in pairs: continue
            a, b = row[5], row[8]
            for asc, nlc, name in [(a,row[4],row[6]),(b,row[7],row[9])]:
                if (by_asc[asc]['nlc'],by_asc[asc]['name']) != (nlc,name): raise ValueError('Link endpoint mismatch')
            values = numbat.profile(row, 17, 10)
            ai, bi = stops[by_asc[a]['stopId']][0], stops[by_asc[b]['stopId']][0]
            paths = sorted({t['pathSegments'][i] for t in network['trains'] if t['route'] == 'Central'
                            for i,(x,y) in enumerate(zip(t['stops'],t['stops'][1:])) if (x[0],y[0]) == (ai,bi)})
            if not paths: raise ValueError('No matching Central line track')
            path_id = paths[0]
            geo, layout = network['paths'][path_id], diagram['paths'][path_id]
            if math.dist(geo[0], network['stops'][ai][:2]) > 0.001 or math.dist(geo[-1], network['stops'][bi][:2]) > 0.001: raise ValueError('Reversed geography')
            if math.dist(layout[0],diagram_stops[by_asc[a]['stopId']]) > 0.01 or math.dist(layout[-1],diagram_stops[by_asc[b]['stopId']]) > 0.01: raise ValueError('Reversed diagram')
            links.append({'id':row[0], 'from':a, 'to':b, 'direction':row[2], 'values':[round(v,3) for v in values],
                          'total':round(row[10],3), 'geo':sample(geo), 'diagram':sample(layout)})
            ledger.append({'sheet':'Link_Loads','row':row_number,'id':row[0], 'total':row[10], 'pathIndex':path_id, 'candidatePaths':paths})
        for sheet, metric in [('Station_Boarders','boarders'),('Station_Alighters','alighters')]:
            seen = set()
            for row_number,row in numbat.sheet_rows(archive,sheets[sheet],strings):
                if row_number == 3: numbat.check_headers(row,15)
                if row_number <= 3 or row.get(2) not in by_asc or row.get(5) != 'CEN': continue
                if row[0] in seen: raise ValueError('Duplicate platform row')
                seen.add(row[0]); asc = row[2]
                if (row[1],row[3]) != (by_asc[asc]['nlc'],by_asc[asc]['name']): raise ValueError('Boarding identity mismatch')
                values = numbat.profile(row,15,8)
                prior = boarding[asc].setdefault(metric,[0.0]*96)
                boarding[asc][metric] = [a+b for a,b in zip(prior,values)]
                ledger.append({'sheet':sheet,'row':row_number,'id':row[0], 'asc':asc,'direction':row[6],'total':row[8]})
    if len(links) != len(pairs) or {(v['from'],v['to']) for v in links} != pairs: raise ValueError('Missing or duplicate directional link')
    for station in stations:
        for metric in ['boarders','alighters']:
            if metric not in boarding[station['asc']]: raise ValueError('Missing platform coverage')
        station.update({metric:[round(v,3) for v in values] for metric,values in boarding[station['asc']].items()})
    data = {'version':1,'source':catalogue['source'],'start':18000,'step':900,'stations':stations,'links':links}
    audit = {'source':catalogue['source'],'inputs':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [network_path,diagram_path]},
             'rows':ledger,'scope':'Central line St Paul’s–Leyton, both directions; selected links, not full OD journeys',
             'meaning':'Modelled aggregate link demand per 15 minutes. Never sum consecutive link loads as unique people or assign counts to individual trains.'}
    return data,audit

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('workbook'); parser.add_argument('--output',default='fixtures/morning-flow')
    args=parser.parse_args(); data,audit=compile_flow(args.workbook); output=Path(args.output); output.mkdir(parents=True,exist_ok=True)
    for name,value in [('study',data),('audit',audit)]: (output/f'{name}.json').write_text(json.dumps(value,separators=(',',':'))+'\n')
    print(f"{len(data['stations'])} stations; {len(data['links'])} directional links; {len(audit['rows'])} audited source rows")
