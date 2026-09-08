import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('numbat', Path(__file__).with_name('compile-numbat.py'))
numbat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(numbat)


class NumbatCompilerTests(unittest.TestCase):
    def test_zero_is_valid_but_missing_is_not(self):
        row = dict.fromkeys(range(11, 107), 0)
        row[4] = 0
        self.assertEqual(numbat.profile(row, 11, 4), [0] * 96)
        del row[11]
        with self.assertRaises(ValueError):
            numbat.profile(row, 11, 4)

    def test_interval_sum_must_match_total(self):
        row = dict.fromkeys(range(11, 107), 1)
        row[4] = 96
        self.assertEqual(sum(numbat.profile(row, 11, 4)), 96)
        row[4] = 192
        with self.assertRaises(ValueError):
            numbat.profile(row, 11, 4)

    def test_midnight_header_and_traffic_day_order(self):
        row = {}
        for i in range(96):
            a, b = (300 + 15 * i) % 1440, (315 + 15 * i) % 1440
            row[11 + i] = f'{a // 60:02}{a % 60:02}-{b // 60:02}{b % 60:02}'
        numbat.check_headers(row, 11)
        row[11] = '0000-0015'
        with self.assertRaises(ValueError):
            numbat.check_headers(row, 11)

    def test_errors_and_negative_cells_are_not_zero(self):
        for invalid in ['#REF!', float('nan'), float('inf'), -1]:
            row = dict.fromkeys(range(11, 107), 0)
            row[11], row[4] = invalid, 0
            with self.assertRaises(ValueError):
                numbat.profile(row, 11, 4)


if __name__ == '__main__':
    unittest.main()
