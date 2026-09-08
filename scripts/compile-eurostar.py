"""Offline, pinned Eurostar GTFS board and conservatively reconciled London HS1 movement."""
import collections
import csv
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import re
import runpy
import sys
import zipfile
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'fixtures/eurostar/source'
DATE = dt.date(2026, 9, 4)
GTFS_URL = 'https://transport-data-gouv-fr-resource-history-prod.cellar-c2.services.clever-cloud.com/82199/82199.20260904.001849.494114.zip'
HASHES = {
    '2026-09-04.gtfs.zip': 'de0fd1d76c93793da61785a764d6a306635d5f7b75e3149cbbc590c5d140e827',
    'WA07.xlsx': 'c80e81432e1657aa88902d88cef99cd1587db5cf79075e8460cfd1e9b8d0ac35',
    'hs1-geometry.json': '986fb56d1169cc26b1844f3038f546a8268473147b6121ae5bed60d0c0494267',
}


def london_seconds(value, timezone, date=DATE):
    """GTFS time is measured from agency-local noon minus 12h, including times >24h."""
    if not re.fullmatch(r'\d{2,}:\d{2}:\d{2}', value):
        raise ValueError(f'Invalid GTFS time: {value}')
    h, m, s = map(int, value.split(':'))
    if m >= 60 or s >= 60:
        raise ValueError(f'Invalid GTFS time: {value}')
    epoch = dt.datetime.combine(date, dt.time(12), ZoneInfo(timezone)).timestamp() - 43200
    london = dt.datetime.fromtimestamp(epoch + h * 3600 + m * 60 + s, ZoneInfo('Europe/London'))
    return (london.date() - date).days * 86400 + london.hour * 3600 + london.minute * 60 + london.second


