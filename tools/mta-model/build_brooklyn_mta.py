#!/usr/bin/env python3
"""Bounded, offline-capable Brooklyn schematic infrastructure builder.

Single-file implementation. No application database, credentials, API writes or
live clients. Public source acquisition is an explicit build-time operation.
"""
from __future__ import annotations
import argparse, collections, csv, datetime as dt, hashlib, io, json, math, os
from pathlib import Path, PurePosixPath
import re, struct, sys, tempfile, urllib.parse, urllib.request, urllib.error, zipfile
import xml.etree.ElementTree as ET
import numpy as np
from pyproj import CRS, Transformer
from shapely import make_valid, transform as geometry_transform, covers, points as geometry_points, distance as geometry_distance
from shapely.geometry import Point, LineString, Polygon, MultiPolygon, box, shape, mapping
from shapely.ops import triangulate
from shapely.strtree import STRtree

MODEL_ID = 'brooklyn-mta-schematic-v1'
FT = CRS.from_epsg(2263).axis_info[0].unit_conversion_factor
TO_FT = Transformer.from_crs(4326, 2263, always_xy=True)
TO_LL = Transformer.from_crs(2263, 4326, always_xy=True)
NOAA_CRS = Transformer.from_crs(2263, 6539, always_xy=True)
S1_BASE = 'https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Subway_view/FeatureServer'
S6_BASE = 'https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/dem/NYC_topobathy_BE_DEM_2017_9307/'
ALLOWED_HOSTS = {'services6.arcgis.com','raw.githubusercontent.com','github.com','rrgtfsfeeds.s3.amazonaws.com','data.ny.gov','data.cityofnewyork.us','noaa-nos-coastal-lidar-pds.s3.amazonaws.com','chs.coast.noaa.gov','www.fisheries.noaa.gov','www.mta.info','www.nyc.gov'}
SOURCES = {
 'S1': {'url':S1_BASE,'attribution':'NYC Office of Technology and Innovation / Department of City Planning','crs':'service EPSG:3857; requested GeoJSON EPSG:4326','units':'degrees','usage':'Public access; NYC Open Data terms apply; not an open-source-license assertion'},
 'S2': {'url':'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip','attribution':'MTA New York City Transit','crs':'EPSG:4326','units':'degrees','usage':'MTA developer feed terms; no logos or route-bullet artwork distributed'},
 'S3': {'url':'https://data.ny.gov/resource/39hk-dx4f.csv?$limit=50000','attribution':'Metropolitan Transportation Authority','crs':'EPSG:4326','units':'degrees','usage':'data.ny.gov public dataset; no explicit license in inspected metadata'},
 'S4': {'url':'https://data.ny.gov/api/v3/views/i9wp-a4ja/query.geojson?accessType=DOWNLOAD','attribution':'Metropolitan Transportation Authority','crs':'EPSG:4326','units':'degrees','usage':'data.ny.gov public dataset; no explicit license in inspected metadata'},
 'S5': {'url':'https://data.cityofnewyork.us/resource/wh2p-dxnf.geojson?$limit=10','attribution':'NYC Department of City Planning','crs':'EPSG:4326','units':'degrees','usage':'NYC Open Data terms apply; water-included administrative boundary'},
 'S6': {'url':S6_BASE+'index.html','attribution':'NOAA Office for Coastal Management; NYC 2017 topobathymetric bare-earth DEM','crs':'raster header EPSG:6539; vertical metadata EPSG:6360 NAVD88','units':'US survey feet horizontal and vertical','usage':'NOAA metadata use constraints; source-age/nodata/bathymetry limitations retained'},
}
ROW = {'1':'Subterranean','2':'Elevated','3':'Surface','4':'Hidden','5':'Open Cut Depression','6':'Embankment','7':'Viaduct','8':'Subterranean Coincident with Boundary'}
FALLBACK = {'1':-1,'2':1,'3':0,'5':-.5,'6':.5,'7':1,'8':-1}
PARAMS = {'densification_m':20.,'level_height_m':6.,'calibration_taper_m':400.,'gradient_diagnostic':.08,'route_snap_m':25.,'tunnel_width_m':8.,'tunnel_height_m':6.,'deck_thickness_m':1.5,'pier_spacing_m':30.,'platform_length_m':150.,'platform_width_m':10.,'route_radius_m':1.,'route_offset_m':2.5,'diagnostic_buffer_m':50.,'ground_sampling_m':30.}

