"""Normalize and join London's published passenger WTT columns before geometry assembly."""
import collections
import datetime as dt
import hashlib
import heapq
import json
import math
import os
from pathlib import Path
import re
import sys
from rail_public_calls import supplement, TARGETS

CACHE = Path(os.environ.get('RAIL_CACHE', '/tmp/allchange-rail-complete'))
OPERATORS = {
    'GW': ('paddington', 'GWR'), 'HX': ('paddington', 'Heathrow Express'),
    'SW': ('waterloo', 'South Western Railway'),
    'GN': ('kings-cross', 'Great Northern'), 'GR': ('kings-cross', 'LNER'),
    'LD': ('kings-cross', 'Lumo'), 'GC': ('kings-cross', 'Grand Central'), 'HT': ('kings-cross', 'Hull Trains'),
    'TL': ('thameslink', 'Thameslink'), 'SN': ('southern', 'Southern'), 'GX': ('southern', 'Gatwick Express'),
    'SE': ('southeastern', 'Southeastern'), 'LE': ('liverpool-street', 'Greater Anglia'),
    'VT': ('euston', 'Avanti West Coast'), 'LM': ('euston', 'London Northwestern Railway'), 'CS': ('euston', 'Caledonian Sleeper'),
    'CH': ('marylebone', 'Chiltern Railways'), 'CC': ('fenchurch-street', 'c2c'),
    'EM': ('st-pancras', 'East Midlands Railway'),
}
ALIASES = {
    'ASHFORD (MIDDLESEX)': 'AFS', 'GREENHITHE FOR BLUEWATER': 'GNH', 'HAYES (KENT)': 'HYS',
    'QUEENS RD PECKHAM': 'QRP', 'QUEENSTOWN RD.(BATTERSEA)': 'QRB', 'SUTTON (SURREY)': 'SUO',
    'WEST HAM HIGH LEVEL': 'WEH', 'SEER GREEN': 'SRG', 'HEATHROW TERMINALS 2 & 3': 'HXX',
    'WIMBLEDON L.U.L.': 'WIM',
    'LOUGHBOROUGH JN': 'LGJ',
    'LONDON VICTORIA (E)': 'VIC',
    'EBBSFLEET W JN': 'EBSFWJN',
}
SYMBOLS = {'', '/', 'T', 'TF', 'TB', 'U', 'D', 'A', 'T X', 'OP', 'S', 'T -D', 'T -U', 'T -DK', 'TBX', 'T -UK', 'T RM', 'T K -D', 'TBK', 'T K -U', 'TBN', 'U -D', 'D -U', 'TBS', 'TFN', 'TFS', 'T A', 'OPC', 'TBK KE', 'C A', 'C', 'X OP', 'OPX', 'RMN', 'RMD', 'RMU', 'D RM'}
SERVICE_DATE = dt.date(2026, 9, 4)


def norm(name):
    return re.sub('[^A-Z0-9]', '', name.upper().replace('LONDON ', '').replace(' RAILWAY STATION', '').replace(' & ', ' AND '))


def runs_on(code, date_range, date):
    start, end = [dt.datetime.strptime(value, '%d/%m/%Y').date() for value in date_range.split(' to ')]
    if not start <= date <= end:
        return False
    match = re.fullmatch(r'((?:Th|Sun|[MTWFS])+)([OX])', code)
    if not match:
        raise ValueError(f'Unreviewed running days: {code}')
    days = re.findall('Th|Sun|[MTWFS]', match[1])
    current = ['M', 'T', 'W', 'Th', 'F', 'S', 'Sun'][date.weekday()]
    return (current in days) == (match[2] == 'O')


def timing(value):
    match = re.fullmatch(r'(\d{2})([A-Z/ -]*)(\d{2})(½?)', value)
    if not match or match[2] not in SYMBOLS or int(match[1]) > 23 or int(match[3]) > 59:
        raise ValueError(f'Unreviewed WTT time: {value}')
    return int(match[1]) * 3600 + int(match[3]) * 60 + (30 if match[4] else 0), match[2]


def terminal(value):
    name, time = value.rsplit('\n', 1)
    return name, timing(time.replace(':', ''))[0]


