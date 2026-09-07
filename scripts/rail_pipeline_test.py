import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('rail', Path(__file__).with_name('london-rail-network.py'))
rail = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rail)

class RailPipelineTests(unittest.TestCase):
    def test_calendar_and_half_minutes(self):
        period = '18/05/2026 to 12/12/2026'
        friday = dt.date(2026, 9, 4)
        self.assertTrue(rail.runs_on('WThFO',period,friday))
        self.assertFalse(rail.runs_on('MTO',period,friday))
        self.assertFalse(rail.runs_on('SX',period,dt.date(2026,9,5)))
        self.assertTrue(rail.runs_on('SO',period,dt.date(2026,9,5)))
        self.assertFalse(rail.runs_on('SX',period,dt.date(2026,12,14)))
        self.assertEqual(rail.timing('07T45½'),(27930,'T'))
        self.assertEqual(rail.timing('07TBS45'),(27900,'TBS'))
        with self.assertRaises(ValueError):rail.timing('07ZZ45')
        with self.assertRaises(ValueError):rail.runs_on('unknown',period,friday)

    def test_missing_terminal_header_and_overlapping_dwell(self):
        headers = ['TID','UID','Operator','Origin','Destination','Timing Load','Dates of Operation','Running Days','Service Code']
        values = ['2A01','TEST01','SE','LONDON VICTORIA (E)\n07:00','HAYES (KENT)\n07:30','','18/05/2026 to 11/12/2026','SX','']
        def rows(body):return [['',label,values[i]] for i,label in enumerate(headers)] + body
        osm = {'elements':[{'type':'node','id':i,'lon':-.1+i*.01,'lat':51.4,'tags':{'name':name,'ref:crs':code,'network':'National Rail'}} for i,(code,name) in enumerate([('VIC','London Victoria'),('CLJ','Clapham Junction'),('HYS','Hayes')])]}
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder);(cache/'wtt').mkdir()
            for table,body in [('A',[['CLAPHAM JUNCTION','arr','07T10']]),('B',[['CLAPHAM JUNCTION','dep','0712']])]:
                (cache/'wtt'/f'{table}.xlsx').write_bytes(b'test source')
                (cache/'wtt'/f'{table}.json').write_text(json.dumps({'Mondays to Fridays Forward':rows(body)}))
            result=rail.read_columns(osm,cache)
            train=next(t for t in result['journeys'] if t['originDate']=='2026-09-04')
            self.assertEqual([(p['code'],p['arrival'],p['departure']) for p in train['points']],[('VIC',25200,25200),('CLJ',25800,25920),('HYS',27000,27000)])
            self.assertTrue(all(p['passenger'] for p in train['points']))
            self.assertEqual(result['conflicts'],[])

if __name__=='__main__':unittest.main()
