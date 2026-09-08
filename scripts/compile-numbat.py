"""Compile the audited NUMBAT 2025 Friday pilot. Python standard library only."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
SOURCE_URL = 'https://crowding.data.tfl.gov.uk/NUMBAT/NUMBAT%202025/NBT25FRI_Outputs.xlsx'
SOURCE_SHA256 = '22eeb8fe2fd5ee2c974aaff81c7f3e114c53e39f46cd03c273c072974f5d9b5c'
STATIONS = {'bank': (513, 'BNKu', 'Bank and Monument'), 'stratford': (719, 'SFDu', 'Stratford')}


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
        stations, audit = {}, {}
        for key, (nlc, asc, name) in STATIONS.items():
            stations[key] = {'name': name, 'nlc': nlc, 'asc': asc}
            audit[key] = {}
        for sheet, metric in [('Station_Entries', 'entries'), ('Station_Exits', 'exits')]:
            for row_number, row in sheet_rows(archive, sheets[sheet], strings):
                if row_number == 3:
                    check_headers(row, 11)
                for key, (nlc, asc, name) in STATIONS.items():
                    if row.get(0) != nlc:
                        continue
                    if (row.get(1), row.get(2)) != (asc, name) or metric in stations[key]:
                        raise ValueError(f'Ambiguous station identity in {sheet}: {nlc}')
                    stations[key][metric] = profile(row, 11, 4)
                    audit[key][metric] = {'sheet': sheet, 'row': row_number, 'total': row[4]}
        links = {key: [] for key in STATIONS}
        for row_number, row in sheet_rows(archive, sheets['Station_Flows'], strings):
            if row_number == 3:
                check_headers(row, 18)
            for key, (nlc, asc, name) in STATIONS.items():
                # Complex NLC alone includes nearby stations at Bank. Restrict both endpoints.
                if (row.get(2), row.get(3), row.get(6), row.get(7), row.get(10)) != (nlc, asc, nlc, asc, 'Alight-Interchange-Board'):
                    continue
                if row.get(0) in {link['id'] for link in links[key]}:
                    raise ValueError('Duplicate interchange link')
                values = profile(row, 18, 11)
                stations[key].setdefault('interchanges', [0.0] * 96)
                stations[key]['interchanges'] = [a + b for a, b in zip(stations[key]['interchanges'], values)]
                links[key].append({'row': row_number, 'id': row[0], 'from': row[5], 'to': row[9], 'total': row[11]})
        for key, station in stations.items():
            for metric in ['entries', 'exits', 'interchanges']:
                if metric not in station:
                    raise ValueError(f'Missing {metric} for {key}')
            audit[key]['interchanges'] = {'sheet': 'Station_Flows', 'total': sum(station['interchanges']), 'links': links[key]}
            station['totals'] = {metric: round(sum(station[metric]), 3) for metric in ['entries', 'exits', 'interchanges']}
            for metric in ['entries', 'exits', 'interchanges']:
                station[metric] = [round(v, 3) for v in station[metric]]
    source = {'url': SOURCE_URL, 'sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(), 'year': 2025, 'dayType': 'Friday', 'season': 'autumn', 'published': '2026-08-10', 'retrieved': '2026-09-08'}
    return {'version': 1, 'source': source, 'start': 18000, 'step': 900, 'stations': stations}, audit


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--output', type=Path, default=Path('fixtures/passenger-demand'))
    args = parser.parse_args()
    data, audit = compile_workbook(args.workbook)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'numbat-2025-friday.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')
    (args.output / 'audit.json').write_text(json.dumps({'source': data['source'], 'stations': audit}, indent=2) + '\n')
    print(json.dumps({key: value['totals'] for key, value in data['stations'].items()}, indent=2))
