import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('cycle', Path(__file__).with_name('compile-cycle-hire.py'))
cycle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cycle)


def point(key, name):
    return {'id': f'BikePoints_{key}', 'commonName': name, 'lat': 51.5, 'lon': -0.1,
            'additionalProperties': [{'key': 'TerminalName', 'value': key}]}


def trip(identity='1', start='2026-05-29 08:00', end='2026-05-29 08:10', origin='Alpha', destination='Beta'):
    return {'Number': identity, 'Start date': start, 'End date': end,
            'Start station number': '001', 'End station number': '002',
            'Start station': origin, 'End station': destination,
            'Total duration (ms)': str((cycle.seconds(end) - cycle.seconds(start)) * 1000)}


class CompileCycleTests(unittest.TestCase):
    def test_comparison_profiles_count_midnight_events_and_preserve_missing_days(self):
        points = [point('1', 'Alpha'), point('2', 'Beta')]
        friday, _ = cycle.compile_day([trip(start='2026-05-28 23:59', end='2026-05-29 00:01'),
                                      trip('2', start='2026-05-29 23:59', end='2026-05-30 00:01')], points)
        saturday, _ = cycle.compile_day([], points, '2026-05-30')
        manifest = cycle.comparison_manifest([friday, saturday])
        profiles = cycle.dock_comparisons([friday, saturday], manifest)
        self.assertEqual(sum(profiles['1']['profiles'][0]['departures']), 1)
        self.assertEqual(profiles['1']['profiles'][0]['departures'][95], 1)
        self.assertEqual(profiles['2']['profiles'][0]['returns'][0], 1)
        self.assertIsNone(profiles['1']['profiles'][1])

    def test_date_origin_and_comparison_scale_are_shared_without_reindexing_identity(self):
        points = [point('1', 'Alpha'), point('2', 'Beta')]
        friday, _ = cycle.compile_day([trip()], points)
        saturday, audit = cycle.compile_day([trip(start='2026-05-30 08:00', end='2026-05-30 08:10')], points, '2026-05-30')
        self.assertEqual(saturday['trips'][0][:2], [28800, 29400])
        self.assertEqual(audit['date'], '2026-05-30')
        manifest = cycle.comparison_manifest([friday, saturday])
        self.assertEqual(manifest['profileMax'], {'1': 1, '2': 1})
        self.assertEqual(manifest['totalProfileMax'], 1)
        saturday['stations'][0]['name'] = 'Reused identity'
        with self.assertRaises(ValueError):
            cycle.comparison_manifest([friday, saturday])

    def test_identity_requires_terminal_and_name(self):
        data, audit = cycle.compile_day([trip()], [point('1', 'Alpha'), point('2', 'Reused terminal')])
        self.assertEqual(data['trips'], [])
        self.assertIn('name mismatch', audit['excluded'][0]['reason'])

    def test_midnight_uses_adjacent_days_and_same_minute_is_an_event(self):
        rows = [trip(start='2026-05-28 23:58', end='2026-05-29 00:02'),
                trip('2', start='2026-05-29 23:59', end='2026-05-30 00:03'),
                trip('3', start='2026-05-29 09:00', end='2026-05-29 09:00')]
        data, audit = cycle.compile_day(rows, [point('1', 'Alpha'), point('2', 'Beta')])
        self.assertEqual(data['trips'], [[-120, 120, 0, 1], [32400, 32400, 0, 1], [86340, 86580, 0, 1]])
        self.assertEqual(audit['counts']['departures'], 2)
        self.assertEqual(audit['counts']['returns'], 2)
        self.assertEqual(audit['counts']['sameMinute'], 1)

    def test_duplicates_fail_and_unmapped_long_hires_are_audited(self):
        points = [point('1', 'Alpha'), point('2', 'Beta')]
        with self.assertRaises(ValueError):
            cycle.compile_day([trip(), trip()], points)
        _, audit = cycle.compile_day([trip(end='2026-05-30 09:00')], points)
        self.assertEqual(len(audit['excluded']), 1)
        _, audit = cycle.compile_day([trip()], points[:1])
        self.assertEqual(audit['excluded'][0]['reason'], 'unmapped terminal')

    def test_duration_rounding_is_bounded_by_minute_precision(self):
        row = trip()
        row['Total duration (ms)'] = '660000'
        with self.assertRaises(ValueError):
            cycle.compile_day([row], [point('1', 'Alpha'), point('2', 'Beta')])


if __name__ == '__main__':
    unittest.main()