def compile_study():
    for name, expected in HASHES.items():
        if hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() != expected:
            raise ValueError(f'Source changed; re-audit required: {name}')
    with zipfile.ZipFile(SOURCE / '2026-09-04.gtfs.zip') as archive:
        def table(name):
            return list(csv.DictReader(io.TextIOWrapper(archive.open(name + '.txt'), encoding='utf-8-sig')))
        agencies = {row['agency_id']: row for row in table('agency')}
        routes = {row['route_id']: row for row in table('routes')}
        stops = {row['stop_id']: row for row in table('stops')}
        active = {row['service_id'] for row in table('calendar_dates') if row['date'] == DATE.strftime('%Y%m%d') and row['exception_type'] == '1'}
        active -= {row['service_id'] for row in table('calendar_dates') if row['date'] == DATE.strftime('%Y%m%d') and row['exception_type'] == '2'}
        trips = [row for row in table('trips') if row['service_id'] in active and routes[row['route_id']]['agency_id'] == 'EUROSTAR_CHANNEL']
        calls = collections.defaultdict(list)
        for row in table('stop_times'):
            calls[row['trip_id']].append(row)
    metadata = {
        'publisher': 'Eurostar International Ltd / Network Rail', 'feedVersion': 'eurostar-2026-09-04-v1',
        'serviceDate': DATE.isoformat(), 'windowStart': 0, 'windowEnd': 86400, 'focusTime': 27900,
        'sourceUrl': GTFS_URL, 'modes': ['national-rail'],
        'model': 'Published Eurostar timetable; London movement interpolated only for exact working-timetable matches, not live',
        'sources': [
            {'publisher': 'Eurostar International Ltd', 'url': GTFS_URL, 'licence': 'Licence Ouverte / Open Licence 2.0', 'file': '2026-09-04.gtfs.zip', 'sha256': HASHES['2026-09-04.gtfs.zip'], 'archivedAt': '2026-09-04T00:18:49.494114Z', 'agencyTimezone': 'Europe/Brussels', 'displayTimezone': 'Europe/London'},
            {'publisher': 'Network Rail', 'url': 'https://www.networkrail.co.uk/wp-content/uploads/2025/02/01.-June-2026-December-2026-Working-timetable-documents.zip', 'member': '01. June 2026 - December 2026 Working timetable documents/WA/WA07/WA07 - ST PANCRAS TO EUROTUNNEL BOUNDARY.xlsx', 'file': 'WA07.xlsx', 'sha256': HASHES['WA07.xlsx']},
        ],
    }
    board_stops, stop_indexes, board_trains = [], {}, []
    for trip in sorted(trips, key=lambda row: row['trip_id']):
        rows = sorted(calls[trip['trip_id']], key=lambda row: int(row['stop_sequence']))
        if len(rows) < 2 or len({row['stop_sequence'] for row in rows}) != len(rows):
            raise ValueError('Invalid trip calls')
        if sum(stops[row['stop_id']]['stop_code'] == '7015400' for row in rows) != 1:
            raise ValueError('Expected exactly one London call')
        timezone = agencies[routes[trip['route_id']]['agency_id']]['agency_timezone']
        train_stops = []
        for row in rows:
            stop = stops[row['stop_id']]
            parent = stops.get(stop['parent_station'], stop)
            identity = 'eurostar:' + parent['stop_code']
            if identity not in stop_indexes:
                stop_indexes[identity] = len(board_stops)
                board_stops.append([float(parent['stop_lon']), float(parent['stop_lat']), 'St Pancras Eurostar' if parent['stop_code'] == '7015400' else parent['stop_name'], '', identity])
            train_stops.append([stop_indexes[identity], london_seconds(row['arrival_time'], timezone), london_seconds(row['departure_time'], timezone)])
        for i, (_, arrival, departure) in enumerate(train_stops):
            if departure < arrival or (i and arrival < train_stops[i - 1][2]):
                raise ValueError('Non-monotonic GTFS trip')
        outbound = stops[rows[0]['stop_id']]['stop_code'] == '7015400'
        if not outbound and stops[rows[-1]['stop_id']]['stop_code'] != '7015400':
            raise ValueError('London must be a terminal')
        board_trains.append({
            'id': f"eurostar:{trip['trip_id']}:{DATE.isoformat()}", 'route': 'Eurostar', 'shortName': trip['trip_short_name'],
            'mode': 'national-rail', 'category': 'intercity', 'direction': 'outbound' if outbound else 'inbound',
            'origin': board_stops[train_stops[0][0]][2], 'headsign': board_stops[train_stops[-1][0]][2],
            'stops': train_stops, 'start': train_stops[0][1], 'end': train_stops[-1][2],
            'pickupOnlyIndexes': [i for i, row in enumerate(rows) if row['drop_off_type'] != '0'],
            'setDownOnlyIndexes': [i for i, row in enumerate(rows) if row['pickup_type'] != '0'],
            'source': {'table': 'Eurostar GTFS', 'column': 0, 'tripId': trip['trip_id'], 'serviceId': trip['service_id'], 'routeId': trip['route_id'], 'stopIds': [row['stop_id'] for row in rows]},
        })
    # Source headcodes provide an additional conservative identity check, not a new public ID.
    wtt = runpy.run_path(str(ROOT / 'scripts/london-rail-network.py'))
    sheets = runpy.run_path(str(ROOT / 'scripts/read-rail-wtt.py'))['read_wtt'](SOURCE / 'WA07.xlsx')
    candidates = []
    places = {'ST PANCRAS INTERNATIONAL': 0, 'EBBSFLEET W JN': 1}
    for sheet, grid in sheets.items():
        for col in range(2, len(grid[0])):
            cell = lambda row: grid[row][col] if col < len(grid[row]) else ''
            headcode = cell(0)
            if cell(2) != 'ES' or not re.fullmatch(r'9[OI]\d{2}', headcode) or not wtt['runs_on'](cell(7), cell(6), DATE):
                continue
            local, name = {}, ''
            for row, values in enumerate(grid[9:], 9):
                if values and values[0]:
                    name = values[0]
                kind = values[1] if len(values) > 1 else ''
                if name in places and kind in ['arr', 'dep', 'pass'] and cell(row) not in ['', '..']:
                    seconds, _ = wtt['timing'](cell(row))
                    local[places[name]] = seconds
            if set(local) != {0, 1}:
                raise ValueError(f'Incomplete HS1 timing: {headcode}')
            direction = 'outbound' if sheet.endswith('Forward') else 'inbound'
            endpoint = cell(4 if direction == 'outbound' else 3).split('\n')[0]
            candidates.append({'headcode': headcode, 'uid': cell(1), 'sheet': sheet, 'column': col + 1, 'days': cell(7), 'dates': cell(6), 'direction': direction, 'endpoint': endpoint, 'times': local})
    geometry = json.loads((SOURCE / 'hs1-geometry.json').read_text())
    movement_stops = [geometry['stops'][0], geometry['stops'][2]]
    movement_stops[0][2], movement_stops[0][4] = 'St Pancras Eurostar', 'eurostar:7015400'
    # International trains pass Stratford / Ebbsfleet. Keep their points out of domestic boards.
    for stop in movement_stops[1:]:
        stop[4] = 'eurostar-timing:' + stop[4]
    path = geometry['paths'][0] + geometry['paths'][1][1:]
    paths = [path, list(reversed(path))]
    movements, audit, used = [], [], set()
    endpoints = {'Paris-Nord': 'PARIS NORD', 'Bruxelles-Midi': 'BRUXELLES MIDI', 'Amsterdam-Centraal': 'AMSTERDAM C.S.'}
    for train in board_trains:
        outbound = train['direction'] == 'outbound'
        terminal_time = train['stops'][0 if outbound else -1][2 if outbound else 1]
        endpoint = train['headsign'] if outbound else train['origin']
        number = train['shortName']
        headcode = ('9O' if number.startswith('90') else '9I' if number.startswith('91') else '?') + number[-2:]
        possible = [c for c in candidates if c['headcode'] == headcode and c['direction'] == train['direction'] and c['endpoint'] == endpoints.get(endpoint)]
        matches = [c for c in possible if c['times'][0] == terminal_time]
        record = {'id': train['id'], 'publicNumber': number, 'direction': train['direction'], 'endpoint': endpoint, 'londonTime': terminal_time, 'candidates': possible}
        if len(matches) != 1:
            record['status'] = 'board-only'
            record['reason'] = 'London time differs' if possible else 'No matching dated passenger WTT column'
        else:
            match = matches[0]
            key = (match['sheet'], match['column'])
            if key in used:
                raise ValueError('WTT movement assigned twice')
            used.add(key)
            order = [0, 1] if outbound else [1, 0]
            calls = [[index, match['times'][index], match['times'][index]] for index in order]
            if any(a[2] >= b[1] for a, b in zip(calls, calls[1:])):
                raise ValueError('Non-monotonic WTT movement')
            movements.append({**train, 'stops': calls, 'start': calls[0][1], 'end': calls[-1][2],
                              'pathSegments': [0] if outbound else [1],
                              'passIndexes': [1] if outbound else [0],
                              'pickupOnlyIndexes': [0] if outbound else [], 'setDownOnlyIndexes': [] if outbound else [1],
                              'source': {**train['source'], 'wtt': match}})
            record['status'] = 'movement'
        audit.append(record)
    coverage = {'boardJourneys': len(board_trains), 'includedJourneys': len(movements), 'boardOnlyJourneys': len(board_trains) - len(movements), 'departures': sum(t['direction'] == 'outbound' for t in board_trains), 'arrivals': sum(t['direction'] == 'inbound' for t in board_trains)}
    metadata['coverage'] = coverage
    metadata['geometry'] = geometry['attribution']
    metadata['note'] = 'All dated Eurostar London calls. HS1 movement only where public number, direction, overseas terminal and exact London time reconcile uniquely with WA07. Other services remain board-only. Geometry follows the shared HS1 corridor, not a resolved platform track. No overseas movement, live status, platform or boarding deadline is inferred.'
    board = {'metadata': metadata, 'bounds': geometry['bounds'], 'stops': board_stops, 'paths': [], 'edges': [], 'trains': board_trains}
    network = {'metadata': metadata, 'bounds': geometry['bounds'], 'stops': movement_stops, 'paths': paths, 'edges': [], 'trains': sorted(movements, key=lambda t: (t['start'], t['id'])), 'corridorPaths': geometry['paths'], 'fadeKilometres': 4, 'board': board}
    if not movements:
        raise ValueError('No supported movements')
    return network, {'serviceDate': DATE.isoformat(), 'sources': HASHES, 'coverage': coverage, 'services': audit}


if __name__ == '__main__':
    network, audit = compile_study()
    for name, value in [('network.json', network), ('audit.json', audit)]:
        output = ROOT / 'fixtures/eurostar' / name
        rendered = json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n'
        if '--check' in sys.argv:
            if output.read_text() != rendered:
                raise ValueError(f'Compiled artifact differs: {name}')
        else:
            output.write_text(rendered)
    print(json.dumps(audit['coverage']))
