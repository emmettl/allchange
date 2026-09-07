"""Reconcile omitted WTT calls against dated public eNRT tables, using surrounding calls."""
import collections
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

TARGETS = {'014': ('LEB', 'Lea Bridge', 'LE'), '051': ('BCZ', 'Brent Cross West', 'TL'), '161': ('BRS', 'Berrylands', 'SW')}
for table in ['180', '181', '182', '183', '184', '185', '186', '189', '190', '191']:
    TARGETS[table] = ('WAE', 'London Waterloo (East)', 'SE')


def rows_for_page(page):
    rows = []
    for word in sorted(page.findall('.//{*}word'), key=lambda word: float(word.attrib['yMin'])):
        y = float(word.attrib['yMin'])
        if not rows or abs(rows[-1][0] - y) > 0.8: rows.append((y, []))
        rows[-1][1].append((float(word.attrib['xMin']), float(word.attrib['xMax']), word.text or ''))
    return [(y, sorted(words)) for y, words in rows]



def public_columns(cache):
    records = []
    for table, (target, label, operator) in TARGETS.items():
        if target == 'BRS':
            if 'BERRYLANDS STATION IS CLOSED UNTIL 20 SEPTEMBER' not in (cache / 'NRT161.txt').read_text(): raise ValueError('Review Berrylands closure against the passenger timetable')
            continue
        for page_number, page in enumerate(ET.parse(cache / f'NRT{table}.html').findall('.//{*}page'), 1):
            rows = rows_for_page(page)
            text = ' '.join(word[2] for _, words in rows for word in words)
            if 'Mondays to Fridays' not in text or 'from 21 September' in text or (target == 'BRS' and 'BERRYLANDS STATION IS CLOSED UNTIL 20 SEPTEMBER' in text):
                continue
            starts = [i for i, (_, words) in enumerate(rows) if any(word[2] == 'Operator' for word in words)]
            for start, end in zip(starts, starts[1:] + [len(rows)]):
                header = rows[start][1]
                operator_word = next(word for word in header if word[2] == 'Operator')
                columns = [(a+b)/2 for a,b,word in header if a > operator_word[1] and word not in ['Operator']]
                if not columns:
                    continue
                calls = [[] for _ in columns]
                for y, words in rows[start+1:end]:
                    name = ' '.join(word for a,b,word in words if b < columns[0] - 5)
                    match = re.search(r'\(([A-Z]{3})\)', name)
                    code = match[1] if match else None
                    if label in name: code = target
                    if 'London Charing Cross' in name: code = 'CHX'
                    if 'St Pancras International' in name and operator == 'TL': code = 'SPL'
                    if not code: continue
                    kind = 'arrival' if name.rstrip().endswith('a') else 'departure'
                    for a,b,word in words:
                        time = re.fullmatch(r'(\d{2})(\d{2})([a-z]?)', word)
                        if not time or int(time[1]) > 23 or int(time[2]) > 59: continue
                        middle = (a+b)/2
                        column = min(range(len(columns)), key=lambda c: abs(columns[c]-middle))
                        if abs(columns[column]-middle) > 5: continue
                        calls[column].append({'code': code, 'time': int(time[1])*3600 + int(time[2])*60, 'kind': 'arrival' if time[3] == 'a' else kind})
                for column, values in enumerate(calls):
                    for call in values:
                        if call['code'] == target:
                            records.append({**call, 'operator': operator, 'anchors': [v for v in values if v['code'] != target], 'table': f'NRT{table}', 'page': page_number, 'column': column+1})
    return records


def supplement(result, cache):
    records = public_columns(cache)
    by_operator = collections.defaultdict(list)
    for train in result['journeys']: by_operator[train['operator']].append(train)
    added, unmatched, ambiguous = [], [], []
    for record in records:
        candidates = []
        for train in by_operator[record['operator']]:
            for day in [-1, 0, 1]:
                time = record['time'] + day*86400
                if not 0 <= time < 86400 or time < train['points'][0]['arrival'] or time > train['points'][-1]['departure']: continue
                matches = []
                for anchor in record['anchors']:
                    for point in train['points']:
                        if point['code'] != anchor['code'] or not point['passenger']: continue
                        delta = (point[anchor['kind']] - anchor['time'] + 43200) % 86400 - 43200
                        if abs(delta) <= 60: matches.append((point, abs(delta)))
                before = [p for p,d in matches if p['departure'] <= time]
                after = [p for p,d in matches if p['arrival'] >= time]
                if before and after and len({p['code'] for p,d in matches}) >= 2:
                    candidates.append((sum(d for p,d in matches)/len(matches), train, time, (max(p['departure'] for p in before), min(p['arrival'] for p in after))))
        if not candidates:
            # Other weekday calendar variants can have no active Friday counterpart.
            unmatched.append({key: record[key] for key in ['code','time','table','page','column']})
            continue
        best = min(score for score,train,time,bracket in candidates)
        selected = [(train,time,bracket) for score,train,time,bracket in candidates if score == best]
        if len({bracket for train,time,bracket in selected}) > 1:
            ambiguous.append({'record': record, 'uids': [train['uid'] for train,time,bracket in selected]})
            continue
        for train,time,bracket in selected:
            existing = next((point for point in train['points'] if point['code'] == record['code'] and abs(point['arrival']-time) <= 120), None)
            if existing: continue
            source = {key: record[key] for key in ['table','page','column']}
            train['sources'].append(source)
            train['points'].append({'code': record['code'], 'arrival': time, 'departure': time, 'passenger': True, 'pickupOnly': False, 'setDownOnly': False, 'rows': [], 'source': len(train['sources'])-1, 'publicSupplement': source})
            train['points'].sort(key=lambda point: point['arrival'])
            added.append({'uid': train['uid'], 'originDate': train['originDate'], 'code': record['code'], 'time': time, **source})
    # Reviewed in NRT051 pp1/41 (MO) and NRT183 pp25/120 (WTHO).
    non_friday = {('BCZ',time) for time in [300,1800,3600,5280,2220]} | {('WAE',86160),('WAE',84780)}
    unresolved = [record for record in unmatched if (record['code'],record['time']) not in non_friday]
    if unresolved or ambiguous: raise ValueError(f'Unresolved public timetable calls: {unresolved}; ambiguous: {ambiguous}')
    return {'added': added, 'excludedNonFridayColumns': unmatched, 'ambiguous': ambiguous, 'sourceColumns': len(records), 'closedStations': [{'code':'BRS', 'reason':'Closed until 20 September 2026 for improvement works', 'table':'NRT161', 'page':1}]}


if __name__ == '__main__':
    import os
    cache = Path(os.environ.get('RAIL_CACHE', '/tmp/allchange-rail-complete'))
    result = json.loads((cache/'normalized.json').read_text())
    audit = supplement(result, cache)
    (cache/'supplement-audit.json').write_text(json.dumps(audit, indent=2))
    (cache/'supplemented.json').write_text(json.dumps(result))
    print('Added', len(audit['added']), collections.Counter(v['code'] for v in audit['added']), 'unmatched',len(audit['excludedNonFridayColumns']), 'ambiguous',len(audit['ambiguous']), 'source columns',audit['sourceColumns'])