def station_lookup(osm):
    by_code = {}
    names = collections.defaultdict(list)
    for node in osm['elements']:
        tags = node.get('tags', {})
        if node['type'] != 'node' or ('ref:crs' not in tags and tags.get('ref:tiploc') != 'EBSFWJN'):
            continue
        code = tags.get('ref:crs', tags.get('ref:tiploc'))
        by_code[code] = node
        for key in ['name', 'alt_name', 'official_name', 'name:en']:
            for name in tags.get(key, '').split(';'):
                if name:
                    names[norm(name)].append(code)
    # Prefer the National Rail station when a Tube node shares its name.
    lookup = {name: sorted(codes, key=lambda code: ('National Rail' not in by_code[code]['tags'].get('network', ''), code))[0] for name, codes in names.items()}
    return by_code, lookup


def read_columns(osm, cache=CACHE):
    stations, names = station_lookup(osm)
    joined = {}
    counts = collections.Counter()
    unmapped = collections.Counter()
    sources = []
    for path in sorted((cache / 'wtt').glob('*.json')):
        table = path.stem
        sources.append({'table': table, 'sha256': hashlib.sha256(path.with_suffix('.xlsx').read_bytes()).hexdigest()})
        for sheet, rows in json.loads(path.read_text()).items():
            if not sheet.startswith(('Mondays to Fridays', 'Saturdays')):
                raise ValueError(f'Unexpected sheet {sheet}')
            labelled = []
            location = ''
            block = 0
            for index, row in enumerate(rows[9:], 10):
                if row[0]:
                    location = row[0]
                    block += 1
                if row[1] in ['arr', 'dep', 'pass']:
                    labelled.append((index, block, location, row[1], row))
            for column in range(2, len(rows[0])):
                tid, uid, operator = (rows[i][column] for i in [0, 1, 2])
                if operator not in OPERATORS or not re.fullmatch('[129][A-Z][0-9]{2}', tid):
                    continue
                origin, origin_time = terminal(rows[3][column])
                destination, destination_time = terminal(rows[4][column])
                days, date_range = rows[7][column], rows[6][column]
                active_days = [offset for offset in [-1, 0, 1] if (SERVICE_DATE + dt.timedelta(days=offset)).weekday() == 5 and sheet.startswith('Saturdays') and runs_on(days, date_range, SERVICE_DATE + dt.timedelta(days=offset)) or (SERVICE_DATE + dt.timedelta(days=offset)).weekday() < 5 and sheet.startswith('Mondays to Fridays') and runs_on(days, date_range, SERVICE_DATE + dt.timedelta(days=offset))]
                if not active_days:
                    continue
                points = []
                previous = -1
                day = 0
                first_time = None
                for row_number, block, name, kind, row in labelled:
                    value = row[column] if column < len(row) else ''
                    if value in ['', '..', None]:
                        continue
                    time, symbols = timing(value)
                    time += day * 86400
                    if time < previous - 43200:
                        day += 1
                        time += 86400
                    if time < previous:
                        raise ValueError(f'Non-monotonic WTT {table}:{sheet}:{column + 1}:{row_number}')
                    previous = time
                    if first_time is None:
                        first_time = time
                    code = ALIASES.get(name, names.get(norm(name)))
                    if name == 'ST PANCRAS INTERNATIONAL':
                        code = 'SPL' if operator == 'TL' else 'STP'
                    if code and stations[code]['tags'].get('network') == 'London Underground' and code != 'ZPU':
                        # A WTT location named Ladbroke Grove is a mainline timing point,
                        # not the nearby Tube station of the same name.
                        code = None
                    if not code:
                        if 'T' in symbols or symbols.startswith(('U', 'D')):
                            unmapped[name] += 1
                        continue
                    if not points or points[-1]['block'] != block:
                        points.append({'code': code, 'block': block, 'rows': [], 'passenger': False, 'pickupOnly': False, 'setDownOnly': False})
                    point = points[-1]
                    point[kind] = time
                    point['rows'].append(row_number)
                    activity = symbols.split(' ')[0]
                    passenger = ('T' in activity or activity in ['U', 'D']) and 'N' not in activity and 'S' not in activity
                    point['passenger'] |= passenger
                    point['pickupOnly'] |= activity == 'U'
                    point['setDownOnly'] |= activity == 'D'
                if not points:
                    continue
                # Dates describe the local table bank. Origin time recovers the originating date for cross-table joins.
                origin_day = -1 if origin_time > first_time + 3600 else 0
                for offset in active_days:
                    origin_date = SERVICE_DATE + dt.timedelta(days=offset + origin_day)
                    key = f'{uid}:{origin_date}'
                    source = {'table': table, 'sheet': sheet, 'column': column + 1, 'days': days, 'dates': date_range}
                    entry = joined.setdefault(key, {'uid': uid, 'tid': tid, 'operator': operator, 'origin': origin, 'destination': destination, 'originDate': str(origin_date), 'points': [], 'sources': []})
                    if (entry['origin'], entry['destination'], entry['operator']) != (origin, destination, operator):
                        raise ValueError(f'Conflicting active UID {key}: {entry["origin"]}/{entry["destination"]} vs {origin}/{destination}')
                    entry['sources'].append(source)
                    for point in points:
                        arrival = point.get('arr', point.get('dep', point.get('pass')))
                        departure = point.get('dep', point.get('arr', point.get('pass')))
                        station = stations[point['code']]
                        public = []
                        for terminal_name, terminal_time in [(origin, origin_time), (destination, destination_time)]:
                            if norm(station['tags']['name']) == norm(terminal_name):
                                public.append(terminal_time + round((arrival - terminal_time) / 86400) * 86400)
                        if public:
                            closest = min(public, key=lambda time: abs(time - arrival))
                            if abs(closest - arrival) <= 300:
                                arrival = departure = closest
                        entry['points'].append({**point, 'arrival': arrival + offset * 86400, 'departure': departure + offset * 86400, 'source': len(entry['sources']) - 1})
                    # Some WTT banks omit their origin/terminus row entirely (Victoria East,
                    # Hayes and Meridian Water). Their header still supplies its public time.
                    for header_row, terminal_name, terminal_time in [(4, origin, origin_time), (5, destination, destination_time)]:
                        code = ALIASES.get(terminal_name, names.get(norm(terminal_name)))
                        if terminal_name == 'ST PANCRAS INTERNATIONAL':
                            code = 'SPL' if operator == 'TL' else 'STP'
                        if not code:
                            continue
                        reference = first_time if header_row == 4 else previous
                        time = terminal_time + round((reference - terminal_time) / 86400) * 86400 + offset * 86400
                        if not any(point['code'] == code and abs(point['arrival'] - time) <= 300 for point in entry['points']):
                            entry['points'].append({'code': code, 'arrival': time, 'departure': time, 'passenger': True, 'pickupOnly': False, 'setDownOnly': False, 'block': -header_row, 'rows': [header_row], 'source': len(entry['sources']) - 1})
                    counts[operator] += 1
    conflicts = []
    journeys = []
    for key, entry in joined.items():
        points = []
        for point in sorted(entry['points'], key=lambda point: (point['arrival'], point['departure'])):
            matches = [other for other in points[-8:] if other['code'] == point['code'] and abs(other['arrival'] - point['arrival']) <= 60 and abs(other['departure'] - point['departure']) <= 60]
            if points and points[-1]['code'] == point['code'] and point['arrival'] - points[-1]['departure'] <= 1200:
                matches = [points[-1]]
            if matches:
                other = matches[0]
                other['arrival'] = min(other['arrival'], point['arrival'])
                other['departure'] = max(other['departure'], point['departure'])
                other['passenger'] |= point['passenger']
                other['pickupOnly'] |= point['pickupOnly']
                other['setDownOnly'] |= point['setDownOnly']
            else:
                points.append(point)
        if len(points) < 2 or points[0]['arrival'] >= 86400 or points[-1]['departure'] < 0:
            continue
        for i, point in enumerate(points):
            if point['departure'] < point['arrival'] or (i and point['arrival'] < points[i-1]['departure']):
                conflicts.append({'id': key, 'point': point, 'previous': points[i-1] if i else None, 'sources': entry['sources']})
        entry['points'] = points
        journeys.append(entry)
    return {'journeys': journeys, 'stations': stations, 'sources': sources, 'unmapped': dict(unmapped), 'conflicts': conflicts, 'columnCounts': dict(counts)}


