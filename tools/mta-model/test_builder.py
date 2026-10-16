"""Focused safety, transform, provenance and topology tests; no network/database."""
import argparse
import importlib.util
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile
import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

spec=importlib.util.spec_from_file_location('mta_builder',Path(__file__).with_name('build_brooklyn_mta.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)

class InputSafety(unittest.TestCase):
    def test_rejects_archive_traversal_and_symlink(self):
        for name in ['../escape.txt','/absolute','x\\\\escape.txt']:
            out=io.BytesIO()
            with zipfile.ZipFile(out,'w') as z:z.writestr(name,'safe')
            with zipfile.ZipFile(io.BytesIO(out.getvalue())) as z:
                with self.assertRaises(ValueError):b.safe_archive(z)
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:
            i=zipfile.ZipInfo('symlink');i.external_attr=(0o120777<<16);z.writestr(i,'outside')
        with zipfile.ZipFile(io.BytesIO(out.getvalue())) as z:
            with self.assertRaises(ValueError):b.safe_archive(z)
    def test_approved_hosts_are_exact_tls_no_userinfo(self):
        b.validate_url('https://data.ny.gov/resource/39hk-dx4f.csv')
        for url in ['http://data.ny.gov/','https://data.ny.gov.evil.example/','https://user:secret@data.ny.gov/','file:///private']:
            with self.assertRaises(ValueError):b.validate_url(url)
    def test_corrupt_cache_fails_before_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);(p/'x').write_bytes(b'corrupted');(p/'acquisition.json').write_text(json.dumps({'x':{'sha256':'deadbeef'}}))
            a=b.Acquisition(p,True)
            with self.assertRaisesRegex(ValueError,'hash mismatch'):a.fetch('x','https://data.ny.gov/x')
    def test_oversized_cache_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);(p/'x').write_bytes(b'1234');a=b.Acquisition(p,True)
            with self.assertRaisesRegex(ValueError,'over bound'):a.fetch('x','https://data.ny.gov/x',3)
    def test_range_ignoring_server_body_never_read(self):
        class Response:
            status=200
            url="https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/a.tif"
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def read(self,*a):raise AssertionError('Ignored Range body must never be read')
        class Opener:
            def open(self,*a,**kw):return Response()
        with tempfile.TemporaryDirectory() as tmp:
            d=b.DEM.__new__(b.DEM);d.data=Path(tmp);d.received=0;d.budget=100000;d.range_records=[];d.acq=argparse.Namespace(offline=False,opener=Opener())
            with self.assertRaisesRegex(ValueError,'ignored Range'):d.range('https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/a.tif',0,100)
            self.assertEqual(d.received,0)
    def test_corrupt_dem_range_cache_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=b.DEM.__new__(b.DEM);d.data=Path(tmp);d.acq=argparse.Namespace(offline=True)
            url='https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/a.tif';key=b.sha(url.encode())[:16]+'-0-4.bin'
            path=d.data/'S6-ranges'/key;path.parent.mkdir();path.write_bytes(b'bad!')
            d.range_index={key:{'bytes':4,'sha256':b.sha(b'good')}}
            with self.assertRaisesRegex(ValueError,'corrupt DEM'):d.range(url,0,4)
    def test_corrupt_derived_dem_cache_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'S6-derived-ground.json';path.write_bytes(b'{}')
            path.with_suffix('.sha256.json').write_text(json.dumps({'sha256':'wrong','inputsSha256':b.sha(b.canonical({}))}))
            with self.assertRaisesRegex(ValueError,'cached hash'):b.DEM(b.Acquisition(tmp,True),Polygon(),[],1,True)
    def test_oversized_range_is_refused(self):
        f=b.RangeFile(None,'https://example.test',100_000_000)
        with self.assertRaisesRegex(ValueError,'over16MB'):f.read(20_000_000)

