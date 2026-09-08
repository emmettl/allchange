#!/usr/bin/env python3
"""Compile the pinned TfL Friday cycle extract. Standard library, offline."""
import argparse
import csv
import hashlib
import json
import math
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

DATE = '2026-05-29'
ORIGIN = datetime.fromisoformat(DATE)
CSV_HASH = '20ff75281aefebd034883b59d3535a081b9b20862d4e1fceb9c666e5d9b8c97a'
POINTS_HASH = '22c498c90d42425bcf955b30c7ddcfb687fed349225f858004545f44321cf9cf'
FROZEN_POINTS_HASH = '2304345a1adfe5fec9499b906a0adbbc63f6af1c2c7834ec25a35f93127b9bc0'
SOURCE_URL = 'https://cycling.data.tfl.gov.uk/usage-stats/444JourneyDataExtract17May2026-31May2026.csv'


def normalize(name):
    return re.sub('[^a-z0-9]', '', name.lower())


def terminal(value):
    return str(int(value)) if value.isdigit() else None


def seconds(value):
    return int((datetime.strptime(value, '%Y-%m-%d %H:%M') - ORIGIN).total_seconds())


def compile_day(rows, points):
    terminals = {}
    for point in points:
        for prop in point['additionalProperties']:
            if prop['key'] != 'TerminalName':
                continue
            key = terminal(prop['value'])
            if not key or key in terminals:
                raise ValueError('Missing or duplicate terminal identity')
            if not (51.3 < point['lat'] < 51.7 and -0.6 < point['lon'] < 0.3):
                raise ValueError('Invalid London dock coordinate')
            terminals[key] = point
    seen, docks, trips, excluded = set(), {}, [], []
    dates, stats = Counter(), Counter()
    names = {}
    for row_number, row in enumerate(rows, 2):
        stats['sourceRows'] += 1
        identity = row['Number']
        if identity in seen:
            raise ValueError(f'Duplicate journey {identity}')
        seen.add(identity)
        start, end = seconds(row['Start date']), seconds(row['End date'])
        dates[row['Start date'][:10]] += 1
        # Include journeys across midnight; the file covers the preceding day.
        if start >= 86400 or end < 0:
            continue
        stats['overlappingRows'] += 1
        stats['sourceDepartures'] += 0 <= start < 86400
        stats['sourceReturns'] += 0 <= end < 86400
        duration = float(row['Total duration (ms)']) / 1000
        if not math.isfinite(duration) or duration < 0 or abs((end - start) - duration) >= 60:
            raise ValueError(f'Inconsistent duration in row {row_number}')
        reason = None
        if end < start:
            reason = 'negative timestamp duration'
        elif end - start > 86400:
            reason = 'duration exceeds bounded 24-hour replay'
        endpoints = []
        for side in ['Start', 'End']:
            key = terminal(row[f'{side} station number'])
            point = terminals.get(key)
            if not point:
                reason = reason or 'unmapped terminal'
            elif normalize(row[f'{side} station']) != normalize(point['commonName']):
                reason = reason or 'terminal name mismatch (possible reused identity)'
            endpoints.append(key)
        if reason:
            excluded.append({'row': row_number, 'id': identity, 'reason': reason,
                             'start': row['Start date'], 'end': row['End date'],
                             'from': [row['Start station number'], row['Start station']],
                             'to': [row['End station number'], row['End station']]})
            continue
        for side, key in zip(['Start', 'End'], endpoints):
            point = terminals[key]
            name = row[f'{side} station']
            if key in names and names[key] != name:
                raise ValueError(f'Ambiguous source name for terminal {key}')
            names[key] = name
            docks[key] = {'id': key, 'name': name, 'bikePointId': point['id'],
                          'lon': point['lon'], 'lat': point['lat']}
        trips.append([start, end, *endpoints])
        stats['departures'] += 0 <= start < 86400
        stats['returns'] += 0 <= end < 86400
        stats['carryIn'] += start < 0 < end
        stats['carryOut'] += start < 86400 < end
        stats['sameDock'] += endpoints[0] == endpoints[1]
        stats['sameMinute'] += start == end
    ordered = sorted(docks.values(), key=lambda dock: int(dock['id']))
    indexes = {dock['id']: i for i, dock in enumerate(ordered)}
    trips = sorted([[s, e, indexes[a], indexes[b]] for s, e, a, b in trips])
    source = {'url': SOURCE_URL, 'sha256': CSV_HASH, 'published': '2026-06-09',
              'retrieved': '2026-09-08', 'stationsUrl': 'https://api.tfl.gov.uk/BikePoint',
              'stationsSha256': POINTS_HASH, 'frozenStationsSha256': FROZEN_POINTS_HASH, 'stationsRetrieved': '2026-09-08'}
    return ({'version': 1, 'date': DATE, 'timezone': 'Europe/London', 'source': source,
             'stations': ordered, 'trips': trips, 'excludedJourneys': len(excluded)},
            {'date': DATE, 'source': source, 'counts': dict(stats), 'sourceStartDates': dict(sorted(dates.items())),
             'mappedStations': len(ordered), 'includedJourneys': len(trips),
             'exclusionsByReason': dict(Counter(row['reason'] for row in excluded)), 'excluded': excluded,
             'semantics': ['Minute-resolution local timestamps; no inferred seconds.',
                           'Same-minute hires count as events but have no animated duration.',
                           'Same-dock hires count at the dock; no invented route.',
                           'Net returns minus departures excludes fleet rebalancing and is not dock availability.',
                           'Current coordinates require matching terminal ID and normalized station name.',
                           'No Bike number or customer identity is retained.']})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('journeys', type=Path)
    parser.add_argument('bikepoints', type=Path)
    parser.add_argument('--output', type=Path, default=Path('fixtures/cycle-hire'))
    args = parser.parse_args()
    for file, expected in [(args.journeys, [CSV_HASH]), (args.bikepoints, [POINTS_HASH, FROZEN_POINTS_HASH])]:
        if hashlib.sha256(file.read_bytes()).hexdigest() not in expected:
            raise ValueError(f'{file.name}: source changed; audit before updating the hash')
    with args.journeys.open(newline='', encoding='utf-8-sig') as source:
        data, audit = compile_day(csv.DictReader(source), json.loads(args.bikepoints.read_text()))
    if len({s // 3600 for s, _, _, _ in data['trips'] if 0 <= s < 86400}) != 24:
        raise ValueError('The source does not establish all 24 departure hours')
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'day.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')
    (args.output / 'audit.json').write_text(json.dumps(audit, indent=2) + '\n')
    print(json.dumps({**audit['counts'], 'stations': audit['mappedStations'], 'excluded': audit['exclusionsByReason']}))


if __name__ == '__main__':
    main()
