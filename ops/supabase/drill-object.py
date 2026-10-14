"""Exact persistent backup fixture, invoked inside containers only."""
import os,sys,urllib.request,urllib.error,json
base='http://storage:5000'
headers={'Authorization':'Bearer '+os.environ['SERVICE_ROLE_KEY'],'Content-Type':'application/json'}
def req(path,body=None,method='GET',content='application/json'):
    h=dict(headers);h['Content-Type']=content
    data=json.dumps(body).encode() if isinstance(body,dict) else body
    with urllib.request.urlopen(urllib.request.Request(base+path,data=data,headers=h,method=method),timeout=20) as r:
        return r.read()
if sys.argv[1]=='create':
    req('/bucket',{'id':'ops402-backup','name':'ops402-backup','public':False},'POST')
    req('/object/ops402-backup/marker.txt',b'paired-backup-marker','POST','text/plain')
elif sys.argv[1]=='verify':
    assert req('/object/ops402-backup/marker.txt')==b'paired-backup-marker'
    print('PASS object restore/persistence marker')
elif sys.argv[1]=='cleanup':
    for path, body in [('/object/ops402-backup', {'prefixes':['marker.txt']}),
                       ('/bucket/ops402-backup', None)]:
        try:
            req(path, body, 'DELETE')
        except urllib.error.HTTPError as error:
            try:
                detail=json.loads(error.read())
            except ValueError:
                detail={}
            absent=error.code==404 or (error.code==400 and str(detail.get('statusCode'))=='404' and detail.get('error') in ('not_found','Bucket not found'))
            if not absent:
                raise
else:
    raise ValueError('invalid fixture phase')