class CoordinateModel(unittest.TestCase):
    def test_level_domain_is_complete_and_unknown_is_not_zero(self):
        self.assertEqual([b.level(x) for x in range(1,13)],list(range(-1,-13,-1)))
        self.assertEqual([b.level(x) for x in range(13,27)],list(range(14)))
        for x in [99,None,'unknown',0,27]:self.assertIsNone(b.level(x))
    def test_original_distance_interpolation_survives_clipping(self):
        builder=b.Builder.__new__(b.Builder);builder.args=argparse.Namespace(level_height=6.)
        s={'original':LineString([(0,0),(100,0)]),'originalLengthM':100.,'levelA':-1.,'levelB':1.}
        self.assertAlmostEqual(builder.l(s,25.,0.),-3.)
        self.assertAlmostEqual(builder.l(s,75.,0.),3.)
        self.assertAlmostEqual(builder.l(s,0.,0.),-6.)
    def test_known_structure_and_route_cannot_be_soft_penalties(self):
        builder=b.Builder.__new__(b.Builder)
        builder.route_domain={'1':{'F'},'2':{'A'}}
        builder.segments=[{'id':'wrong','line':LineString([(0,0),(10,0)]),'row':'2','properties':{'ROUTE':'1'}},{'id':'right','line':LineString([(0,35),(10,35)]),'row':'1','properties':{'ROUTE':'1'}},{'id':'wrongroute','line':LineString([(0,1),(10,1)]),'row':'1','properties':{'ROUTE':'2'}}]
        builder.tree=STRtree([s['line'] for s in builder.segments])
        s,d=builder.nearest(Point(5,0),['F'],'Subway');self.assertEqual(s['id'],'right');self.assertEqual(d,35.)
        s,d=builder.nearest(Point(5,0),['G'],'Subway');self.assertIsNone(s)
    def test_shared_shuttle_short_name_requires_physical_line_context(self):
        builder=b.Builder.__new__(b.Builder);builder.route_colors={'GS':'#7C858C','FS':'#7C858C','H':'#7C858C'}
        builder.route_aliases={'GS':'S','FS':'S','H':'S'};builder.route_long_names={'GS':'42 St Shuttle','FS':'Franklin Avenue Shuttle','H':'Rockaway Park Shuttle'}
        self.assertEqual(builder.resolve_route_id('S','FRANKLIN AVE SHUTTLE LINE'),'FS')
        self.assertEqual(builder.resolve_route_id('S','ROCKAWAY PARK LINE'),'H')
        self.assertIsNone(builder.resolve_route_id('S','SHUTTLE LINE'))
        self.assertIsNone(builder.resolve_route_id('S','BRIGHTON LINE'))
    def test_densification_never_exceeds_twenty_meters(self):
        for length in [1.,20.,21.,101.]:
            a=np.asarray(b.sample_line(LineString([(0.,0.),(length,0.)])))
            self.assertTrue(np.all(np.linalg.norm(np.diff(a,axis=0),axis=1)<=20.000001))
    def test_glb_axes_are_rotation_not_reflection_and_refs_survive(self):
        model=b.GLB([1000.,2000.]);model.add('test','stations',[[1000,2000,30],[1010,2000,30],[1000,2010,30]],[[0,1,2]],[20,20,20],{'sourceIds':['S3:X'],'assumption':'test','stationId':'X'})
        data=model.export();self.assertEqual(struct.unpack('<III',data[:12]),(0x46546c67,2,len(data)))
        tree=json.loads(data[20:20+struct.unpack('<I',data[12:16])[0]])
        self.assertEqual(tree['accessors'][0]['min'],[0.,30.,-10.]);self.assertEqual(tree['accessors'][0]['max'],[10.,30.,0.])
        self.assertIn('_REFERENCE_ELEVATION',tree['meshes'][0]['primitives'][0]['attributes'])
        self.assertEqual(np.linalg.det(np.array([[1,0,0],[0,0,1],[0,-1,0]])),1.)
        self.assertEqual(data,model.export())
    def test_mesh_invalid_indices_and_nan_fail_closed(self):
        for vertices,faces in [([[0,0,float('nan')]],[[0,0,0]]),([[0,0,0]],[[0,1,2]])]:
            with self.assertRaises(ValueError):b.GLB([0,0]).add('bad','tracks',vertices,faces,[0],{})
    def test_clipped_prism_footprint_holes_are_respected(self):
        poly=Polygon([(0,0),(10,0),(10,10),(0,10)],holes=[[(3,3),(7,3),(7,7),(3,7)]])
        v,f,refs=b.prism(poly,lambda x,y:-9,lambda x,y:-3,lambda x,y:0)
        self.assertTrue(all(poly.covers(Point(x,y)) for x,y,z in v))
        self.assertTrue(all(-9<=z<=-3 for x,y,z in v))
        self.assertEqual(len(refs),len(v));self.assertGreater(len(f),0)

if __name__=='__main__':unittest.main(verbosity=2)
