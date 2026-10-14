"""Attempt each exact fixture removal; failures remain visible after all attempts."""
def cleanup_fixtures(request, auth, storage, admin, bucket, users):
    operations = []
    if bucket:
        operations.extend([(storage, '/bucket/' + bucket + '/empty', {}, 'POST'),
                           (storage, '/bucket/' + bucket, None, 'DELETE')])
    operations.extend((auth, '/admin/users/' + user, None, 'DELETE') for user in users)
    failures = 0
    for base, path, body, method in operations:
        try:
            status, _ = request(base, path, admin, body, method)
            failures += status != 200
        except Exception:
            # No URLs, tokens or private response bodies in diagnostic output.
            failures += 1
    if failures:
        raise RuntimeError('Exact fixture cleanup failed: ' + str(failures))
    print('PASS cleanup exact fixtures', flush=True)
