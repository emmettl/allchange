"""Compile the audited NUMBAT 2025 Friday station profiles. Python standard library only."""
import argparse
import hashlib
import json
import math
import re
from collections import defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
SOURCE_URL = 'https://crowding.data.tfl.gov.uk/NUMBAT/NUMBAT%202025/NBT25FRI_Outputs.xlsx'
SOURCE_SHA256 = '22eeb8fe2fd5ee2c974aaff81c7f3e114c53e39f46cd03c273c072974f5d9b5c'


def sheet_rows(archive, path, strings):
    for _, row in ET.iterparse(archive.open(path), events=['end']):
        if row.tag != f"{{{NS['s']}}}row":
            continue
        cells = {}
        for cell in row:
            letters = ''.join(c for c in cell.attrib['r'] if c.isalpha())
            column = 0
            for letter in letters:
                column = column * 26 + ord(letter) - 64
            value = cell.find('s:v', NS)
            if value is None:
                continue
            if cell.attrib.get('t') == 's':
                value = strings[int(value.text)]
            elif cell.attrib.get('t') == 'e':
                value = value.text
            else:
                value = float(value.text)
            cells[column - 1] = value
        yield int(row.attrib['r']), cells
        row.clear()


def profile(row, start, total):
    values = [row.get(i) for i in range(start, start + 96)]
    if any(not isinstance(v, (float, int)) or not math.isfinite(v) or v < 0 for v in values):
        raise ValueError('Missing, invalid or negative interval: never substitute zero')
    if not math.isclose(sum(values), row[total], abs_tol=0.001):
        raise ValueError('Quarter-hour profile does not reconcile with source Total')
    return values


def check_headers(row, start):
    for i in range(96):
        a, b = (300 + i * 15) % 1440, (315 + i * 15) % 1440
        expected = f'{a // 60:02}{a % 60:02}-{b // 60:02}{b % 60:02}'
        if row.get(start + i) != expected:
            raise ValueError(f'Unexpected traffic-day interval at column {start + i + 1}')


