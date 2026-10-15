"""Host orchestration for Rowan's additional packet; every SQL check runs in Docker."""
import base64, json, os, pathlib, secrets, subprocess, sys, uuid
root=pathlib.Path(sys.argv[1]).resolve()
evidence=pathlib.Path(sys.argv[2]).resolve(); evidence.mkdir(parents=True,exist_ok=True)
project='ops402-proof-'+uuid.uuid4().hex
# AIDEV-NOTE: Compose requires an isolated gateway credential even when this proof exercises only base role guards.
values={key:secrets.token_hex(32) for key in ('POSTGRES_PASSWORD','MIGRATOR_DB_PASSWORD','API_DB_PASSWORD','WORKER_DB_PASSWORD','ATTACHMENT_GATEWAY_DB_PASSWORD','SECRET_KEY_BASE','BE02_FIXTURE_SIGNING_SECRET')}
values.update(BE02_SOURCE=str(root),BE02_PROJECT=project,BE02_SERVER_IMAGE='unused-proof:local',ELEVATEO_SESSION_KEY_BASE64=base64.b64encode(secrets.token_bytes(32)).decode())
env=evidence/'.env.proof'
fd=os.open(env,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as stream: stream.write(''.join(k+'='+v+'\n' for k,v in values.items()))
base=['docker','compose','-p',project,'--env-file',str(env),'-f',str(root/'ops/compose.be02-test.yaml')]
def run(label,args,expected=0,contains=None):
    result=subprocess.run(base+args,capture_output=True,text=True,timeout=150)
    output=result.stdout+result.stderr
    for value in values.values():
        output=output.replace(value,'[redacted]')
    (evidence/(label+'.txt')).write_text(output+'\nexit='+str(result.returncode)+'\n')
    assert (result.returncode==0)==(expected==0),label
    if contains: assert contains in output,label
    print('PASS '+label,flush=True)
boot=['run','--rm','--no-deps','bootstrap']
failed=False
try:
    run('database-start',['up','-d','--wait','--wait-timeout','120','db','mailpit'])
    run('bootstrap',boot+['-f','/ops/bootstrap.sql'])
    run('bootstrap-idempotence',boot+['-f','/ops/bootstrap.sql'])
    cases=[('private-owner','ALTER SCHEMA app_drafts_private OWNER TO supabase_admin','ALTER SCHEMA app_drafts_private OWNER TO elevateo_owner','unexpected draft private schema owner or ACL'),
           ('private-api-usage','GRANT USAGE ON SCHEMA app_drafts_private TO elevateo_api','REVOKE USAGE ON SCHEMA app_drafts_private FROM elevateo_api','unexpected draft private schema owner or ACL'),
           ('private-public-create','GRANT CREATE ON SCHEMA app_drafts_private TO PUBLIC','REVOKE CREATE ON SCHEMA app_drafts_private FROM PUBLIC','unexpected draft private schema owner or ACL'),
           ('migrator-database-create','GRANT CREATE ON DATABASE postgres TO elevateo_migrator','REVOKE CREATE ON DATABASE postgres FROM elevateo_migrator','unexpected application database CREATE privilege')]
    for name,drift,undo,message in cases:
        run(name+'-inject',boot+['-c',drift])
        try:
            run(name+'-rejection',boot+['-f','/ops/bootstrap.sql'],expected=1,contains=message)
        finally:
            run(name+'-restore',boot+['-c',undo])
        run(name+'-recovered',boot+['-f','/ops/bootstrap.sql'])
    assertion="""DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_owner','elevateo_migrator','elevateo_api','elevateo_worker','elevateo_app_read']) r WHERE has_database_privilege(r,current_database(),'CREATE'))
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['elevateo_api','elevateo_worker']) r WHERE has_schema_privilege(r,'app_drafts_private','USAGE,CREATE'))
    THEN RAISE EXCEPTION 'role privilege postcondition failed'; END IF; END $$;"""
    run('effective-privilege-denials',boot+['-c',assertion])
except Exception:
    failed=True
    raise
finally:
    cleanup_exit=1
    try:
        result=subprocess.run(base+['down','--volumes','--remove-orphans'],capture_output=True,text=True,timeout=150)
        cleanup_exit=result.returncode
        (evidence/'cleanup.txt').write_text(result.stdout+result.stderr+'\nexit='+str(cleanup_exit)+'\n')
    except Exception as error:
        (evidence/'cleanup.txt').write_text('cleanup exception: '+type(error).__name__+'\n')
    finally:
        env.unlink(missing_ok=True)
        (evidence/'result.json').write_text(json.dumps({'job_passed':not failed,'cleanup_exit':cleanup_exit,'project':project}))
    if cleanup_exit: raise RuntimeError('proof cleanup failed')