def canonical(obj):
    return json.dumps(obj,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
def sha(b): return hashlib.sha256(b).hexdigest()
def atomic(path, data):
    path = Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    if isinstance(data,str): data=data.encode()
    tmp=path.with_name(path.name+'.tmp');tmp.write_bytes(data);os.replace(tmp,path)
def write_json(path,obj): atomic(path,canonical(obj))
def project_geometry(geom):
    return geometry_transform(geom,lambda coords: np.column_stack(TO_FT.transform(coords[:,0],coords[:,1]))*FT)
def unproject(x,y):
    lon,lat=TO_LL.transform(x/FT,y/FT);return [round(lon,9),round(lat,9)]
def llz(x,y,z): return unproject(x,y)+[round(float(z),5)]
def get_parts(geom,kind=None):
    if geom.is_empty:return []
    if geom.geom_type.startswith('Multi') or geom.geom_type=='GeometryCollection':
        return [g for child in geom.geoms for g in get_parts(child,kind)]
    return [geom] if not kind or geom.geom_type==kind else []
def level(code):
    try:code=int(code)
    except (TypeError,ValueError):return None
    return -code if 1<=code<=12 else code-13 if 13<=code<=26 else None

def safe_archive(z):
    total=0
    for i in z.infolist():
        p=PurePosixPath(i.filename)
        if p.is_absolute() or '..' in p.parts or '\\' in i.filename or i.external_attr>>16 & 0o170000 == 0o120000:
            raise ValueError('Unsafe archive member: '+i.filename)
        total+=i.file_size
        if total>250_000_000 or i.file_size>100_000_000:raise ValueError('Archive expansion exceeds bound')
        if i.compress_size and i.file_size/i.compress_size>300:raise ValueError('Archive compression ratio exceeds bound')

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        validate_url(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)
def validate_url(url):
    u=urllib.parse.urlsplit(url)
    if u.scheme!='https' or u.hostname not in ALLOWED_HOSTS or u.username or u.password:
        raise ValueError('Unapproved public-source URL')

class Acquisition:
    def __init__(self,data,offline=False):
        self.data=Path(data);self.data.mkdir(parents=True,exist_ok=True);self.offline=offline
        self.receipt_path=self.data/'acquisition.json'
        self.receipts=json.loads(self.receipt_path.read_text()) if self.receipt_path.exists() else {}
        self.failures=[]
        self.opener=urllib.request.build_opener(SafeRedirect())
    def fetch(self,name,url,limit=25_000_000,expected=None):
        validate_url(url);p=self.data/name
        if p.exists():
            b=p.read_bytes();old=self.receipts.get(name)
            if old and old['sha256']!=sha(b):raise ValueError('Cached hash mismatch '+name)
            if len(b)>limit:raise ValueError('Cached file over bound '+name)
            if not old:self.receipts[name]={'url':url,'bytes':len(b),'sha256':sha(b),'cacheWrittenAt':dt.datetime.fromtimestamp(p.stat().st_mtime,dt.UTC).isoformat(),'retrievalTimeQualification':'cached-write observation; initial response receipt not retained'}
            return b
        if self.offline:raise FileNotFoundError('Offline input missing '+name)
        error=None
        for attempt in range(2):
            try:
                req=urllib.request.Request(url,headers={'User-Agent':'SwaleSchematicBuilder/1.0 (public GIS; bounded static build)'})
                with self.opener.open(req,timeout=45) as r:
                    validate_url(r.url)
                    length=r.headers.get('Content-Length')
                    if length and int(length)>limit:raise ValueError('Content-Length exceeds bound '+name)
                    content=r.headers.get('Content-Type','').lower()
                    if expected and not any(t in content for t in expected):raise ValueError('Unexpected content type '+content)
                    b=r.read(limit+1)
                    if len(b)>limit:raise ValueError('Received bytes exceed bound '+name)
                    if length and len(b)!=int(length):raise ValueError('Incomplete body '+name)
                    rec={'url':url,'finalUrl':r.url,'bytes':len(b),'sha256':sha(b),'retrievedAt':dt.datetime.now(dt.UTC).isoformat(),'contentType':content,'lastModified':r.headers.get('Last-Modified'),'etag':r.headers.get('ETag')}
                atomic(p,b);self.receipts[name]=rec;self.flush();return b
            except (urllib.error.URLError,TimeoutError,ValueError,OSError) as e:
                error=e;self.failures.append({'name':name,'url':url,'attempt':attempt+1,'error':str(e)})
                if isinstance(e,urllib.error.HTTPError) and e.code in (401,403,429):break
        raise RuntimeError(f'Public source {name} unavailable: {error}')
    def register_local_snapshot(self):
        p=self.data/'backend-stations.json'
        if not p.exists():return
        body=p.read_bytes();old=self.receipts.get(p.name)
        if old and old['sha256']!=sha(body):raise ValueError('Backend identity snapshot hash changed')
        self.receipts[p.name]={'url':'http://127.0.0.1:5183/api/v1/subway/stations?bbox=-74.075,40.53,-73.79,40.79','bytes':len(body),'sha256':sha(body),'usage':'Read-only existing guarded local API response saved by root;identity snapshot only,not a new GIS truth dataset or application write','cacheWrittenAt':dt.datetime.fromtimestamp(p.stat().st_mtime,dt.UTC).isoformat()}
        self.flush()
    def flush(self):write_json(self.receipt_path,self.receipts)
    def acquire(self):
        self.fetch('S1-metadata.md','https://raw.githubusercontent.com/CityOfNewYork/nyc-geo-metadata/main/Metadata/Metadata_SubwayLines.md',expected=['text/'])
        self.fetch('S1-service.json',S1_BASE+'?f=pjson',expected=['json'])
        layer=json.loads(self.fetch('S1-layer.json',S1_BASE+'/0?f=pjson',expected=['json']))
        if layer.get('geometryType')!='esriGeometryPolyline':raise ValueError('S1 geometry schema changed')
        ids=json.loads(self.fetch('S1-ids.json',S1_BASE+'/0/query?'+urllib.parse.urlencode({'where':'1=1','returnIdsOnly':'true','f':'json'}),expected=['json']))['objectIds']
        fields='OBJECTID,SEGMENTID,LEGACY_SEGMENTID,ROW_TYPE,RAIL_TYPE,FROM_LEVEL_CODE,TO_LEVEL_CODE,ROUTE,DIVISION,LINE,SUBWAY_LABEL,SEGLOCSTATUS'
        found=[]
        # Stable ordered paging is reconciled against independently requested IDs.
        # Initial long-ID URL400 and 200-ID404 were diagnosed; ordered pages avoid URL limits.
        for start in range(0,len(ids),500):
            params={'where':'1=1','orderByFields':'OBJECTID ASC','resultOffset':start,'resultRecordCount':500,'outFields':fields,'returnGeometry':'true','outSR':'4326','f':'geojson'}
            j=json.loads(self.fetch(f'S1-features-{start:05}.geojson',S1_BASE+'/0/query?'+urllib.parse.urlencode(params),expected=['json']))
            if 'error' in j:raise ValueError('S1 error response')
            if len(j.get('features',[]))!=min(500,len(ids)-start):raise ValueError('S1 page incomplete')
            if j.get('exceededTransferLimit') and start+500>=len(ids):raise ValueError('S1 final transfer limit')
            found.extend(f['properties']['OBJECTID'] for f in j['features'])
        if sorted(found)!=sorted(ids) or len(found)!=len(set(found)):raise ValueError('S1 paging reconciliation failed')
        for source,name,url,limit in [
            ('S2','S2-gtfs.zip',SOURCES['S2']['url'],70_000_000),('S3','S3-stations.csv',SOURCES['S3']['url'],5_000_000),('S4','S4-entrances.geojson',SOURCES['S4']['url'],8_000_000),('S5','S5-boroughs.geojson',SOURCES['S5']['url'],5_000_000)]:
            try:self.fetch(name,url,limit)
            except (RuntimeError,FileNotFoundError):
                if source=='S2':
                    try:self.fetch('S2-supplemented.zip','https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip',70_000_000)
                    except (RuntimeError,FileNotFoundError):pass
                elif source=='S5':raise
        for source,dataset,host in [('S3','39hk-dx4f','data.ny.gov'),('S4','i9wp-a4ja','data.ny.gov'),('S5','wh2p-dxnf','data.cityofnewyork.us')]:
            try:self.fetch(source+'-metadata.json',f'https://{host}/api/views/{dataset}.json',5_000_000)
            except (RuntimeError,FileNotFoundError):pass
        for name,url in [('S6-catalogue.html',S6_BASE+'index.html'),('S6-index.vrt',S6_BASE+'NYC_topobathy_BE_DEM_2017_m9307_EPSG-6539.vrt'),('S6-metadata.xml',S6_BASE+'NYC_topobathy_dem_BE_2017_m9307_met.xml')]:
            try:self.fetch(name,url,5_000_000)
            except (RuntimeError,FileNotFoundError):pass
        self.flush()

# A custom GDAL opener ensures every remote DEM read uses a validated bounded
# Range response; it caches actual received ranges and never asks GDAL to fetch URLs.
class RangeFile(io.RawIOBase):
    def __init__(self,owner,url,size):self.owner=owner;self.url=url;self.length=size;self.pos=0
    def readable(self):return True
    def seekable(self):return True
    def tell(self):return self.pos
    def seek(self,offset,whence=0):
        self.pos=offset if whence==0 else self.pos+offset if whence==1 else self.length+offset
        if self.pos<0:raise ValueError('Negative range seek')
        return self.pos
    def read(self,n=-1):
        if n<0:n=self.length-self.pos
        n=min(n,self.length-self.pos)
        if n<=0:return b''
        if n>16_000_000:raise ValueError('DEM single range over16MB refused')
        b=self.owner.range(self.url,self.pos,n);self.pos+=len(b);return b
    def readinto(self,b):
        x=self.read(len(b));b[:len(x)]=x;return len(x)

class DEM:
    def __init__(self,acq,boundary,segments,budget_mb=256,enabled=True):
        self.acq=acq;self.data=acq.data;self.budget=budget_mb*1_000_000;self.received=0;self.range_records=[];self.range_index={}
        rr=self.data/'S6-range-receipt.json'
        if rr.exists():
            saved=json.loads(rr.read_text())
            self.range_records=saved.get('ranges',[])
            self.range_index={Path(r['cacheFile']).name:r for r in self.range_records}
        self.grids=[];self.notes=[];self.headers=[];self.samples={};self.enabled=enabled;self.missing_query_cells=set()
        self.cache=self.data/'S6-derived-ground.json'
        if not enabled:
            self.notes=['Flat reference preview explicitly requested;G unknown,display0m.'];return
        if self.cache.exists():
            guard=self.cache.with_suffix('.sha256.json')
            if not guard.exists():raise ValueError('Unsealed derived DEM cache refused;rebuild from checksum-verified range cache')
            receipt=json.loads(guard.read_text());body=self.cache.read_bytes()
            if sha(body)!=receipt['sha256'] or receipt['inputsSha256']!=self.input_fingerprint():raise ValueError('Derived DEM cached hash/input mismatch')
            j=json.loads(body);self.samples=j['samples'];self.notes=j['notes'];self.headers=j.get('headers',[]);return
        if not enabled or not (self.data/'S6-index.vrt').exists():self.notes=['Flat reference preview: source reference not available'];return
        # Read only 30m quantized corridor sample cells, never a borough-wide native mosaic.
        self.build_samples(boundary,segments)
    def input_fingerprint(self):
        names=['S5-boroughs.geojson','S6-index.vrt','S6-metadata.xml']+[p.name for p in sorted(self.data.glob('S1-features-*.geojson'))]
        return sha(canonical({n:sha((self.data/n).read_bytes()) for n in names if (self.data/n).exists()}))
    def range(self,url,start,n):
        validate_url(url);key=sha(url.encode())[:16]+f'-{start}-{n}.bin';p=self.data/'S6-ranges'/key
        if p.exists():
            rec=self.range_index.get(key);body=p.read_bytes()
            if not rec or rec['bytes']!=len(body) or rec['sha256']!=sha(body):raise ValueError('Unverified/corrupt DEM cached byte range refused')
            return body
        if self.acq.offline:raise FileNotFoundError('Offline DEM byte range missing')
        if self.received+n>self.budget:
            self.last_range_error='DEM received-byte budget exhausted';raise ValueError(self.last_range_error)
        req=urllib.request.Request(url,headers={'Range':f'bytes={start}-{start+n-1}','User-Agent':'SwaleSchematicBuilder/1.0'})
        with self.acq.opener.open(req,timeout=45) as r:
            validate_url(r.url)
            if r.status!=206:raise ValueError('DEM server ignored Range; body not read')
            cr=r.headers.get('Content-Range','');m=re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',cr)
            if not m or int(m[1])!=start or int(m[2])!=start+n-1:raise ValueError('Incorrect DEM Content-Range')
            if r.headers.get('Content-Length') and int(r.headers['Content-Length'])!=n:raise ValueError('Incorrect range length')
            if 'tiff' not in r.headers.get('Content-Type',''):raise ValueError('DEM content type is not TIFF')
            b=r.read(n+1)
            if len(b)!=n:raise ValueError('Incorrect DEM received range length')
            self.received+=len(b)
            record={'url':url,'offset':start,'bytes':len(b),'sha256':sha(b),'cacheFile':str(p.relative_to(self.data)),'remoteObjectBytes':int(m[3])}
            self.range_records.append(record);self.range_index[key]=record
        atomic(p,b)
        write_json(self.data/'S6-range-receipt.json',{'receivedBytes':self.received,'budgetBytes':self.budget,'ranges':self.range_records,'notes':self.notes})
        return b
    def build_samples(self,boundary,segments):
        import rasterio
        from rasterio.abc import FileContainer
        from rasterio.windows import Window
        from rasterio.enums import Resampling
        owner=self
        class Container(FileContainer):
            def open(self,path,mode='rb',**kw):return RangeFile(owner,path,self.size(path))
            def isfile(self,path):return path.endswith('.tif')
            def isdir(self,path):return False
            def ls(self,path):return []
            def mtime(self,path):return 0
            def rm(self,path):raise PermissionError('Read only')
            def size(self,path):
                if not path.endswith('.tif'):raise FileNotFoundError(path)
                if path in sizes:return sizes[path]
                for record in owner.range_records:
                    if record['url']==path:sizes[path]=record['remoteObjectBytes'];return sizes[path]
                if owner.acq.offline:raise FileNotFoundError('Offline DEM object size unavailable')
                # HEAD transfers no body and provides only object length, never a fake whole-object hash.
                with owner.acq.opener.open(urllib.request.Request(path,method='HEAD'),timeout=30) as r:
                    sizes[path]=int(r.headers['Content-Length']);return sizes[path]
        sizes={};container=Container()
        root=ET.fromstring((self.data/'S6-index.vrt').read_bytes());gt=[float(x) for x in root.findtext('GeoTransform').split(',')]
        points={}
        for seg in segments:
            for x,y in seg['samples']:
                key=f'{round(x/30)*30},{round(y/30)*30}';points[key]=(round(x/30)*30,round(y/30)*30)
        todo={k:p for k,p in points.items() if boundary.covers(Point(p))}
        print(f'DEM bounded corridor cells: {len(todo)}; byte ceiling {self.budget}',flush=True)
        for c in root.findall('.//ComplexSource'):
            name=c.findtext('SourceFilename')
            if not re.fullmatch(r'be_NYC_\d{3}\.tif',name or ''):raise ValueError('Untrusted VRT external reference')
            rect=c.find('DstRect').attrib;x=gt[0]+float(rect['xOff']);y=gt[3]-float(rect['yOff'])
            tile=box(x,y-float(rect['ySize']),x+float(rect['xSize']),y)
            selected=[]
            for k,(mx,my) in todo.items():
                ex,ny=NOAA_CRS.transform(mx/FT,my/FT)
                if tile.covers(Point(ex,ny)):selected.append((k,ex,ny))
            if not selected:continue
            try:
                url=S6_BASE+name
                with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_PAM_ENABLED='NO'):
                    with rasterio.open(url,opener=container) as r:
                        header={'url':url,'crs':str(r.crs),'transform':list(r.transform),'nodata':r.nodata,'width':r.width,'height':r.height,'units':r.units,'overviews':r.overviews(1)}
                        self.headers.append(header)
                        if not r.crs or r.crs.to_epsg()!=6539:raise ValueError('DEM header CRS differs from official6539')
                        # Block-sorted samples avoid downloading the same TIFF blocks repeatedly.
                        ordered=sorted(selected,key=lambda q:(int(r.index(q[1],q[2])[0])//512,int(r.index(q[1],q[2])[1])//512,q[0]))
                        for k,ex,ny in ordered:
                            row,col=r.index(ex,ny)
                            span=30./FT
                            val=r.read(1,window=Window(col-span/2,row-span/2,span,span),out_shape=(1,1),resampling=Resampling.average,masked=True)
                            if val.size and not np.ma.is_masked(val[0,0]) and math.isfinite(float(val[0,0])):
                                self.samples[k]=round(float(val[0,0])*FT,4)
                            else:self.samples[k]=None
                print(f'DEM {name}: cells {len(selected)}; received {self.received}',flush=True)
            except Exception as e:
                self.notes.append(name+': '+str(e)+';'+getattr(self,'last_range_error','source/read error;no substitute'));print('DEM degraded:',self.notes[-1],flush=True)
                if self.received>=self.budget or 'budget' in str(e):break
        self.notes.append('30m footprint averaged source-reference samples along S1 corridor using existing raster overviews;no borough native-resolution mosaic. Nodata/missing remains null; flat display does not imply measured zero ground. Bare earth may be underwater bathymetry.')
        write_json(self.cache,{'samples':self.samples,'notes':self.notes,'headers':self.headers})
        write_json(self.cache.with_suffix('.sha256.json'),{'sha256':sha(self.cache.read_bytes()),'inputsSha256':self.input_fingerprint(),'bytes':self.cache.stat().st_size,'sourceRanges':'S6-range-receipt.json'})
        write_json(self.data/'S6-range-receipt.json',{'receivedBytes':self.received,'budgetBytes':self.budget,'ranges':self.range_records,'notes':self.notes})
    def ground(self,x,y):
        key=f'{round(x/30)*30},{round(y/30)*30}';value=self.samples.get(key)
        if value is None:self.missing_query_cells.add(key)
        return value
    @property
    def complete(self):return bool(self.samples) and all(v is not None for v in self.samples.values())

class GLB:
    """Small deterministic glTF2 writer; independent reload uses trimesh."""
    def __init__(self,origin):
        self.origin=origin;self.blob=bytearray();self.views=[];self.accessors=[];self.meshes=[];self.nodes=[];self.materials=[];self.mat={};self.vertices=[];self.ids=[];self.max_quantization_residual_m=0.
        self.groups={}
        for group in ['tracks','routes','stations','entrances','ground','buildings','secondary']:
            self.groups[group]=len(self.nodes);self.nodes.append({'name':group+'/','children':[],'extras':{'schematic':True,'enabled':group not in ['buildings','secondary']}})
    def add_array(self,a,component,typ,target=None):
        while len(self.blob)%4:self.blob.append(0)
        offset=len(self.blob);b=a.tobytes();self.blob.extend(b);v={'buffer':0,'byteOffset':offset,'byteLength':len(b)}
        if target:v['target']=target
        self.views.append(v);acc={'bufferView':len(self.views)-1,'componentType':component,'count':len(a),'type':typ}
        if typ=='VEC3':acc.update({'min':a.min(axis=0).tolist(),'max':a.max(axis=0).tolist()})
        self.accessors.append(acc);return len(self.accessors)-1
    def material(self,color):
        if color not in self.mat:
            rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
            self.mat[color]=len(self.materials);self.materials.append({'name':color,'pbrMetallicRoughness':{'baseColorFactor':rgb+[1.0],'metallicFactor':0.0,'roughnessFactor':.85},'doubleSided':True})
        return self.mat[color]
    def add(self,name,group,vertices,faces,refs,extras,color='#407CB3'):
        if not vertices or not faces:return
        xyz=np.asarray(vertices,dtype=np.float64)
        if not np.isfinite(xyz).all():raise ValueError('Nonfinite mesh '+name)
        # Input XYZ east,north,canonical height; GLB east,up,south, meters.
        original_xy=xyz[:,:2].copy()
        xyz=np.column_stack((xyz[:,0]-self.origin[0],xyz[:,2],self.origin[1]-xyz[:,1])).astype('<f4')
        recovered=np.column_stack((xyz[:,0].astype(float)+self.origin[0],self.origin[1]-xyz[:,2].astype(float)))
        self.max_quantization_residual_m=max(self.max_quantization_residual_m,float(np.linalg.norm(recovered-original_xy,axis=1).max()))
        f=np.asarray(faces,dtype='<u4')
        if f.max()>=len(xyz):raise ValueError('Invalid mesh index')
        pos=self.add_array(xyz,5126,'VEC3',34962);idx=self.add_array(f.ravel(),5125,'SCALAR',34963);ref=self.add_array(np.asarray(refs,dtype='<f4'),5126,'SCALAR',34962)
        mesh={'name':name,'primitives':[{'attributes':{'POSITION':pos,'_REFERENCE_ELEVATION':ref},'indices':idx,'material':self.material(color)}],'extras':extras}
        mi=len(self.meshes);self.meshes.append(mesh);ni=len(self.nodes);self.nodes.append({'name':name,'mesh':mi,'extras':extras});self.nodes[self.groups[group]]['children'].append(ni)
        self.vertices.append(xyz);self.ids.append(name)
    def export(self):
        for node in self.nodes:
            if node.get('children')==[]:node.pop('children')
        tree={'asset':{'version':'2.0','generator':'Swale bounded schematic builder v1','extras':{'modelId':MODEL_ID,'schematic':True}},'scene':0,'scenes':[{'nodes':list(self.groups.values())}], 'nodes':self.nodes,'meshes':self.meshes,'materials':self.materials,'buffers':[{'byteLength':len(self.blob)}],'bufferViews':self.views,'accessors':self.accessors,'extras':{'originProjectedMeters':self.origin,'processingCRS':'EPSG:2263','axes':'+X east,+Y up,+Z south','verticalDatum':'NAVD88 when sampled; null ground uses labelled flat-reference preview','exaggeration':'canonical1x; viewer default2x around _REFERENCE_ELEVATION'}}
        jb=canonical(tree);jb+=b' '*((-len(jb))%4);bb=bytes(self.blob)+b'\0'*((-len(self.blob))%4)
        return struct.pack('<III',0x46546c67,2,28+len(jb)+len(bb))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(bb),0x004e4942)+bb

# Cross-section sweep with planar source XY retained. Mesh widths are assumptions,
# clipped at final polygon footprint, so generated offsets never widen Brooklyn.
def prism(poly,bottom,top,ground):
    vertices=[];faces=[];refs=[]
    for p in get_parts(poly,'Polygon'):
        # Triangulate and retain only interior triangles, including holes.
        for tri in triangulate(p):
            if not p.covers(tri):continue
            coords=list(tri.exterior.coords)[:3];base=len(vertices)
            for zfn in [bottom,top]:
                for x,y in coords:
                    g=ground(x,y);vertices.append([x,y,zfn(x,y)]);refs.append(0. if g is None else g)
            faces.extend([[base,base+2,base+1],[base+3,base+4,base+5]])
        for ring in [p.exterior,*p.interiors]:
            coords=list(ring.coords)
            for (x,y),(u,v) in zip(coords,coords[1:]):
                base=len(vertices)
                for a,b,zfn in [(x,y,bottom),(u,v,bottom),(u,v,top),(x,y,top)]:
                    g=ground(a,b);vertices.append([a,b,zfn(a,b)]);refs.append(0. if g is None else g)
                faces.extend([[base,base+1,base+2],[base,base+2,base+3]])
    return vertices,faces,refs

def sample_line(line,spacing=20.):
    ds=np.linspace(0,line.length,max(2,math.ceil(line.length/spacing)+1));return [(line.interpolate(float(d)).x,line.interpolate(float(d)).y) for d in ds]

def load_inputs(acq):
    D=acq.data
    bfeatures=json.loads((D/'S5-boroughs.geojson').read_text())['features'];bs=[f for f in bfeatures if str(f['properties'].get('borocode'))=='3' and f['properties'].get('boroname')=='Brooklyn']
    if len(bs)!=1:raise ValueError('S5 Brooklyn schema/count changed')
    boundary=project_geometry(shape(bs[0]['geometry']));repairs=[]
    if not boundary.is_valid:boundary=make_valid(boundary);repairs.append('S5 make_valid repair applied')
    ids=json.loads((D/'S1-ids.json').read_text())['objectIds'];features=[f for p in sorted(D.glob('S1-features-*.geojson')) for f in json.loads(p.read_text())['features']]
    if sorted(f['properties']['OBJECTID'] for f in features)!=sorted(ids):raise ValueError('S1 cached IDs incomplete/duplicated')
    segments=[]
    for f in sorted(features,key=lambda f:(f['properties']['SEGMENTID'],f['properties']['OBJECTID'])):
        p=f['properties']
        if p.get('RAIL_TYPE')!='1':continue
        geom=project_geometry(shape(f['geometry']))
        for partno,line in enumerate(get_parts(geom,'LineString')):
            if line.length==0 or not line.intersects(boundary):continue
            # Interpolation is measured on the ORIGINAL segment BEFORE clipping.
            a,b=level(p.get('FROM_LEVEL_CODE')),level(p.get('TO_LEVEL_CODE'));fallback=False
            if a is None:a=FALLBACK.get(p['ROW_TYPE']);fallback=True
            if b is None:b=FALLBACK.get(p['ROW_TYPE']);fallback=True
            unknown=a is None or b is None
            if a is None:a=0.
            if b is None:b=0.
            for clipno,clipped in enumerate(get_parts(line.intersection(boundary),'LineString')):
                if clipped.length<.05:continue
                seg={'id':f"seg_{p['SEGMENTID']}_{p['ROW_TYPE']}_{partno}_{clipno}",'sourceId':str(p['SEGMENTID']),'objectId':p['OBJECTID'],'row':p['ROW_TYPE'],'properties':p,'original':line,'line':clipped,'originalLengthM':line.length,'lengthM':clipped.length,'levelA':a,'levelB':b,'fallback':fallback,'unknown':unknown,'samples':sample_line(clipped),'sourceIds':['S1:SEGMENTID='+str(p['SEGMENTID'])]}
                segments.append(seg)
    stations=list(csv.DictReader((D/'S3-stations.csv').open())) if (D/'S3-stations.csv').exists() else []
    entrances=json.loads((D/'S4-entrances.geojson').read_text())['features'] if (D/'S4-entrances.geojson').exists() else []
    return boundary,segments,stations,entrances,repairs

def source_metadata(acq):
    sources={k:dict(v,id=k,vintage=None) for k,v in SOURCES.items()}
    D=acq.data
    sources['S1']['vintage']='metadata2026-01-27; service dataLastEditDate='+str(json.loads((D/'S1-layer.json').read_text()).get('editingInfo',{}).get('dataLastEditDate'))
    sources['S1']['schemaAdaptations']=['RAIL_TYPE service domain is unrelated rail domain (AMTRAK/LIRR); publisher SubwayLines metadata explicitly defines1=Subway2=Staten Island Railway and governs selection.','FROM/TO level fields lack service domains; decoded from publisher2026-01-27 metadata.','CREATED_BY/MODIFIED_BY excluded from every distributed asset.','GeoJSON page flags absent; independent object-ID set5805 reconciled against all ordered pages.']
    for k in ['S3','S4','S5']:
        if (D/(k+'-metadata.json')).exists():
            m=json.loads((D/(k+'-metadata.json')).read_text());tm=m.get('rowsUpdatedAt');sources[k]['vintage']=dt.datetime.fromtimestamp(tm,dt.UTC).isoformat() if tm else None
            sources[k]['schema']=[c.get('fieldName') for c in m.get('columns',[])];sources[k]['publisherMetadata']=m.get('metadata',{}).get('custom_fields',{})
    sources['S4']['edition']='2024 static edition; rows upload2025-12-05 is not a new survey date'
    sources['S6']['vintage']='2017 acquisition; published NOAA9307 edition; actual range header last-modified is not survey time'
    zpath=D/'S2-gtfs.zip'
    if not zpath.exists():zpath=D/'S2-supplemented.zip'
    feed={}
    if zpath.exists():
        with zipfile.ZipFile(zpath) as z:
            safe_archive(z)
            if 'feed_info.txt' in z.namelist():feed=list(csv.DictReader(io.StringIO(z.read('feed_info.txt').decode('utf-8-sig'))))[0]
        sources['S2'].update(vintage=feed.get('feed_version'),feedInfo=feed,feedType='regular URL' if zpath.name=='S2-gtfs.zip' else 'listed supplemented fallback',actualCachedFile=zpath.name)
    return sources,feed

class Builder:
    def __init__(self,args,acq):
        self.args=args;self.acq=acq;self.params=dict(PARAMS,level_height_m=args.level_height)
        self.boundary,self.segments,self.station_rows,self.entrance_rows,self.repairs=load_inputs(acq)
        self.tree=STRtree([s['line'] for s in self.segments]);self.sources,self.feed=source_metadata(acq)
        domain=next((f.get('domain') for f in json.loads((acq.data/'S1-layer.json').read_text())['fields'] if f['name']=='ROUTE'),{}) or {}
        self.route_domain={str(c['code']):set(c['name'].split('-')) for c in domain.get('codedValues',[])}
        self.render_boundary=self.boundary.buffer(-.02) #20mm inward quantization margin,never expandsB
        self.route_aliases={};self.route_allowed_lines=collections.defaultdict(set)
        for st in self.station_rows:
            pp=project_geometry(Point(float(st['gtfs_longitude']),float(st['gtfs_latitude'])))
            for i in self.tree.query(pp.buffer(25.)):
                sg=self.segments[int(i)]
                if sg['line'].distance(pp)>25:continue
                source_routes=self.route_domain.get(str(sg['properties'].get('ROUTE')),set())
                if source_routes.intersection(st['daytime_routes'].split()) or self.line_context(st['line'],sg['properties'].get('LINE','')):
                    for rid in st['daytime_routes'].split():self.route_allowed_lines[rid].add(sg['properties'].get('LINE',''))
        self.origin=[round(v/100)*100 for v in self.boundary.centroid.coords[0]]
        self.dem=DEM(acq,self.boundary,self.segments,args.dem_budget_mb,args.dem)
        self.glb=GLB(self.origin);self.station_inventory=[];self.chunks={};self.entrance_inventory=[];self.route_coverage=[];self.gradients=[];self.topology=[];self.spatial_chunks=[]
        self.reference_policy='Surface-relative display; flat map reference0m; canonical S6 NAVD88 retained separately when sampled; unknown/nodata ground uses labelled G=0 preview.'
        self.full=not bool(args.stations)
        self.chunk_transform_residuals={};self.mesh_ground_null=0;self.primitive_count=0;self.route_colors={};self.color_fallbacks=[]
    def l(self,s,x,y):
        d=s['original'].project(Point(x,y));t=max(0.,min(1.,d/s['originalLengthM']))
        return (s['levelA']+(s['levelB']-s['levelA'])*t)*self.args.level_height
    def G(self,x,y):
        g=self.dem.ground(x,y)
        return 0. if g is None else g
    def Z(self,s,x,y):return self.G(x,y)+self.l(s,x,y)
    @staticmethod
    def line_context(a,b):
        stop={'av','ave','avenue','st','street','line','the','and','ind','irt','bmt'}
        aa=set(re.findall(r'[a-z0-9]+',a.lower()))-stop;bb=set(re.findall(r'[a-z0-9]+',b.lower()))-stop
        common=aa&bb
        return bool(len(common)>=2 or any(len(t)>=5 for t in common))
    def resolve_route_id(self,label,source_line):
        if label in self.route_colors:return label
        candidates=[rid for rid,short in self.route_aliases.items() if short==label]
        stop={'av','ave','avenue','st','street','line','the','and','ind','irt','bmt','shuttle','park'}
        context=set(re.findall(r'[a-z0-9]+',source_line.lower()))-stop
        scores=[(len(context.intersection(set(re.findall(r'[a-z0-9]+',self.route_long_names.get(rid,'').lower()))-stop)),rid) for rid in candidates]
        scores.sort(reverse=True)
        if not scores or scores[0][0]==0 or len(scores)>1 and scores[0][0]==scores[1][0]:return None
        return scores[0][1]
    def nearest(self,p,routes=None,structure=None):
        cand=self.tree.query(p.buffer(100.))
        if not len(cand):return None,None
        candidates=[]
        known={'Subway':{'1','8'},'Elevated':{'2','7'},'Viaduct':{'2','7'},'Open Cut':{'5'},'At Grade':{'3'},'Embankment':{'6'}}
        for i in cand:
            s=self.segments[int(i)];dist=s['line'].distance(p)
            if structure in known and s['row'] not in known[structure]:continue
            source_routes=self.route_domain.get(str(s['properties'].get('ROUTE')),set())
            aliases=set(routes or [])|{getattr(self,'route_aliases',{}).get(r,r) for r in routes or []}
            allowed=any(s['properties'].get('LINE','') in getattr(self,'route_allowed_lines',{}).get(r,set()) for r in aliases)
            if routes and source_routes and not source_routes.intersection(aliases) and not allowed:continue
            candidates.append((dist,s['id'],s))
        if not candidates:return None,None
        distance,_,s=min(candidates,key=lambda q:(q[0],q[1]));return s,distance
    def extras(self,kind,sourceIds,assumption,**more):return dict(kind=kind,sourceIds=sourceIds,assumption=assumption,confidence='schematic_unvalidated',association='inferred where geometry is generated;source IDs retain authoritative input identities',schematic=True,referencePolicy=self.reference_policy,**more)
    def mesh_prism(self,name,group,poly,bottom,top,extras,color='#407CB3'):
        clipped=poly.intersection(self.render_boundary)
        v,f,r=prism(clipped,bottom,top,self.dem.ground)
        missing=sum(self.dem.ground(x,y) is None for x,y,z in v)
        extras.update(referenceSurfaceCoverage='mixed_flat_reference_fallback' if missing else 'source_sampled',unsampledGroundVertexCount=missing,groundVertexCount=len(v))
        self.glb.add(name,group,v,f,r,extras,color)
    def polygon_primitive(self,id,kind,poly,z,height,station,sourceIds,assumption,**more):
        primitives=[]
        for i,p in enumerate(get_parts(poly.intersection(self.render_boundary),'Polygon')):
            for x,y in p.exterior.coords:
                lon,lat=unproject(x,y);ex,ny=TO_FT.transform(lon,lat);residual=math.hypot(ex*FT-x,ny*FT-y)
                self.chunk_transform_residuals[station]=max(self.chunk_transform_residuals.get(station,0.),residual)
            primitives.append(dict(id=id+f'_{i}',kind=kind,stationId=station,sourceIds=sourceIds,assumption=assumption,confidence='schematic_unvalidated',polygon=[llz(x,y,z(x,y) if callable(z) else z) for x,y in p.exterior.coords],height=height,zReference='base',**more))
        return primitives
    def tracks(self):
        selected=[] if self.full else [project_geometry(Point(float(s['gtfs_longitude']),float(s['gtfs_latitude']))) for s in self.station_rows if s['gtfs_stop_id'] in self.args.stations]
        for s in self.segments:
            if not self.full and not any(s['line'].distance(p)<250 for p in selected):continue
            row=s['row'];line=s['line'];s['relative']=[self.l(s,x,y) for x,y in s['samples']]
            if row in ['1','8']:width,height,bottom=8.,6.,-3.
            elif row in ['2','7']:width,height,bottom=8.,1.5,-1.5
            elif row=='6':width,height,bottom=10.,max(1.,abs(sum(s['relative'])/len(s['relative']))),-max(1.,abs(sum(s['relative'])/len(s['relative'])))
            elif row=='5':width,height,bottom=8.,1.5,-.75
            elif row=='3':width,height,bottom=8.,.3,-.3
            else:width,height,bottom=4.,.2,-.1
            poly=line.buffer(width/2,cap_style='flat',join_style='mitre').intersection(self.boundary)
            assumption=f'{ROW.get(row,"Unknown")} representative single alignment; generated {width:g}m width/{height:g}m height; s={self.args.level_height:g}m per relative source level. No surveyed individual rails/interior/depth.'
            if row=='5':
                # Two generated trench walls, not a solid surveyed excavation.
                for side,off in [('left',3.5),('right',-3.5)]:
                    wall=line.offset_curve(off,join_style='mitre').buffer(.5,cap_style='flat')
                    self.mesh_prism(s['id']+'_'+side,'tracks',wall,lambda x,y:min(self.Z(s,x,y),self.G(x,y)),lambda x,y:max(self.Z(s,x,y),self.G(x,y))+.1,self.extras('structure',s['sourceIds'],'Generated schematic open-cut trench wall;1m thick,7m separation;not surveyed excavation or retaining structure.',rowType=row,sourceSegmentId=s['sourceId']))
            else:
                self.mesh_prism(s['id'],'tracks',poly,lambda x,y:self.Z(s,x,y)+bottom,lambda x,y:self.Z(s,x,y)+bottom+height,self.extras('structure',s['sourceIds'],assumption,rowType=row,sourceSegmentId=s['sourceId'],fallbackLevel=s['fallback'],unknownLevel=s['unknown']))
            # Illustrative piers stay in Brooklyn; do not claim a surveyed pier count/location.
            if row in ['2','7']:
                for n,d in enumerate(np.arange(15.,line.length,30.)):
                    p=line.interpolate(float(d));z=self.l(s,p.x,p.y)
                    if z<=0:continue
                    self.mesh_prism(s['id']+f'_pier{n}','tracks',p.buffer(.65,quad_segs=2),lambda x,y:self.G(x,y),lambda x,y:self.Z(s,x,y)-1.5,self.extras('illustrative_pier',s['sourceIds'],'Generated illustrative pier;30m display spacing, not observed structure'))
            self.spatial_chunks.append({'id':s['id'],'sourceIds':s['sourceIds'],'rowType':row,'bounds':list(line.bounds),'lengthM':round(line.length,4),'originalLengthM':round(s['originalLengthM'],4),'fallbackLevel':s['fallback'],'unknownLevel':s['unknown'],'sourceLevelCodes':[s['properties'].get('FROM_LEVEL_CODE'),s['properties'].get('TO_LEVEL_CODE')]})
            for (x,y),(u,v) in zip(s['samples'],s['samples'][1:]):
                d=math.hypot(u-x,v-y);grad=abs(self.Z(s,u,v)-self.Z(s,x,y))/d if d else 0
                if grad>.08:self.gradients.append({'segmentId':s['id'],'gradient':round(grad,7),'from':llz(x,y,self.l(s,x,y)),'to':llz(u,v,self.l(s,u,v)),'reason':'source relative-level transition and/or sampled source reference; calibration disabled; no smoothing across grade classes'})
        # Compatible endpoints only; planar crossings are not graph vertices.
        buckets=collections.defaultdict(list)
        for s in self.segments:
            for end,p in [(0,s['line'].coords[0]),(1,s['line'].coords[-1])]:buckets[(round(p[0],3),round(p[1],3))].append((s,end,self.l(s,*p)))
        for xy,ends in sorted(buckets.items()):
            for i,(a,ae,az) in enumerate(ends):
                for b,be,bz in ends[i+1:]:
                    if abs(az-bz)<.05 and a['row']==b['row']:self.topology.append({'a':a['id'],'aEnd':ae,'b':b['id'],'bEnd':be,'zRelativeM':round(az,5)})
    def station_data(self):
        backend={}
        bp=self.acq.data/'backend-stations.json'
        if bp.exists():
            bj=json.loads(bp.read_text())
            for f in bj.get('features',[]):
                p=f.get('properties',{});gid=p.get('gtfs_stop_id')
                if gid and f.get('id'):backend.setdefault(gid,[]).append(f)
        eligible=[];seen=set();disagreements=[]
        for s in sorted(self.station_rows,key=lambda s:s['gtfs_stop_id']):
            sid=s['gtfs_stop_id'];p=project_geometry(Point(float(s['gtfs_longitude']),float(s['gtfs_latitude'])));pip=self.boundary.covers(p);field=s['borough']=='Bk'
            if field!=pip:disagreements.append({'id':sid,'boroughField':s['borough'],'pointInBrooklyn':pip,'decision':'included semantic record if borough field or point-in-polygon; mesh clipped toB'})
            if not (field or pip):continue
            if sid in seen:raise ValueError('Duplicate S3 canonical GTFS Stop ID '+sid)
            seen.add(sid);eligible.append(sid)
            seg,distance=self.nearest(p,s['daytime_routes'].split(),s['structure'])
            association_conflicts=[];method='S3 known-structure and source-route/physical-line compatible nearest S1;100m maximum'
            if seg is None or distance>25.:
                # Source priority is S1 before the coarser S3.Structure. A near,
                # route/physical-line corroborated S1 is usable with its conflict
                # explicitly retained;it is never relabelled as agreeing withS3.
                fallback=[]
                for i in self.tree.query(p.buffer(25.)):
                    sg=self.segments[int(i)];dd=sg['line'].distance(p)
                    sr=self.route_domain.get(str(sg['properties'].get('ROUTE')),set())
                    if dd<=25 and (sr.intersection(s['daytime_routes'].split()) or self.line_context(s['line'],sg['properties'].get('LINE',''))):fallback.append((dd,sg['id'],sg))
                if fallback:
                    dd,_,candidate=min(fallback,key=lambda x:(x[0],x[1]))
                    if seg is None or dd<distance:
                        seg=candidate;distance=dd;method='Source-priority S1 within25m corroborated by route/physical-line context;S3/S1 disagreement explicitly retained'
                        known={'Subway':{'1','8'},'Elevated':{'2','7'},'Viaduct':{'2','7'},'Open Cut':{'5'},'At Grade':{'3'},'Embankment':{'6'}}
                        if s['structure'] in known and seg['row'] not in known[s['structure']]:association_conflicts.append({'field':'structure','S3':s['structure'],'S1':ROW.get(seg['row'],seg['row']),'decision':'S1 alignment/vertical class has priority;association remains inferred'})
            matched=seg is not None and distance<=100.
            if seg:
                sr=self.route_domain.get(str(seg['properties'].get('ROUTE')),set())
                if sr and not sr.intersection(s['daytime_routes'].split()):association_conflicts.append({'field':'route_context','S3':s['daytime_routes'],'S1Code':seg['properties'].get('ROUTE'),'S1Decoded':sorted(sr),'S1Line':seg['properties'].get('LINE'),'decision':'Close source XY and physical-line context corroborate association;source route attribute preserved,not rewritten'})
            if not matched:seg=None
            sourceIds=['S3:'+sid]+(seg['sourceIds'] if seg else [])
            assumptions=['Schematic illustration; platform150m×10m is generated, not a surveyed footprint, count, or layout.','Source station location retained; render orientation follows compatible nearest S1 representative alignment.','Vertical level is schematic; static geometry is independent of live service.']
            exact=backend.get(sid,[]);bf=exact[0] if len(exact)==1 else None
            item={'id':sid,'gtfsStopId':sid,'name':s['stop_name'],'complexId':s['complex_id'],'routes':s['daytime_routes'].split(),'structure':s['structure'],'position':[float(s['gtfs_longitude']),float(s['gtfs_latitude'])],'detailUrl':'/infrastructure/stations/'+sid+'.json','sourceIds':sourceIds,'assumptions':assumptions,'backendStationId':bf['id'] if bf else None,'relationship':'exact_gtfs_stop_id' if bf else 'unmatched','sourceStationId':s['station_id'],'line':s['line'],'geometryAssociation':{'status':'matched' if seg else 'unresolved','sourceSegmentId':seg['sourceId'] if seg else None,'distanceM':round(distance,3) if distance is not None else None,'method':method,'sourceConflicts':association_conflicts},'sourcePosition':[float(s['gtfs_longitude']),float(s['gtfs_latitude'])],'renderAnchor':unproject(p.x,p.y),'canonicalGroundM':self.dem.ground(p.x,p.y),'canonicalReferenceM':self.Z(seg,p.x,p.y) if seg else None}
            if bf:item['backendPosition']=bf.get('geometry',{}).get('coordinates')
            if seg is None:item['assumptions'].append('No compatible source geometry association available;station is semantic inventory only and no platform or connector has been invented.')
            self.station_inventory.append(item)
            if not self.full and sid not in self.args.stations:continue
            primitives=[]
            if seg:
                line=seg['line'];d=line.project(p);pa=line.interpolate(max(0,d-10));pb=line.interpolate(min(line.length,d+10));angle=math.atan2(pb.y-pa.y,pb.x-pa.x);u=np.array([math.cos(angle),math.sin(angle)]);n=np.array([-u[1],u[0]])
                center=np.array([p.x,p.y]);corners=[center+u*75+n*5,center-u*75+n*5,center-u*75-n*5,center+u*75-n*5];plat=Polygon(corners);rel=self.l(seg,p.x,p.y)
                primitives+=self.polygon_primitive('station_'+sid+'_platform','platform',plat,rel-.6,.6,sid,sourceIds,assumptions[0])
                self.mesh_prism('station_'+sid,'stations',plat,lambda x,y:self.G(x,y)+rel-.6,lambda x,y:self.G(x,y)+rel,self.extras('platform',sourceIds,assumptions[0],stationId=sid,sourcePosition=item['sourcePosition'],complexId=item['complexId']))
                near=self.tree.query(p.buffer(220))
                for j in sorted(map(int,near),key=lambda j:self.segments[j]['id']):
                    sg=self.segments[j]
                    if sg['line'].distance(p)>200:continue
                    # Station-local source segment subset, clipped geometrically to220m.
                    for k,part in enumerate(get_parts(sg['line'].intersection(p.buffer(220,quad_segs=12)),'LineString')):
                        height=6. if sg['row'] in ['1','8'] else 1.5
                        base=(-height/2 if sg['row'] in ['1','8'] else -height)
                        hull=part.buffer(4,cap_style='flat',join_style='mitre')
                        primitives+=self.polygon_primitive(sg['id']+f'_local{k}','structure',hull,lambda x,y:self.l(sg,x,y)+base,height,sid,sg['sourceIds'],f'{ROW.get(sg["row"],"Unknown")} schematic envelope; generated8m width and{height}m height; source relative level, not measured depth.',rowType=sg['row'])
                        if sg['row'] in ['2','7']:
                            for pn,pd in enumerate(np.arange(15.,part.length,30.)):
                                pier=part.interpolate(float(pd));top=self.l(sg,pier.x,pier.y)-1.5
                                if top>0:
                                    primitives+=self.polygon_primitive(sg['id']+f'_local{k}_pier{pn}','structure',pier.buffer(.65,quad_segs=2),0.,top,sid,sg['sourceIds'],'Generated illustrative pier;30m schematic display spacing and1.3m width;not surveyed position,count,or engineering member.',rowType=sg['row'])
                        # One path per source route label; route field domain decoded from metadata.
                        route_code=str(sg['properties'].get('ROUTE',''))
                        domain=next((f.get('domain') for f in json.loads((self.acq.data/'S1-layer.json').read_text())['fields'] if f['name']=='ROUTE'),{}) or {}
                        label=next((x['name'] for x in domain.get('codedValues',[]) if str(x['code'])==route_code),'')
                        for rno,rid in enumerate(sorted(set(label.split('-'))&set(item['routes']))):
                            actual_rid=self.resolve_route_id(rid,sg['properties'].get('LINE',''))
                            if actual_rid is None:continue #S2absent or missing route:omit,no fabricated source identity
                            path=[llz(x,y,self.l(sg,x,y)) for x,y in sample_line(part)]
                            primitives.append({'id':sg['id']+'_route'+rid+f'_{k}','kind':'route','stationId':sid,'sourceIds':sg['sourceIds']+['S2:route='+actual_rid],'assumption':'Static schematic route on source representative alignment; not individual rails or live train position.','path':path,'width':2.,'radius':1.,'routeId':actual_rid,'routeLabel':rid,'sourceColor':self.route_colors[actual_rid]})
            metadata={'modelVintage':self.sources['S3']['vintage'],'referencePolicy':self.reference_policy,'schematic':True,'zReference':'polygon base; structure envelope relative centerline±3m, platform surface minus0.6m; entrances map reference0m','canonicalGroundM':item['canonicalGroundM'],'canonicalReferenceM':item['canonicalReferenceM'],'s3Structure':s['structure'],'sourceStationPosition':item['position'],'geometryAssociation':item['geometryAssociation']}
            self.chunks[sid]={'stationId':sid,'primitives':primitives,'metadata':metadata}
        self.station_eligible=eligible;self.station_disagreements=disagreements
        # Preserve every eligible entrance, including unmatched and borough disagreements.
        stationmap={s['id']:s for s in self.station_inventory}
        for f in self.entrance_rows:
            props=f['properties'];coord=f.get('geometry',{}).get('coordinates')
            if not coord:continue
            p=project_geometry(Point(coord[:2]));pip=self.boundary.covers(p);field=props.get('borough') in ['B','Bk','Brooklyn']
            if not(field or pip):continue
            eid=props.get(':id');sid=props.get('gtfs_stop_id');st=stationmap.get(sid)
            # GTFS/complex/station fields must agree, never name-only joining.
            valid=bool(st and str(props.get('complex_id'))==st['complexId'] and str(props.get('station_id'))==st['sourceStationId'])
            entry={'id':eid,'sourceIds':['S4:'+str(eid)],'gtfsStopId':sid,'complexId':props.get('complex_id'),'stationId':props.get('station_id'),'position':coord[:2],'type':props.get('entrance_type'),'entryAllowed':props.get('entry_allowed'),'exitAllowed':props.get('exit_allowed'),'matched':valid,'reason':None if valid else 'S3 GTFS/complex/station relationship absent or inconsistent','pointInBrooklyn':pip,'boroughField':props.get('borough')}
            self.entrance_inventory.append(entry)
            if not valid or not pip or sid not in self.chunks:continue
            id='entrance_'+str(eid);assumption='Authoritative entrance point; generated marker dimensions. Connector is schematic association, not surveyed stairs/corridor, accessible route, or evacuation path.'
            self.chunks[sid]['primitives'].append({'id':id,'kind':'entrance','stationId':sid,'sourceIds':entry['sourceIds'],'assumption':assumption,'position':coord[:2]+[0.],'radius':2.,'entranceType':entry['type'],'entryAllowed':entry['entryAllowed'],'exitAllowed':entry['exitAllowed']})
            platform=next((p for p in self.chunks[sid]['primitives'] if p['kind']=='platform'),None)
            if platform:
                stationp=st['position'];z=platform['polygon'][0][2]+platform['height']
                connector={'id':id+'_connector','kind':'connector','stationId':sid,'sourceIds':entry['sourceIds']+st['sourceIds'],'assumption':assumption,'path':[coord[:2]+[0.],coord[:2]+[z],stationp+[z]],'width':1.3}
                # Clip line horizontally before displaying connector; no outside-borough footprint.
                cp=project_geometry(LineString([coord[:2],stationp]))
                if self.boundary.covers(cp):self.chunks[sid]['primitives'].append(connector)
                else:entry['connectorOmitted']='horizontal association crosses outsideB'
                g=self.G(p.x,p.y)
                self.mesh_prism(id+'_connector','entrances',p.buffer(.6,quad_segs=2),lambda x,y:g+min(0,z),lambda x,y:g+max(0,z)+.1,self.extras('connector',connector['sourceIds'],assumption,stationId=sid))
                if cp.length>.05 and self.boundary.covers(cp):
                    self.mesh_prism(id+'_lateral','entrances',cp.buffer(.6,cap_style='flat'),lambda x,y:self.G(x,y)+z-.1,lambda x,y:self.G(x,y)+z+.1,self.extras('connector',connector['sourceIds'],assumption,stationId=sid))
            else:entry['connectorOmitted']='no compatible station platform geometry'
            self.mesh_prism(id,'entrances',p.buffer(1.,quad_segs=2),lambda x,y:self.G(x,y),lambda x,y:self.G(x,y)+1.,self.extras('entrance',entry['sourceIds'],assumption,stationId=sid,sourcePosition=coord[:2]),'#CAD9E5')
        for st in self.station_inventory:
            es=[e for e in self.entrance_inventory if e['gtfsStopId']==st['id']]
            st['entranceCount']=len(es);st['matchedEntranceCount']=sum(e['matched'] for e in es)
    def load_gtfs(self):
        p=self.acq.data/'S2-gtfs.zip'
        if not p.exists():p=self.acq.data/'S2-supplemented.zip'
        if not p.exists():return None
        with zipfile.ZipFile(p) as z:
            safe_archive(z)
            tables={n:list(csv.DictReader(io.StringIO(z.read(n+'.txt').decode('utf-8-sig')))) for n in ['routes','trips','shapes','stops','calendar','calendar_dates'] if n+'.txt' in z.namelist()}
        self.route_aliases={r['route_id']:r.get('route_short_name',r['route_id']) for r in tables['routes']}
        self.route_long_names={r['route_id']:r.get('route_long_name','') for r in tables['routes']}
        self.route_colors={r['route_id']:'#'+(r['route_color'].upper() if re.fullmatch('[0-9a-fA-F]{6}',r.get('route_color','')) else '808080') for r in tables['routes']}
        self.color_fallbacks=[r['route_id'] for r in tables['routes'] if not re.fullmatch('[0-9a-fA-F]{6}',r.get('route_color',''))]
        return tables
    def routes(self,tables):
        if not tables or not self.full:return
        shapes=collections.defaultdict(list)
        for r in tables['shapes']:shapes[r['shape_id']].append((int(r['shape_pt_sequence']),float(r['shape_pt_lon']),float(r['shape_pt_lat'])))
        assoc=sorted({(r['route_id'],r['shape_id']) for r in tables['trips'] if r.get('shape_id')})
        dedup={};rendered=0
        for rid,sid in assoc:
            rows=sorted(shapes.get(sid,[]));rec={'routeId':rid,'shapeId':sid,'sourceColor':self.route_colors.get(rid,'#808080'),'sourcePointCount':len(rows),'eligible':False,'renderedRuns':0,'unsupportedRuns':[],'matchedMeters':0.,'eligibleMeters':0.}
            if len(rows)<2:rec['reason']='missing shape points';self.route_coverage.append(rec);continue
            line=project_geometry(LineString([(r[1],r[2]) for r in rows]));parts=get_parts(line.intersection(self.boundary),'LineString')
            if not parts:rec['reason']='no Brooklyn intersection';self.route_coverage.append(rec);continue
            rec['eligible']=True;rec['eligibleMeters']=sum(p.length for p in parts)
            for partno,part in enumerate(parts):
                samples=sample_line(part);runs=[];run=[];unmatched=[]
                for x,y in samples:
                    sg,d=self.nearest(Point(x,y),[rid])
                    if sg and d<=25 and not sg['unknown']:
                        if unmatched:
                            rec['unsupportedRuns'].append({'sampleCount':len(unmatched),'lengthM':round(LineString(unmatched).length if len(unmatched)>1 else 0.,3),'reason':'No compatible source alignment within25m; no unsupported connection drawn'});unmatched=[]
                        # Changing incompatible ROW class or disconnected source breaks route runs.
                        if run and run[-1][2]['id']!=sg['id']:
                            prev=run[-1][2];compatible=prev['line'].distance(sg['line'])<.05 and abs(self.l(prev,x,y)-self.l(sg,x,y))<.1
                            if not compatible:runs.append(run);run=[]
                        run.append((x,y,sg))
                    else:
                        if run:runs.append(run);run=[]
                        unmatched.append((x,y))
                if run:runs.append(run)
                if unmatched:rec['unsupportedRuns'].append({'sampleCount':len(unmatched),'lengthM':round(LineString(unmatched).length if len(unmatched)>1 else 0.,3),'reason':'No compatible S1 within25m'})
                for rn,run in enumerate(runs):
                    if len(run)<2:continue
                    coords=[(x,y) for x,y,sg in run];length=LineString(coords).length;rec['matchedMeters']+=length
                    # Deduplicate identical render XY/Z while retaining every route/shape association.
                    effective_offset=(-1 if sorted(self.route_colors).index(rid)%2 else 1)*2.5
                    key=sha(canonical({'xyz':[[round(x,3),round(y,3),round(self.l(sg,x,y),3)] for x,y,sg in run],'offset':effective_offset,'color':self.route_colors.get(rid,'#808080')}))
                    if key in dedup:
                        dedup[key]['associations'].append({'routeId':rid,'shapeId':sid,'sourceColor':self.route_colors.get(rid,'#808080')});rec['renderedRuns']+=1;continue
                    info={'associations':[{'routeId':rid,'shapeId':sid,'sourceColor':self.route_colors.get(rid,'#808080')}],'meshId':f'route_{rid}_{sid}_{partno}_{rn}'};dedup[key]=info
                    # Stable shared-route offset is bounded within source envelope (±2.5m).
                    offset=(-1 if sorted(self.route_colors).index(rid)%2 else 1)*2.5
                    vertices=[];faces=[];refs=[]
                    for i,(x,y,sg) in enumerate(run):
                        before=run[max(0,i-1)];after=run[min(len(run)-1,i+1)];dx,dy=after[0]-before[0],after[1]-before[1];norm=math.hypot(dx,dy) or 1.;nx,ny=-dy/norm,dx/norm
                        ex,nyy=x+nx*offset,y+ny*offset;g=self.G(ex,nyy);z=g+self.l(sg,x,y)
                        for k in range(6):
                            a=k*math.tau/6;vertices.append([ex+nx*math.cos(a),nyy+ny*math.cos(a),z+math.sin(a)]);refs.append(g)
                        if i:
                            for k in range(6):a=(i-1)*6+k;b=(i-1)*6+(k+1)%6;c=i*6+(k+1)%6;d=i*6+k;faces.extend([[a,b,c],[a,c,d]])
                    # Any out-of-B offset vertex is removed through per-face footprint checks.
                    faces=[f for f in faces if self.render_boundary.covers(Polygon([(vertices[i][0],vertices[i][1]) for i in f]))]
                    if faces:
                        used=sorted({i for f in faces for i in f});remap={old:new for new,old in enumerate(used)};vv=[vertices[i] for i in used];rr=[refs[i] for i in used];ff=[[remap[i] for i in f] for f in faces]
                        ex=self.extras('route',['S2:route='+rid,'S2:shape='+sid],'Generated1m route tube with bounded±2.5m schematic shared-route offset; no surveyed rails or live vehicle position.',routeId=rid,shapeId=sid,sourceColor=self.route_colors.get(rid,'#808080'),associations=info['associations'])
                        ex.update(unsampledGroundVertexCount=sum(self.dem.ground(x,y) is None for x,y,z in vv),groundVertexCount=len(vv))
                        ex['referenceSurfaceCoverage']='mixed_flat_reference_fallback' if ex['unsampledGroundVertexCount'] else 'source_sampled'
                        self.glb.add(info['meshId'],'routes',vv,ff,rr,ex,self.route_colors.get(rid,'#808080'));info['extras']=ex;rec['renderedRuns']+=1;rendered+=1
            rec['matchedMeters']=round(rec['matchedMeters'],3);rec['eligibleMeters']=round(rec['eligibleMeters'],3);self.route_coverage.append(rec)
        for info in dedup.values():
            if 'extras' in info:info['extras']['associations']=info['associations']
        self.route_dedup_count=len(dedup)
    def ground_mesh(self):
        # Show sampled corridor cells only. Missing reference surface never becomes an observed0.
        if not self.full:return
        vertices=[];faces=[];refs=[]
        for key,g in sorted(self.dem.samples.items()):
            if g is None:continue
            x,y=map(float,key.split(','));poly=box(x-15,y-15,x+15,y+15).intersection(self.render_boundary)
            for p in get_parts(poly,'Polygon'):
                for tri in triangulate(p):
                    if not p.covers(tri):continue
                    base=len(vertices)
                    for u,v in list(tri.exterior.coords)[:3]:vertices.append([u,v,g]);refs.append(g)
                    faces.append([base,base+1,base+2])
        if faces:self.glb.add('ground/corridor30m','ground',vertices,faces,refs,self.extras('source_reference_surface',['S6'],'30m corridor source-reference cell illustration;averaged footprint and nearest-cell display; bare earth may include bathymetry; not street-grade terrain.'),'#D4DCE2')
    def run(self):
        tables=self.load_gtfs();self.tracks();self.routes(tables);self.station_data();self.ground_mesh()
        output=Path(self.args.output_dir);output.mkdir(parents=True,exist_ok=True)
        glb=self.glb.export();atomic(output/'brooklyn_mta.glb',glb)
        bounds=self.boundary.bounds;manifest={'version':1,'modelId':MODEL_ID,'vintage':self.sources['S3']['vintage'],'referencePolicy':self.reference_policy,'schematic':True,'stations':self.station_inventory,'sources':[{'id':k,'url':s['url'],'vintage':s.get('vintage')} for k,s in self.sources.items()],'bounds':unproject(bounds[0],bounds[1])+unproject(bounds[2],bounds[3]),'coverage':'Static Brooklyn geometry; live backend coverage is a separate narrower inventory.','originProjectedMeters':self.origin,'processingCRS':'EPSG:2263','mapZ':'surface-relative meters;0 is flat display reference; canonical elevations stored separately','resourceCaps':{'chunkBytes':2_000_000,'loadedChunkCount':4,'decodedChunkCacheBytes':8_000_000,'concurrentLoads':2},'stationCount':len(self.station_inventory),'partialBuild':not self.full}
        write_json(output/'index.json',manifest)
        for sid,chunk in sorted(self.chunks.items()):
            b=canonical(chunk)
            if len(b)>2_000_000 or len(chunk['primitives'])>2500:raise ValueError('Station chunk exceeds cap '+sid)
            atomic(output/'stations'/f'{sid}.json',b)
        crosswalk={'modelId':MODEL_ID,'policy':'Exact S3 GTFS Stop ID equals returned backend gtfs_stop_id; opaque backend ID retained verbatim; never name-only/direction stripping. Runtime must validate current inventory and ignore this observed snapshot when unsupported.','stations':[{'modelStationId':s['id'],'gtfsStopId':s['gtfsStopId'],'sourceStationId':s['sourceStationId'],'complexId':s['complexId'],'backendStationId':s['backendStationId'],'relationship':s['relationship'],'sourcePosition':s['sourcePosition'],'backendPosition':s.get('backendPosition'),'entranceIds':[e['id'] for e in self.entrance_inventory if e['gtfsStopId']==s['id']]} for s in self.station_inventory]}
        write_json(output/'identity_crosswalk.json',crosswalk);write_json(output/'spatial_index.json',{'crs':'projected meters from EPSG2263','segments':self.spatial_chunks,'topologyCompatibleEndpoints':self.topology});write_json(output/'route_coverage.json',self.route_coverage);write_json(output/'entrance_inventory.json',self.entrance_inventory)
        atomic(output/'build_brooklyn_mta.py',Path(__file__).read_bytes())
        self.docs(output)
        inputs=[dict(name=n,**{k:v for k,v in r.items() if k not in ['retrievedAt','cacheWrittenAt']}) for n,r in sorted(self.acq.receipts.items())]
        data_manifest={'modelId':MODEL_ID,'sources':self.sources,'inputs':inputs,'params':self.params,'coordinateFrame':{'processingCRS':'EPSG:2263','unitConversionMetersPerUSFoot':FT,'originProjectedMeters':self.origin,'glTF':['east','up','south'],'map':'WGS84 longitude/latitude and relative meters; flat map ground0','vertical':'S6 orthometric NAVD88 US survey feet converted separately; no ellipsoidal-height claim','horizontalApproximation':'EPSG2263 local metric transform; map lng/lat inverse exact to stored9decimal rounding'},'DEM':{'sampleCount':len(self.dem.samples),'validSamples':sum(v is not None for v in self.dem.samples.values()),'missingModelGroundQueryCells':len(self.dem.missing_query_cells),'canonicalFallback':'unsampled/nodata ground isnull inmetadata;G=0 display assumption only','headers':self.dem.headers,'notes':self.dem.notes,'rangeReceipt':'external data/S6-range-receipt.json; actual ranges only, no whole-object hashes'},'repairs':self.repairs,'generatedFootprintQuantizationInsetM':.02,'stationInclusionDisagreements':self.station_disagreements,'optional':{'S7':{'status':'NOT_RUN','reason':'--with-buildings disabled; current Swale basemap buildings preserved'},'S8':{'status':'NOT_RUN','reason':'--with-secondary disabled'}},'calibration':{'A1':{'status':'NOT_RUN','reason':'Official2025 NYSenate/MTA announcement says nearly90ft above ground, no precise platform/rail/reference-surface semantics for26.7m target. No pin applied.','url':'https://www.nysenate.gov/newsroom/press-releases/2025/andrew-gounardes/sen-gounardes-am-simon-mta-announce-elevator-access?page=8'},'A2':{'status':'NOT_RUN','reason':'No supported specific Atlantic Av-Barclays platform/physical-reference semantics for-15.8m. No calibration or residual claimed.'}},'outputs':{'glbBytes':len(glb),'glbSha256':sha(glb),'semanticManifestSha256':sha(canonical(manifest))},'acquisitionReceipt':'external data/acquisition.json (volatile retrieval times separate from deterministic assets)'}
        data_manifest['artifacts']={str(p.relative_to(output)):{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(output.rglob('*')) if p.is_file() and (p.name in ['brooklyn_mta.glb','index.json','identity_crosswalk.json','spatial_index.json','route_coverage.json','entrance_inventory.json','assumptions.md','level_map.csv','README.md','build_brooklyn_mta.py'] or p.parent.name=='stations' or p.suffix in ['.js','.html','.css'])}
        for name in ['S6-derived-ground.json','S6-derived-ground.sha256.json','S6-range-receipt.json']:
            path=self.acq.data/name
            if path.exists():data_manifest['inputs'].append({'name':name,'bytes':path.stat().st_size,'sha256':sha(path.read_bytes()),'type':'derived bounded source-reference sample/cache receipt','source':'S6'})
        rp=self.acq.data/'S6-range-receipt.json'
        if rp.exists():data_manifest['S6ActualRanges']=json.loads(rp.read_text()).get('ranges',[])
        write_json(output/'data_manifest.json',data_manifest)
        qa=self.verify(glb,manifest,data_manifest);write_json(output/'qa_report.json',qa)
        atomic(output/'qa_report.md','# Brooklyn schematic model QA\n\n'+''.join(f"- **{k} {v['status']}** — {v['evidence']}\n" for k,v in qa['checks'].items())+'\nDetailed counts, exceptions and diagnostics are in qa_report.json, route_coverage.json, entrance_inventory.json and data_manifest.json. Browser/integration status belongs to feature evidence; model files cannot establish I11–I14.\n')
        self.docs(output)
        if self.args.publish_dir:
            target=Path(self.args.publish_dir);target.mkdir(parents=True,exist_ok=True)
            for name in ['index.json','identity_crosswalk.json'] :atomic(target/name,(output/name).read_bytes())
            for sid in self.chunks:atomic(target/'stations'/f'{sid}.json',(output/'stations'/f'{sid}.json').read_bytes())
        print(json.dumps({'output':str(output),'stations':len(self.station_inventory),'chunks':len(self.chunks),'segments':len(self.spatial_chunks),'meshes':len(self.glb.meshes),'glbBytes':len(glb),'glbSha256':sha(glb),'semanticManifestSha256':sha(canonical(manifest)),'qa':{k:v['status'] for k,v in qa['checks'].items()}},indent=2),flush=True)
        return qa
    def verify(self,glb,manifest,dm):
        checks={};check=lambda k,status,evidence,**more:checks.update({k:dict(status=status,evidence=evidence,**more)})
        # Use FINAL float32 world-space vertices after all offsets/transforms.
        allv=np.vstack(self.glb.vertices) if self.glb.vertices else np.empty((0,3));xy=np.column_stack((allv[:,0]+self.origin[0],self.origin[1]-allv[:,2]))
        outside=~covers(self.boundary,geometry_points(xy));exact=int(outside.sum());buffered=int((~covers(self.boundary.buffer(50),geometry_points(xy))).sum())
        # Float32 local-frame rounding can place a boundary vertex millimeters out;
        # retain exact diagnostic and strict result, rather than expanding B.
        maxoutside=float(geometry_distance(geometry_points(xy[outside]),self.boundary).max()) if exact else 0.
        check('I1','PASS' if exact==0 else 'FAIL',f'{len(allv)} final vertices; exact outside={exact};50m diagnostic outside={buffered};max outside={maxoutside:.6f}m',exactOutsideVertices=exact,buffer50mOutsideVertices=buffered,maxOutsideM=maxoutside)
        actual={s['id'] for s in manifest['stations']};expected=set(self.station_eligible);missing=sorted(expected-actual);unresolved=[s['id'] for s in manifest['stations'] if s['geometryAssociation']['status']!='matched'];platform_ids={n.get('extras',{}).get('stationId') for n in self.glb.nodes if n.get('extras',{}).get('kind')=='platform'}
        check('I2','PASS' if not missing and self.full and expected<=platform_ids else 'FAIL',f'eligible S3={len(expected)};semantic={len(actual)};platform nodes={len(platform_ids)};missing={missing};unresolved={unresolved}',eligibleIds=sorted(expected),missingIds=missing,unresolvedGeometry=unresolved,pointInPolygonDisagreements=self.station_disagreements)
        violations=[];unknown=[];fallback=[];portals=[];extents=[]
        for s in self.segments:
            if s['unknown']:unknown.append(s['id']);continue
            if s['fallback']:fallback.append(s['id'])
            signs=[self.l(s,x,y) for x,y in s['samples']]
            if min(signs)<=0<=max(signs) and min(signs)!=max(signs):portals.append(s['id']);continue
            if s['row'] in ['1','8'] and (min(signs)>=0 or max(signs)+3>=0):violations.append(s['id'])
            if s['row'] in ['2','7'] and (max(signs)<=0 or min(signs)-1.5<=0):violations.append(s['id'])
            extents.append({'segmentId':s['id'],'rowType':s['row'],'referenceClearanceRangeM':[round(min(signs),4),round(max(signs),4)],'primitiveExtentM':[-3.,3.] if s['row'] in ['1','8'] else [-1.5,0.] if s['row'] in ['2','7'] else None})
        check('I3','PASS' if not violations else 'FAIL',f'Source-level schematic class checks only; violations={len(violations)},unknown={len(unknown)},fallback={len(fallback)}. Ground coverage partial/flat fallback retained; not surveyed depth.',violations=violations,unknown=unknown,fallback=fallback,portals=portals,extentChecks=extents,absoluteGroundStatus='PASS' if self.dem.complete and not self.dem.missing_query_cells else 'NOT_RUN',missingGroundQueryCells=len(self.dem.missing_query_cells),primitiveReference='tunnel centerline; envelope±3m; elevated deck top reference; platform surface reference')
        check('I4','PASS' if not self.gradients else 'FAIL',f'{len(self.gradients)} edge gradients>0.08 after0 constrained smoothing passes;source XY preserved;graph uses exact compatible endpoints only,not planar crossings.',gradients=self.gradients,compatibleEndpointEdges=len(self.topology),smoothingPasses=0)
        check('I5','NOT_RUN','A1/A2 precise physical reference semantics unsupported;model uncalibrated;no approximate context substituted as a numerical pin.',anchors=dm['calibration'])
        import trimesh
        loaded=trimesh.load_scene(io.BytesIO(glb),file_type='glb',process=False)
        independent_ids={name for name in loaded.graph.nodes_geometry}
        finite=bool(np.isfinite(allv).all());zero=sum(not len(g.faces) for g in loaded.geometry.values());names={n['name'] for n in self.glb.nodes if 'mesh' in n};missing_names=sorted(names-independent_ids)
        # independent reader may expose transformed nodes differently; compare names with geometry names too.
        missing_names=[n for n in missing_names if n not in loaded.geometry]
        roundtrips=[]
        for s in self.station_inventory:
            x,y=TO_FT.transform(*s['position']);lon,lat=TO_LL.transform(x,y);roundtrips.append(math.hypot((lon-s['position'][0])*84000,(lat-s['position'][1])*111000))
        check('I6','PASS' if finite and zero==0 and not missing_names else 'FAIL',f'Independent trimesh reload meshes={len(loaded.geometry)};semantic mesh IDs={len(names)};nonfinite={not finite};zero-face={zero};missing semantic IDs={len(missing_names)};coordinate roundtrip max={max(roundtrips,default=0):.9f}m',independentReload='PASS',missingSemanticIds=missing_names,glTFValidator={'status':'NOT_RUN','reason':'Official local validator installed separately;run against final GLB and attach same-hash receipt before claiming this sub-check'},browserLoader={'status':'NOT_RUN','reason':'Root browser checkpoint required'},localFloat32TransformResidualMaxM=self.glb.max_quantization_residual_m,chunkProjectionResidualMaxM=max(self.chunk_transform_residuals.values(),default=0.),chunkProjectionResiduals=self.chunk_transform_residuals,decodedPositionsBytes=int(allv.nbytes),meshCount=len(self.glb.meshes),vertexCount=len(allv),faceCount=sum(len(g.faces) for g in loaded.geometry.values()))
        eligible=[r for r in self.route_coverage if r['eligible']];gaps=[r for r in eligible if r['unsupportedRuns']];omitted=[r for r in eligible if not r['renderedRuns']]
        check('I7','PASS' if self.route_coverage and not omitted and not gaps else 'FAIL' if self.route_coverage else 'NOT_RUN',f'route/shape associations={len(self.route_coverage)};Brooklyn eligible={len(eligible)};with unsupported runs={len(gaps)};no supported runs={len(omitted)};all accounted,never silently dropped;fallback colors={self.color_fallbacks}',eligibleRoutes=sorted({r['routeId'] for r in eligible}),eligibleShapeCount=len({r['shapeId'] for r in eligible}),unsupportedAssociationIds=[r['routeId']+':'+r['shapeId'] for r in gaps],omittedAssociationIds=[r['routeId']+':'+r['shapeId'] for r in omitted],colorFallbackRoutes=self.color_fallbacks,themeRemapping={'status':'NOT_RUN','reason':'In-app test required'})
        provenance=all(n.get('extras',{}).get('sourceIds') and n.get('extras',{}).get('assumption') for n in self.glb.nodes if 'mesh'in n)
        check('I8','PASS' if provenance else 'FAIL',f'{len(dm["inputs"])} cached input receipts;all mesh nodes have source IDs/assumptions={provenance};source edition/CRS/units/terms retained;volatile times external;internal tracking names excluded.')
        unmatched=[e for e in self.entrance_inventory if not e['matched']]
        check('I9','PASS' if self.entrance_inventory else 'NOT_RUN',f'eligible entrances={len(self.entrance_inventory)};validated S3 GTFS+complex+station joins={len(self.entrance_inventory)-len(unmatched)};explicit unmatched={len(unmatched)};generated connectors labelled schematic.',unmatched=unmatched,outsideBoundary=[e['id'] for e in self.entrance_inventory if not e['pointInBrooklyn']])
        check('I10','NOT_RUN','Use --verify to execute independent cached rebuild and compare canonical GLB+semantic index hashes;not inferred from stable IDs.')
        for k in ['I11','I12','I13','I14']:check(k,'NOT_RUN','In-app integration/browser/regression evidence is owned by feature verification;asset builder cannot certify this check.')
        return {'modelId':MODEL_ID,'partialBuild':not self.full,'checks':checks,'counts':{'segments':len(self.spatial_chunks),'segmentsByROW':dict(collections.Counter(s['rowType'] for s in self.spatial_chunks)),'stations':len(self.station_inventory),'stationChunks':len(self.chunks),'entrances':len(self.entrance_inventory),'unmatchedEntrances':len(unmatched),'routeShapeAssociations':len(self.route_coverage),'meshes':len(self.glb.meshes)},'budget':{'glbBytes':len(glb),'limitBytes':50_000_000,'status':'PASS' if len(glb)<=50_000_000 else 'FAIL'},'qualifications':['Schematic model;not surveyed interiors,individual rails,engineering dimensions,navigation or live vehicle position.','Exact-boundary float32 diagnostics and50m diagnostic are separate.','A1/A2 uncalibrated;relative levels are not measured depths.']}
    def docs(self,out):
        atomic(out/'assumptions.md','# Model assumptions\n\n'+''.join(f'- {k}: {v}\n' for k,v in self.params.items())+'\nSource levels map to schematic centerline/platform reference, not measured depth. The tunnel envelope is8m×6m around that reference. Deck top equals the model reference;platform surface equals the model reference. Piers30m apart are illustrations. Platform150m×10m is one illustration per canonical S3 station,not surveyed layout/count. Entrances remain at display0;schematic connectors join exact source relationships only.\n\nCanonical Z=G+s*l+c. c=0: neither A1 nor A2 has sufficiently supported precise physical-reference semantics. G is NOAA2017 bare earth where a bounded30m corridor sample exists,otherwise null with labelled G=0 preview;missing is not measured zero. No boroughwide full-resolution mosaic. Map uses surface-relative flattening;GLB keeps canonical heights with _REFERENCE_ELEVATION per vertex. Display1x–5x default2x exaggerates only(Z-G),never absolute ground.\n\nSource XY is unchanged and no planar crossing is automatically connected.0 smoothing passes preserve original levels;all remaining>0.08 gradients are diagnostic violations. Route matching is bounded25m,breaks incompatible/disconnected source runs,and retains all eligible route/shape IDs with explicit unsupported-run records. No unsupported gap is bridged. Source colors are retained in GLB;Swale uses its own palette. No optional buildings or secondary datasets enabled.\n')
        with (out/'level_map.csv').open('w',newline='') as f:
            w=csv.writer(f);w.writerow(['source_code','relative_level','meaning','provenance'])
            for code in list(range(1,27))+[99]:w.writerow([code,level(code) if level(code)is not None else '', 'not applicable/unknown' if code==99 else 'at grade' if code==13 else 'below grade' if code<13 else 'above grade','S1 publisher Metadata_SubwayLines.md2026-01-27;service fields lack domain'])
        atomic(out/'README.md','# Brooklyn MTA schematic outputs\n\nStatic Brooklyn model;not a surveyed digital twin,engineering model,interior navigation system,live camera,flood simulation or live vehicle position.\n\nGenerated by complete single-file tools/mta-model/build_brooklyn_mta.py. See repository tools/mta-model/README.md for executed build commands and dependency lock. brooklyn_mta.glb is canonical1x;index.json and station chunks are map-relative static geometry and are loaded only on exploration. identity_crosswalk.json keeps exact S3/GTFS/complex/source relationships;backend coverage is separate.\n\nServe this directory with ordinary local HTTP and open index.html for supplementary locally bundled viewer. In-app exploration in Swale remains the primary deliverable.\n\nSources and terms: data_manifest.json. Dimensions/vertical/reference policies: assumptions.md. Every QA check retains PASS/FAIL/NOT_RUN with exceptions in qa_report.json;not all geometric/source limitations pass merely because a model exists.\n')

def parse_args(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data-dir',type=Path,default=Path('./data'));p.add_argument('--output-dir',type=Path,default=Path(__file__).parent/'output');p.add_argument('--offline',action='store_true');p.add_argument('--verify',action='store_true');p.add_argument('--with-buildings',action='store_true');p.add_argument('--with-secondary',action='store_true');p.add_argument('--level-height',type=float,default=6.);p.add_argument('--publish-dir',type=Path);p.add_argument('--stations',nargs='+',help='Checkpoint station IDs only;full borough build remains required');p.add_argument('--dem',action=argparse.BooleanOptionalAction,default=True);p.add_argument('--dem-budget-mb',type=int,default=256)
    args=p.parse_args(argv)
    if not 0<args.level_height<=12:p.error('level height must be0–12m')
    if not 1<=args.dem_budget_mb<=512:p.error('DEM budget must be1–512MB')
    if args.with_buildings or args.with_secondary:p.error('Optional S7/S8 are disabled in this bounded implementation;flags preserved but no optional acquisition executed')
    return args

def main(argv=None):
    args=parse_args(argv);acq=Acquisition(args.data_dir,args.offline);acq.acquire();acq.register_local_snapshot();builder=Builder(args,acq);qa=builder.run()
    if args.verify:
        a=args.output_dir;hashes={n:sha((a/n).read_bytes()) for n in ['brooklyn_mta.glb','index.json']}
        with tempfile.TemporaryDirectory(prefix='swale-model-verify-') as tmp:
            args2=argparse.Namespace(**vars(args));args2.output_dir=Path(tmp);args2.publish_dir=None;args2.offline=True;args2.verify=False
            Builder(args2,Acquisition(args.data_dir,True)).run();other={n:sha((Path(tmp)/n).read_bytes()) for n in hashes}
        ok=hashes==other;qa['checks']['I10']={'status':'PASS' if ok else 'FAIL','evidence':'Two full builds from identical cached inputs/pinned tooling;canonical GLB and semantic index hashes '+('match' if ok else 'differ'),'first':hashes,'second':other};write_json(a/'qa_report.json',qa)
        atomic(a/'qa_report.md','# Brooklyn schematic model QA\n\n'+''.join(f"- **{k} {v['status']}** — {v['evidence']}\n" for k,v in qa['checks'].items()))
        print('Determinism:',qa['checks']['I10']['status'],flush=True)
    return 0

if __name__=='__main__':
    raise SystemExit(main())