def compile_workbook(path):
    if hashlib.sha256(Path(path).read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError('Source differs from the audited 2025 Friday release; re-audit before updating')
    with ZipFile(path) as archive:
        strings = [''.join(s.itertext()) for s in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        # Resolve sheet titles rather than relying on worksheet order.
        rels = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        targets = {r.attrib['Id']: r.attrib['Target'] for r in rels}
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        sheets = {s.attrib['name']: 'xl/' + targets[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']] for s in workbook.find('s:sheets', NS)}
        stations, audit, excluded = {}, {}, []
        for sheet, metric in [('Station_Entries', 'entries'), ('Station_Exits', 'exits')]:
            for row_number, row in sheet_rows(archive, sheets[sheet], strings):
                if row_number == 3:
                    check_headers(row, 11)
                if row_number <= 3 or not isinstance(row.get(0), (float, int)):
                    continue
                nlc, asc, name = int(row[0]), row[1], row[2]
                # The 2025 cover lists LU/LO/DLR/EL. Tram rows are zero-filled placeholders.
                if asc.endswith('t'):
                    if metric == 'entries':
                        excluded.append({'nlc': nlc, 'asc': asc, 'name': name, 'reason': 'Tram rows outside stated 2025 coverage'})
                    continue
                station = stations.setdefault(asc, {'name': name, 'nlc': nlc, 'asc': asc})
                if (station['nlc'], station['name']) != (nlc, name) or metric in station:
                    raise ValueError(f'Ambiguous station identity: {asc}')
                station[metric] = profile(row, 11, 4)
                audit.setdefault(asc, {})[metric] = {'sheet': sheet, 'row': row_number, 'total': row[4]}
        links = defaultdict(list)
        cross_area = defaultdict(int)
        seen_links = {}
        ambiguous_areas = set()
        for row_number, row in sheet_rows(archive, sheets['Station_Flows'], strings):
            if row_number == 3:
                check_headers(row, 18)
            if row_number <= 3:
                continue
            link_id = row.get(0)
            if link_id is None:
                continue
            asc = row.get(3)
            if row.get(10) != 'Alight-Interchange-Board':
                continue
            if (row.get(2), asc) != (row.get(6), row.get(7)):
                for endpoint in {asc, row.get(7)}:
                    cross_area[endpoint] += 1
                continue
            if asc not in stations:
                continue
            station = stations[asc]
            if link_id in seen_links:
                ambiguous_areas.update([asc, seen_links[link_id]])
            seen_links[link_id] = asc
            if (row.get(2), row.get(4), row.get(8)) != (station['nlc'], station['name'], station['name']):
                raise ValueError(f'Flow endpoint identity mismatch: {asc}')
            values = profile(row, 18, 11)
            station.setdefault('interchanges', [0.0] * 96)
            station['interchanges'] = [a + b for a, b in zip(station['interchanges'], values)]
            links[asc].append({'row': row_number, 'id': link_id, 'from': row[5], 'to': row[9], 'total': row[11]})
        for asc, station in stations.items():
            if asc in ambiguous_areas:
                station.pop('interchanges', None)
                audit[asc]['excludedInterchangeRows'] = links[asc]
                links[asc] = []
            if 'interchanges' not in station:
                station['unavailable'] = {'interchanges': 'Ambiguous duplicate interchange links in source' if asc in ambiguous_areas else 'No within-area interchange rows in source'}
            metrics = [metric for metric in ['entries', 'exits', 'interchanges'] if metric in station]
            if links[asc]:
                audit[asc]['interchanges'] = {'sheet': 'Station_Flows', 'total': sum(station['interchanges']), 'links': links[asc]}
            station['crossAreaLinksExcluded'] = cross_area[asc]
            station['totals'] = {metric: round(sum(station[metric]), 3) for metric in metrics}
            for metric in metrics:
                station[metric] = [round(v, 3) for v in station[metric]]
    source = {'url': SOURCE_URL, 'sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(), 'year': 2025, 'dayType': 'Friday', 'season': 'autumn', 'published': '2026-08-10', 'retrieved': '2026-09-08'}
    return {'version': 2, 'source': source, 'start': 18000, 'step': 900, 'stations': stations}, {'stations': audit, 'excluded': excluded}


def normalize_name(name):
    return re.sub(r'[^a-z0-9]', '', name.lower().replace('&', 'and'))


# Explicit aliases for branch-qualified and historical/local timetable spellings.
ALIASES = {
    'Bank': ['BNKu'], 'Monument': ['BNKu'],
    'Stratford (London)': ['SFDu'],
    'Custom House (for ExCel)': ['CUHd', 'CUSr'],
    'Cutty Sark (for Maritime Greenwich)': ['CUSd'],
    'Edgware Road (Bakerloo)': ['ERBu'], 'Edgware Road (Circle Line)': ['ERDu'],
    'Hammersmith (Dist&Picc Line)': ['HMDu'], 'Hammersmith (H&C Line)': ['HMSu'],
    'Paddington (H&C Line)-Underground': ['PADu'],
    "Shepherd's Bush (Central)": ['SBCu'],
    'Heathrow Terminals 2 & 3': ['HRCu', 'HXXr'],
    'Burnham (Berks)': ['BNMr'], 'Langley (Berks)': ['LNYr'],
    'Cambridge Heath (London)': ['CBHr'], 'Queens Park (London)': ['QPKu'],
    'Richmond (London)': ['RMDu'], 'St James Street (London)': ['SJSr'],
    'London Blackfriars': ['BLFu'], 'London Cannon Street': ['CSTu'],
    'London Euston': ['EUSu', 'EUSr'], 'London Liverpool Street': ['LSTu', 'LSTr'],
    'London Marylebone': ['MYBu'], 'London Paddington': ['PADu', 'PADr'],
    'London Victoria': ['VICu'], 'London Waterloo': ['WLOu'],
    "London King's Cross": ['KXXu'], 'London St. Pancras International': ['KXXu'],
    'St Pancras International': ['KXXu'],
}


def build_catalogue(data, app_names):
    candidates = defaultdict(list)
    for asc, station in data['stations'].items():
        # Offer separate source areas, never merge mode-suffixed rows.
        name = re.sub(r' (LU|LO|NR|DLR|EL|TfL)$', '', station['name'])
        candidates[normalize_name(name)].append(asc)
        candidates[normalize_name(station['name'])].append(asc)
    matches, unmatched = {}, []
    for name in sorted(app_names):
        areas = ALIASES.get(name, candidates.get(normalize_name(name), []))
        if not areas:
            unmatched.append(name)
            continue
        if any(asc not in data['stations'] for asc in areas):
            raise ValueError(f'Alias points outside coverage: {name}')
        areas = sorted(set(areas), key=lambda asc: (0 if asc.endswith('u') else 1, asc))
        key = normalize_name(name)
        if key in matches and matches[key] != areas:
            raise ValueError(f'Conflicting normalized station names: {name}')
        matches[key] = areas
    used = sorted({asc for areas in matches.values() for asc in areas})
    return {'version': 2, 'source': data['source'], 'matches': matches,
            'areas': {asc: {k: data['stations'][asc][k] for k in ['name', 'nlc', 'asc']} for asc in used}}, unmatched


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--output', type=Path, default=Path('fixtures/passenger-demand'))
    args = parser.parse_args()
    data, audit = compile_workbook(args.workbook)
    opening_path = Path('fixtures/tfl/all-change-rail-led-morning.json')
    rail_path = Path('fixtures/national-rail/catalogue.json')
    names = {stop[2] for stop in json.loads(opening_path.read_text())['stops']}
    names.update(station['name'] for station in json.loads(rail_path.read_text())['stations'])
    names.update(ALIASES)
    catalogue, unmatched = build_catalogue(data, names)
    args.output.mkdir(parents=True, exist_ok=True)
    station_dir = args.output / 'stations'
    station_dir.mkdir(exist_ok=True)
    for asc in catalogue['areas']:
        output = {key: data[key] for key in ['version', 'source', 'start', 'step']}
        output['station'] = data['stations'][asc]
        (station_dir / f'{asc}.json').write_text(json.dumps(output, separators=(',', ':')) + '\n')
    (args.output / 'catalogue.json').write_text(json.dumps(catalogue, separators=(',', ':')) + '\n')
    audit.update({'source': data['source'], 'unmatchedAppNames': unmatched,
                  'inputSha256': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in [opening_path, rail_path]},
                  'matchedNames': {name: catalogue['matches'][normalize_name(name)] for name in sorted(names) if normalize_name(name) in catalogue['matches']}})
    (args.output / 'audit.json').write_text(json.dumps(audit, indent=2) + '\n')
    print(f"{len(catalogue['areas'])} source areas; {len(audit['matchedNames'])} app names; {len(unmatched)} unmatched; {len(audit['excluded'])} excluded tram placeholders")
