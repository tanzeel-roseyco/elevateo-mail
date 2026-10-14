"""Disposable actual Rails migration/psql proof; not full application acceptance."""
from __future__ import annotations
import base64, json, os, pathlib, secrets, signal, socket, sys, time, uuid
root=pathlib.Path(sys.argv[1]).resolve()
evidence=pathlib.Path(sys.argv[2]).resolve(); evidence.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(root/'ops/tests/be02'))
from docker_task import Task
from cleanup import cleanup
from run import source_hashes
values={key:secrets.token_hex(32) for key in ('POSTGRES_PASSWORD','MIGRATOR_DB_PASSWORD','API_DB_PASSWORD','WORKER_DB_PASSWORD','SECRET_KEY_BASE','BE02_FIXTURE_SIGNING_SECRET')}
values['ELEVATEO_SESSION_KEY_BASE64']=base64.b64encode(secrets.token_bytes(32)).decode()
project='be02-'+uuid.uuid4().hex
task=Task(root,evidence,project,'default',values)
env={**values,'BE02_SOURCE':str(root),'BE02_PROJECT':project,'BE02_SERVER_IMAGE':task.image}
original=None
boot=['run','--rm','--no-deps','bootstrap']
rail=['run','--rm','--no-deps','migrate','bundle','exec','rails']
version='20261013000004'
results=[]; failed=''; clean=False; docker_armed=False; secret_owned=False

def interruption(signum: int, _frame: object) -> None:
    raise RuntimeError('supplement interrupted '+str(signum))
signal.signal(signal.SIGTERM,interruption);signal.signal(signal.SIGINT,interruption)

def passed(name: str) -> None:
    results.append(name); print('PASS '+name,flush=True)

def sql(name: str, statement: str) -> str:
    return task.compose(name,boot+['-At','-c',statement],45).strip()

def expect_failure(name: str, args: list[str], message: str) -> None:
    sequence=task.sequence+1
    try:
        task.compose(name,args,90)
    except RuntimeError:
        log=evidence/f'{sequence:03d}-{name}.log'
        content=log.read_text() if log.exists() else ''
        if message not in content or '\nexit=0 ' in content:raise
        passed(name)
    else:raise AssertionError(name+' unexpectedly succeeded')

def probe() -> str:
    return sql('namespace-probe',"SELECT n.oid::text||':'||coalesce(n.nspacl::text,'NULL') FROM pg_namespace n WHERE nspname='app_drafts_private'; SELECT value FROM app_drafts_private.ops402_namespace_probe;")

def bookkeeping(expected: str) -> None:
    actual=sql('schema-migrations-probe',"SELECT count(*) FROM app_meta.schema_migrations WHERE version='"+version+"'")
    if actual!=expected:raise AssertionError('schema_migrations mismatch')

