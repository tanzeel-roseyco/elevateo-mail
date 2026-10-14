"""Both owning-key acceptance and foreign-key rejection on the live stack."""
import os, urllib.request, urllib.error
for base,path,own,foreign in [('http://auth:9999','/admin/users','SERVICE_ROLE_KEY','FOREIGN_SERVICE_KEY'),
                              ('http://rest:3000','/','ANON_KEY','FOREIGN_ANON_KEY'),
                              ('http://storage:5000','/bucket','SERVICE_ROLE_KEY','FOREIGN_SERVICE_KEY')]:
    for key,expected in [(own,True),(foreign,False)]:
        req=urllib.request.Request(base+path,headers={'Authorization':'Bearer '+os.environ[key]})
        try:
            with urllib.request.urlopen(req,timeout=20) as response:
                assert expected and response.status==200
        except urllib.error.HTTPError as error:
            assert not expected and error.code in (400,401,403)
    print('PASS owning key accepted and test key rejected by live '+base.split('//')[1].split(':')[0])