def xy(point):
    return (point[0] * 69.3, point[1] * 111.32)


def distance(a, b):
    return math.hypot((a[0] - b[0]) * 69.3, (a[1] - b[1]) * 111.32)


class RailwayGraph:
    def __init__(self, osm, stations):
        self.nodes = {e['id']: e for e in osm['elements'] if e['type'] == 'node'}
        self.graph = collections.defaultdict(list)
        self.grid = collections.defaultdict(list)
        self.stations = stations
        self.candidates = {}
        self.cache = {}
        for way in osm['elements']:
            if way['type'] != 'way':
                continue
            tags = way.get('tags', {})
            if tags.get('service') in ['yard', 'siding', 'spur']:
                continue
            if tags.get('railway') != 'rail':
                # National Rail shares the Metropolitan tracks north of Harrow,
                # and scheduled SWR diversions use East Putney–Wimbledon.
                if tags.get('railway') != 'subway':
                    continue
                coordinates = [self.nodes[n] for n in way['nodes']]
                if not all((n['lat'] > 51.57 and n['lon'] < -0.29) or (51.416 < n['lat'] < 51.463 and -0.217 < n['lon'] < -0.19) for n in coordinates):
                    continue
            for a, b in zip(way['nodes'], way['nodes'][1:]):
                na, nb = self.nodes[a], self.nodes[b]
                length = distance([na['lon'], na['lat']], [nb['lon'], nb['lat']])
                self.graph[a].append((b, length, way['id']))
                self.graph[b].append((a, length, way['id']))
        for node_id in self.graph:
            node = self.nodes[node_id]
            x, y = xy([node['lon'], node['lat']])
            self.grid[(math.floor(x / 0.25), math.floor(y / 0.25))].append(node_id)

    def station_candidates(self, code):
        if code in self.candidates:
            return self.candidates[code]
        station = self.stations[code]
        point = [station['lon'], station['lat']]
        x, y = xy(point)
        gx, gy = math.floor(x / 0.25), math.floor(y / 0.25)
        found = []
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                for node_id in self.grid[(gx + dx, gy + dy)]:
                    node = self.nodes[node_id]
                    length = distance(point, [node['lon'], node['lat']])
                    if length <= (0.45 if code in ['STP', 'SPL', 'PAD', 'WAT', 'VIC'] else 0.25):
                        found.append((node_id, length))
        found.sort(key=lambda item: item[1])
        self.candidates[code] = found[:100]
        return self.candidates[code]

    def route(self, a, b):
        if (a, b) in self.cache:
            return self.cache[(a, b)]
        if (b, a) in self.cache:
            path, ways, length = self.cache[(b, a)]
            return list(reversed(path)), ways, length
        na, nb = self.stations[a], self.stations[b]
        pa, pb = [na['lon'], na['lat']], [nb['lon'], nb['lat']]
        starts, targets = self.station_candidates(a), dict(self.station_candidates(b))
        if not starts or not targets:
            raise ValueError(f'Station lacks a connected railway anchor: {a if not starts else b}')
        queue, best, previous = [], {}, {}
        def heuristic(node_id):
            node = self.nodes[node_id]
            return distance([node['lon'], node['lat']], pb)
        for node_id, length in starts:
            best[node_id] = length
            heapq.heappush(queue, (length + heuristic(node_id), length, node_id))
        finish, total = None, float('inf')
        while queue:
            estimate, cost, node_id = heapq.heappop(queue)
            if estimate >= total:
                break
            if cost != best[node_id]:
                continue
            if node_id in targets and cost + targets[node_id] < total:
                finish, total = node_id, cost + targets[node_id]
            for target, length, way in self.graph[node_id]:
                candidate = cost + length
                if candidate >= best.get(target, float('inf')):
                    continue
                best[target] = candidate
                previous[target] = (node_id, way)
                heapq.heappush(queue, (candidate + heuristic(target), candidate, target))
        if finish is None:
            raise ValueError(f'Disconnected rail path {a}–{b}')
        nodes, ways = [finish], set()
        while nodes[-1] in previous:
            node_id, way = previous[nodes[-1]]
            nodes.append(node_id)
            ways.add(way)
        path = [pa] + [[self.nodes[n]['lon'], self.nodes[n]['lat']] for n in reversed(nodes)] + [pb]
        # Tiny station-anchor connectors join parallel platform tracks; the route itself follows OSM rails.
        path = [p for i, p in enumerate(path) if i == 0 or p != path[i - 1]]
        if total > max(3, distance(pa, pb) * 2.6):
            raise ValueError(f'Rail detour {a}–{b}: {total:.2f} km vs {distance(pa,pb):.2f} km direct')
        result = (path, sorted(ways), total)
        self.cache[(a, b)] = result
        return result