try:
    if socket.gethostname().split('.')[0]!='Ubuntu-noble-latest-amd64-base':raise RuntimeError('unexpected fleet host')
    if any(os.environ.get(k) for k in ('DOCKER_HOST','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH')):raise RuntimeError('ambient remote Docker forbidden')
    original=source_hashes(root)
    task.write('source.sha256.json',original)
    endpoint=task.docker('context-check',['context','inspect','default','--format','{{.Endpoints.docker.Host}}']).strip()
    if endpoint!='unix:///var/run/docker.sock':raise RuntimeError('unexpected Docker endpoint')
    docker_armed=True
    fd=os.open(task.env_file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    secret_owned=True
    with os.fdopen(fd,'w') as stream:stream.write(''.join(k+'='+v+'\n' for k,v in env.items()))
    task.compose('database-start',['up','-d','--wait','--wait-timeout','120','db','mailpit'],140)
    task.compose('bootstrap',boot+['-f','/ops/bootstrap.sql'],45)
    task.compose('auth-start',['up','-d','--wait','--wait-timeout','120','auth'],140)
    task.compose('auth-grants',boot+['-f','/ops/bootstrap-auth-grants.sql'],45)
    task.build()
    task.compose('migrate',['run','--rm','--no-deps','migrate'],90)
    sql('sentinel-create',"SET ROLE elevateo_owner; CREATE TABLE app_drafts_private.ops402_namespace_probe(value integer); INSERT INTO app_drafts_private.ops402_namespace_probe VALUES (7)")
    before=probe(); bookkeeping('1')
    if not before.endswith('\n7'):raise AssertionError('sentinel missing')
    task.compose('rails-down',rail+['db:migrate:down','VERSION='+version],90)
    bookkeeping('0')
    if probe()!=before:raise AssertionError('down changed namespace/sentinel')
    task.compose('rails-up',rail+['db:migrate:up','VERSION='+version],90)
    bookkeeping('1')
    if probe()!=before:raise AssertionError('up changed namespace/sentinel')
    passed('actual Rails down/up bookkeeping and namespace/sentinel preservation')
    task.compose('nonempty-bootstrap',boot+['-f','/ops/bootstrap.sql'],45)
    if probe()!=before:raise AssertionError('bootstrap changed default ACL/sentinel')
    sql('explicit-owner-acl','GRANT CREATE,USAGE ON SCHEMA app_drafts_private TO elevateo_owner')
    explicit=probe()
    task.compose('explicit-acl-bootstrap',boot+['-f','/ops/bootstrap.sql'],45)
    if probe()!=explicit:raise AssertionError('bootstrap changed explicit owner ACL')
    passed('full psql bootstrap preserves nonempty default/explicit namespace')
    for privilege in ('CREATE','USAGE','ALL'):
        expect_failure('owner-loss-'+privilege.lower(),boot+['-c','BEGIN; REVOKE '+privilege+' ON SCHEMA app_drafts_private FROM elevateo_owner','-f','/ops/bootstrap.sql'],'owner privilege loss')
        if probe()!=explicit:raise AssertionError('privilege drift did not roll back')
    expect_failure('wrong-owner-empty-acl',boot+['-c','BEGIN; ALTER SCHEMA app_drafts_private OWNER TO supabase_admin; REVOKE ALL ON SCHEMA app_drafts_private FROM elevateo_owner,supabase_admin','-f','/ops/bootstrap.sql'],'wrong owner')
    if probe()!=explicit:raise AssertionError('owner drift did not roll back')
    expect_failure('foreign-grantor-grantee',boot+['-c','BEGIN; CREATE ROLE ops402_foreign NOLOGIN; GRANT USAGE ON SCHEMA app_drafts_private TO ops402_foreign WITH GRANT OPTION; SET ROLE ops402_foreign; GRANT USAGE ON SCHEMA app_drafts_private TO elevateo_owner; RESET ROLE','-f','/ops/bootstrap.sql'],'foreign ACL')
    if probe()!=explicit:raise AssertionError('foreign ACL drift did not roll back')
    # Owner-current-user guard is invoked verbatim as an actual admin SQL session.
    prerequisite=(root/'apps/server/db/be02_drafts/prerequisite.sql').read_text()
    expect_failure('admin-prerequisite',boot+['-c',prerequisite],'migration requires owner')
    sql('dependency-create','SET ROLE elevateo_owner; CREATE VIEW app_meta.ops402_dependency AS SELECT id FROM app.drafts')
    expect_failure('rails-dependent-down',rail+['db:migrate:down','VERSION='+version],'because other objects depend on it')
    bookkeeping('1')
    if probe()!=explicit:raise AssertionError('failed migration changed sentinel/namespace')
    sql('dependency-remove','SET ROLE elevateo_owner; DROP VIEW app_meta.ops402_dependency')
    passed('unexpected dependency rejects actual Rails down atomically')
    task.compose('empty-schema-down',rail+['db:migrate:down','VERSION='+version],90)
    drift='BEGIN; ALTER TABLE app_drafts_private.ops402_namespace_probe SET SCHEMA app_meta; DROP SCHEMA app_drafts_private; ALTER DEFAULT PRIVILEGES FOR ROLE elevateo_owner GRANT USAGE ON SCHEMAS TO elevateo_api'
    expect_failure('creation-default-privilege-leak',boot+['-c',drift,'-f','/ops/bootstrap.sql'],'foreign ACL')
    if probe()!=explicit:raise AssertionError('default privilege drift changed original namespace')
    task.compose('final-rails-up',rail+['db:migrate:up','VERSION='+version],90)
    bookkeeping('1')
    passed('creation-time default privilege leakage fails atomically')
except Exception as error:
    failed=task.redact(type(error).__name__+': '+str(error))
finally:
    task.cleanup_mode=True;task.deadline=time.monotonic()+240
    try:
        clean=cleanup(task) if docker_armed else True
    except Exception as error:
        failed+=' cleanup '+task.redact(type(error).__name__+': '+str(error))
    finally:
        try:
            if secret_owned:task.env_file.unlink(missing_ok=True)
        except Exception as error:
            failed+=' secret cleanup '+type(error).__name__
    try:
        after=source_hashes(root)
        task.write('source.after.sha256.json',after)
        if original is not None and after!=original:failed+=' source changed'
    except Exception as error:
        failed+=' source receipt '+type(error).__name__
    try:
        task.write('result.json',{'supplement_only':True,'passed_cases':results,'failure':failed,'cleanup_passed':clean})
    except Exception as error:
        failed+=' result receipt '+type(error).__name__
        print('supplement result receipt failed: '+type(error).__name__,flush=True)
print('supplement_exit='+str(int(bool(failed) or not clean))+' cleanup_passed='+str(clean),flush=True)
raise SystemExit(int(bool(failed) or not clean))
