"""Fault injection proves one transport failure does not skip later deletions."""
from fixture_cleanup import cleanup_fixtures
calls=[]
def fail_first(*args):
    calls.append(args[1])
    if len(calls)==1:
        raise TimeoutError('injected transport failure')
    return 200, {}
try:
    cleanup_fixtures(fail_first,'auth','storage','private','fixture',['user-a','user-b'])
except RuntimeError:
    assert calls == ['/bucket/fixture/empty','/bucket/fixture','/admin/users/user-a','/admin/users/user-b']
    print('PASS transport failure attempts every exact cleanup and reports failure')
else:
    raise AssertionError('cleanup failure hidden')