def boundary_distance(point, rings):
    inside = False
    nearest = float('inf')
    px, py = xy(point)
    for ring in rings:
        for a, b in zip(ring, ring[1:] + ring[:1]):
            if (a[1] > point[1]) != (b[1] > point[1]) and point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]:
                inside = not inside
            ax, ay = xy(a); bx, by = xy(b)
            dx, dy = bx - ax, by - ay
            length = dx * dx + dy * dy
            t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length)) if length else 0
            nearest = min(nearest, math.hypot(px - ax - t * dx, py - ay - t * dy))
    return -nearest if inside else nearest


def route_journeys(result, osm):
    if result['conflicts']:
        raise ValueError('Resolve timetable conflicts before compiling geometry')
    graph = RailwayGraph(osm, result['stations'])
    boundary = json.loads(Path('fixtures/tfl/all-change-geography.json').read_text())['boundary']
    rings = boundary['coordinates'] if boundary['type'] == 'Polygon' else [r for p in boundary['coordinates'] for r in p]
    distances = {code: boundary_distance([node['lon'], node['lat']], rings) for code, node in result['stations'].items()}
    pairs = {tuple([a['code'], b['code']]) for train in result['journeys'] for a, b in zip(train['points'], train['points'][1:]) if a['code'] != b['code']}
    failed, geometry = {}, {}
    for a, b in sorted(pairs):
        if distances[a] > 5 and distances[b] > 5:
            continue
        try:
            path, ways, length = graph.route(a, b)
            geometry[a + ':' + b] = {'path': path, 'ways': ways, 'length': length}
        except ValueError as error:
            failed[a + ':' + b] = str(error)
    included, excluded = [], []
    for train in result['journeys']:
        points = train['points']
        visible = [i for i, point in enumerate(points) if distances[point['code']] <= 4]
        if not visible:
            continue
        points = points[max(0, min(visible) - 1):min(len(points), max(visible) + 2)]
        keys = [a['code'] + ':' + b['code'] for a, b in zip(points, points[1:])]
        missing = [key for key in keys if key not in geometry]
        if missing:
            excluded.append({'uid': train['uid'], 'originDate': train['originDate'], 'operator': train['operator'], 'missing': missing})
            continue
        included.append({**train, 'points': points})
    return {**result, 'journeys': included, 'geometry': geometry, 'stationBoundaryDistances': distances, 'geometryFailures': failed, 'excludedGeometry': excluded}


if __name__ == '__main__':
    osm = json.loads((CACHE / 'osm/combined.json').read_text())
    result = read_columns(osm)
    (CACHE / 'normalized.json').write_text(json.dumps(result))
    result['publicCallAudit'] = supplement(result, CACHE)
    result['sources'] += [{'table': f'NRT{table}', 'sha256': hashlib.sha256((CACHE/f'NRT{table}.pdf').read_bytes()).hexdigest(), 'url': json.loads((CACHE/'enrt-sources.json').read_text())[table]} for table in TARGETS]
    (CACHE / 'supplement-audit.json').write_text(json.dumps(result['publicCallAudit'], indent=2))
    print('Normalized', len(result['journeys']), 'journeys;', len(result['conflicts']), 'timing conflicts;', len(result['unmapped']), 'unmapped advertised locations')
    routed = route_journeys(result, osm)
    (CACHE / 'routed.json').write_text(json.dumps(routed))
    print('Routed', len(routed['journeys']), 'journeys;', len(routed['geometryFailures']), 'route issues;', len(routed['excludedGeometry']), 'affected journeys')
