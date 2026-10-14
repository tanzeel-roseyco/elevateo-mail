"""OPS-402 isolated infrastructure checks; run only inside a disposable container."""
import json, os, time, urllib.request, urllib.error, uuid


def request(base, path, token=None, body=None, method='GET', headers=None):
    headers = dict(headers or {})
    if token:
        headers['Authorization'] = 'Bearer ' + token
        headers['apikey'] = os.environ['ANON_KEY']
    if isinstance(body, dict):
        body = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(base + path, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read()
            try:
                value = json.loads(raw)
            except ValueError:
                value = raw
            return response.status, value
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    print('PASS ' + name, flush=True)


auth = 'http://auth:9999'
storage = 'http://storage:5000'
rest = 'http://rest:3000'
admin = os.environ['SERVICE_ROLE_KEY']
password = uuid.uuid4().hex + 'Aa1!'
users = []
bucket = 'ops402-' + uuid.uuid4().hex
try:
    for index in range(2):
        email = 'ops402-' + uuid.uuid4().hex + '@elevateo.invalid'
        status, user = request(auth, '/admin/users', admin,
                               {'email': email, 'password': password, 'email_confirm': True}, 'POST')
        check('Auth create disposable user', status == 200)
        users.append(user['id'])
        status, session = request(auth, '/token?grant_type=password', None,
                                  {'email': email, 'password': password}, 'POST')
        check('Auth password login', status == 200 and bool(session['access_token']))
        if index == 0:
            first = session
        else:
            second = session
    status, _ = request(auth, '/token?grant_type=password', None,
                        {'email': email, 'password': 'wrong'}, 'POST')
    check('Auth wrong password denial', status == 400)
    status, _ = request(auth, '/admin/users', os.environ['FOREIGN_SERVICE_KEY'])
    check('Foreign live credential rejection by test Auth', status == 403 or status == 401)
    status, _ = request(rest, '/', os.environ['ANON_KEY'])
    check('Owning REST credential accepted', status == 200)
    status, _ = request(rest, '/', os.environ['FOREIGN_ANON_KEY'])
    check('Foreign live credential rejection by test REST', status == 401)
    status, _ = request(storage, '/bucket', os.environ['FOREIGN_SERVICE_KEY'])
    check('Foreign live credential rejection by test Storage', status in (400, 401, 403))
    status, _ = request(storage, '/bucket', admin,
                        {'id': bucket, 'name': bucket, 'public': False,
                         'file_size_limit': 32, 'allowed_mime_types': ['text/plain']}, 'POST')
    check('Private bucket created', status == 200)
    path = '/object/' + bucket + '/' + users[0] + '/fixture.txt'
    status, _ = request(storage, path, first['access_token'], b'OPS402-persistent-object',
                        'POST', {'Content-Type': 'text/plain'})
    check('User private upload', status == 200)
    status, value = request(storage, path, first['access_token'])
    check('Owner private read', status == 200 and value == b'OPS402-persistent-object')
    status, _ = request(storage, path, second['access_token'])
    check('Cross-user read denial', status in (400, 403, 404))
    status, _ = request(storage, path)
    check('Anonymous read denial', status in (400, 401, 403, 404))
    status, _ = request(storage, path + '.large', first['access_token'], b'x' * 33,
                        'POST', {'Content-Type': 'text/plain'})
    check('Object size limit', status in (400, 413))
    status, _ = request(storage, path + '.mime', first['access_token'], b'x',
                        'POST', {'Content-Type': 'application/octet-stream'})
    check('Object MIME limit', status in (400, 415))
    status, signed = request(storage, '/object/sign/' + bucket + '/' + users[0] + '/fixture.txt',
                             first['access_token'], {'expiresIn': 1}, 'POST')
    check('Private signed URL issued', status == 200)
    signed_path = signed.get('signedURL', signed.get('signedUrl'))
    status, _ = request(storage, signed_path)
    check('Signed URL read', status == 200)
    time.sleep(3)
    status, _ = request(storage, signed_path)
    check('Signed URL expiry', status in (400, 401, 403))
    status, refreshed = request(auth, '/token?grant_type=refresh_token', None,
                                {'refresh_token': first['refresh_token']}, 'POST')
    check('Auth refresh', status == 200 and bool(refreshed['access_token']))
    status, _ = request(auth, '/logout?scope=global', refreshed['access_token'], method='POST')
    check('Auth revoke', status == 204)
    status, _ = request(auth, '/token?grant_type=refresh_token', None,
                        {'refresh_token': refreshed['refresh_token']}, 'POST')
    check('Revoked refresh denial', status == 400)
    status, _ = request(storage, '/object/' + bucket, second['access_token'],
                        {'prefixes': [users[0] + '/fixture.txt']}, 'DELETE')
    status, _ = request(storage, path, first['access_token'])
    check('Cross-user delete preserves object', status == 200)
    status, _ = request(storage, '/object/' + bucket, first['access_token'],
                        {'prefixes': [users[0] + '/fixture.txt']}, 'DELETE')
    check('Owner private delete', status == 200)
    status, _ = request(storage, path, first['access_token'])
    check('Deleted object absent', status in (400, 404))
finally:
    # Attempt every exact deletion even when an earlier transport request fails.
    from fixture_cleanup import cleanup_fixtures
    cleanup_fixtures(request, auth, storage, admin, bucket, users)
