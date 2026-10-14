#!/usr/bin/env bash
set -euo pipefail

# AIDEV-NOTE: Runner owns Compose cleanup; this wrapper preserves its sanitized receipt before archive removal.
candidate=$(git rev-parse "${1:?usage: run-backend-candidate.sh COMMIT}^{commit}")
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
receipt_dir="$root/docs/completion/qa815-evidence/backend-${candidate:0:12}"
summary="$root/docs/completion/qa815-evidence/backend-${candidate:0:12}.txt"
if [[ -n ${QA815_FRESH_GROUP:-} ]]; then
  [[ $QA815_FRESH_GROUP == qa817 || $QA815_FRESH_GROUP == sends ]] || {
    echo 'QA815_FRESH_GROUP must be qa817 or sends' >&2; exit 2;
  }
  receipt_dir="${receipt_dir}-fresh-${QA815_FRESH_GROUP}"
  summary="${summary%.txt}-fresh-${QA815_FRESH_GROUP}.txt"
elif [[ ${QA815_GATEWAY_ACL_FOCUS:-0} == 1 ]]; then
  focus_label=gateway-acl
  [[ ${QA815_MIGRATOR_SUITE:-} == assignment-options ]] && focus_label=assignment-options-migrator
  receipt_dir="${receipt_dir}-${focus_label}"
  summary="${summary%.txt}-${focus_label}.txt"
elif [[ ${QA815_GATEWAY_AUTHORITY_FOCUS:-0} == 1 ]]; then
  receipt_dir="${receipt_dir}-gateway-authority"
  summary="${summary%.txt}-gateway-authority.txt"
fi
context=$(mktemp -d /tmp/qa815-backend.XXXXXXXX)
mkdir -p "$receipt_dir"
exec 9>"$lock"
flock -x 9
printf 'source=%s\nstarted=%s\n' "$candidate" "$(date -u +%FT%TZ)" > "$summary"
git archive "$candidate" | tar -x -C "$context"
# Git omits empty mountpoints; Compose's read-only source bind needs these paths in the disposable archive.
install -d -m 755 "$context/apps/server/tmp" "$context/apps/server/log"
chmod -R a+rX "$context"
if [[ ${QA815_EXPANDED_SUITES:-0} == 1 ]]; then
  # AIDEV-NOTE: TEST929 enumerates 130 independent processes; preserve each result and a bounded outer lease.
  python3 - "$context/ops/tests/be02/run.py" "$context/ops/tests/be02/test-suites.sh" <<'PY'
from pathlib import Path
import sys

runner = Path(sys.argv[1])
source = runner.read_text()
needle = '            task.compose("ruby-suites", ["run", "--rm", "--no-deps", "test"], 480)\n'
if source.count(needle) != 1:
    raise SystemExit("QA815 expanded suite timeout anchor mismatch")
runner.write_text(source.replace(needle, needle.replace(', 480)', ', 1800)')))

suites = Path(sys.argv[2])
source = suites.read_text()
needle = '''  printf 'RUN %s\\n' "$test_file"
  if ! timeout -k 3s 90s bundle exec ruby "$test_file"; then
    failed=$((failed + 1))
  fi
'''
replacement = '''  printf 'RUN %s\\n' "$test_file"
  started=$SECONDS
  if timeout -k 3s 90s bundle exec ruby "$test_file"; then
    status=0
  else
    status=$?
    failed=$((failed + 1))
  fi
  printf 'SUITE_RESULT path=%s exit=%s elapsed_seconds=%s\\n' "$test_file" "$status" "$((SECONDS - started))"
'''
if source.count(needle) != 1:
    raise SystemExit("QA815 expanded suite ledger anchor mismatch")
suites.write_text(source.replace(needle, replacement))
PY
  printf 'task_source_overlay=TEST929 per-file exit/elapsed ledger and 1800s outer lease; canonical commit unchanged\n' >> "$summary"
fi
if [[ ${QA815_GATEWAY_BOOTSTRAP:-0} == 1 ]]; then
  # AIDEV-NOTE: Test-only OPS820 bootstrap overlay; the candidate commit stays byte-for-byte intact.
  python3 - "$context/ops/tests/be02/run.py" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()
needle = '''        task.compose(name, ["run", "--rm", "--no-deps", "bootstrap", "-f", "/ops/" + filename], 45)
'''
addition = '''    gateway_password = secrets.token_hex(32)
    task.secrets["qa815_gateway_password"] = gateway_password
    with task.env_file.open("a", encoding="ascii") as stream:
        stream.write("ATTACHMENT_GATEWAY_DB_PASSWORD=" + gateway_password + "\\n")
    task.env_file.chmod(0o600)
    task.docker("bootstrap-gateway", ["run", "--rm", "--network", task.project + "_isolated",
        "--read-only", "--cap-drop", "ALL", "--env-file", str(task.env_file),
        "-e", "PGHOST=db", "-e", "PGUSER=supabase_admin", "-e", "PGDATABASE=postgres",
        "-v", str(task.root / "ops/ops820/bootstrap-gateway.sql") + ":/bootstrap-gateway.sql:ro",
        "--entrypoint", "bash",
        "supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00",
        "-c", 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -v ON_ERROR_STOP=1 -f /bootstrap-gateway.sql'], 45)
'''
if source.count(needle) != 1:
    raise SystemExit("QA815 gateway overlay anchor mismatch")
path.write_text(source.replace(needle, needle + addition))
PY
  printf 'task_source_overlay=OPS820 restricted gateway login before migration; canonical commit unchanged\n' >> "$summary"
fi
if [[ -n ${QA815_FRESH_GROUP:-} ]]; then
  [[ ${QA815_ELARA_FOCUS:-0} != 1 && ${QA815_GATEWAY_ACL_FOCUS:-0} != 1 ]] || {
    echo 'Choose one focused backend mode' >&2; exit 2;
  }
  case "$QA815_FRESH_GROUP" in
    qa817) suite=test/qa817/cancellation_privileges_database_test.rb ;;
    sends) suite=test/sends/approval_database_test.rb ;;
  esac
  cat > "$context/ops/tests/be02/test-suites.sh" <<SH
#!/usr/bin/env bash
set -euo pipefail
cd /workspace/apps/server
bundle exec ruby "$suite"
SH
  python3 - "$context/ops/tests/be02/run.py" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()
needle = '            task.compose("ruby-suites", ["run", "--rm", "--no-deps", "test"], 480)\n'
failure = '    except Exception as error:\n        failure ='
if source.count(needle) != 1 or source.count(failure) != 1:
    raise SystemExit("QA815 fresh-group diagnostic anchors mismatch")
source = source.replace(needle, needle + '            raise StopIteration("QA815 fresh DB representative suite complete")\n')
source = source.replace(failure, '    except StopIteration:\n        status = "DIAGNOSTIC_COMPLETED"\n' + failure)
path.write_text(source)
PY
  printf 'task_source_overlay=fresh task DB representative %s; stop before HTTP/worker, canonical commit unchanged\n' "$suite" >> "$summary"
fi
if [[ ${QA815_ELARA_FOCUS:-0} == 1 ]]; then
  [[ $candidate == 94bd1eea1ab6269b34817d4f05523d60d1fb6aa4 ||
     $candidate == a0a60b66151a8a1172b2eeaf75f05bd9e05c6f90 ||
     $candidate == 7273309bc84c3b499cf4850073002e5d589bd9b5 ||
     $candidate == 37b20c2556e826a226b9d2ebe8afd08d11b4f65a ]] || {
    echo 'Elara focused diagnostic requires the exact authorized tip' >&2; exit 2;
  }
  cat > "$context/ops/tests/be02/test-suites.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
cd /workspace/apps/server
bin/rails test test/be_02/organization_access_policy_test.rb -n /test_outreach_draft_write_requires_current_business_role/
SH
  python3 - "$context/ops/tests/be02/run.py" "$context/apps/server/test/be_02/organization_access_policy_test.rb" <<'PY'
from pathlib import Path
import sys

runner = Path(sys.argv[1])
source = runner.read_text()
needle = '            task.compose("ruby-suites", ["run", "--rm", "--no-deps", "test"], 480)\n'
if source.count(needle) != 1 or source.count('    except Exception as error:\n        failure =') != 1:
    raise SystemExit("QA815 focused runner anchor mismatch")
source = source.replace(needle, needle + '            raise StopIteration("QA815 focused diagnostic complete")\n')
source = source.replace('    except Exception as error:\n        failure =',
                        '    except StopIteration:\n        status = "DIAGNOSTIC_COMPLETED"\n'
                        '    except Exception as error:\n        failure =')
runner.write_text(source)

test = Path(sys.argv[2])
source = test.read_text()
if '    statuses = outreach_same_scope_witness(sales)\n' in source:
    scope_needle = ('  def outreach_same_scope_witness(actor)\n'
                    '    results = {}\n'
                    '    scope(identity: actor, targets: [actor.user_id]) do |connection|\n')
    if source.count(scope_needle) != 1:
        raise SystemExit("QA815 same-scope anchor mismatch")
    source = source.replace(scope_needle,
                            scope_needle + '      puts "QA815 db_current_user=#{connection.select_value(\'SELECT current_user\')}"\n')
    needle = '    statuses = outreach_same_scope_witness(sales)\n'
    addition = '''    qa_session_count = @admin.exec_params(
      "SELECT count(*) FROM app_auth.sessions WHERE user_id=$1 AND auth_session_id=$2",
      [sales.user_id, sales.auth_session_id]).getvalue(0, 0)
    qa_generation = generation(sales.user_id)
    puts "QA815 provenance member=#{member} role=#{role} function_owner=#{owner} read_result=#{statuses.fetch('read')} write_result=#{statuses.fetch('write')} session_count=#{qa_session_count} generation=#{qa_generation}"
'''
elif '    guard_status = outreach_authorization(sales).fetch("status")\n' in source:
    needle = '    guard_status = outreach_authorization(sales).fetch("status")\n'
    addition = '    puts "QA815 provenance member=#{member} role=#{role} function_owner=#{owner} protected_result=#{guard_status}"\n'
else:
    raise SystemExit("QA815 provenance anchor mismatch")
if source.count(needle) != 1:
    raise SystemExit("QA815 provenance anchor ambiguous")
source = source.replace(needle, needle + addition)
test.write_text(source)
PY
  printf 'task_source_overlay=Elara exact focused diagnostic, provenance print, stop after one case; canonical commit unchanged\n' >> "$summary"
fi
if [[ ${QA815_GATEWAY_ACL_FOCUS:-0} == 1 ]]; then
  [[ ${QA815_ELARA_FOCUS:-0} != 1 ]] || { echo 'Choose one focused backend mode' >&2; exit 2; }
  suite=test/attachment_gateway/migration_acl_test.rb
  if [[ -n ${QA815_MIGRATOR_SUITE:-} ]]; then
    [[ $QA815_MIGRATOR_SUITE == assignment-options ]] || { echo 'Unknown migrator suite' >&2; exit 2; }
    suite=test/administration/assignment_member_options_migration_test.rb
  fi
  python3 - "$context/ops/compose.be02-test.yaml" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()
start = source.index('  test:\n')
end = source.index('  fixture:\n', start)
block = source[start:end]
for old, new in (
    ('      ELEVATEO_DB_ROLE: elevateo_api\n', '      ELEVATEO_DB_ROLE: elevateo_migrator\n'),
    ('      ELEVATEO_PROCESS: api\n', '      ELEVATEO_PROCESS: migrate\n'),
    ('      API_DB_PASSWORD: ${API_DB_PASSWORD:?}\n',
     '      API_DB_PASSWORD: ${API_DB_PASSWORD:?}\n      MIGRATOR_DB_PASSWORD: ${MIGRATOR_DB_PASSWORD:?}\n'),
):
    if block.count(old) != 1:
        raise SystemExit("QA815 gateway ACL migrator service anchor mismatch")
    block = block.replace(old, new)
path.write_text(source[:start] + block + source[end:])
PY
  cat > "$context/ops/tests/be02/test-suites.sh" <<SH
#!/usr/bin/env bash
set -euo pipefail
cd /workspace/apps/server
bin/rails test "$suite"
SH
  python3 - "$context/ops/tests/be02/run.py" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()
needle = '            task.compose("ruby-suites", ["run", "--rm", "--no-deps", "test"], 480)\n'
failure = '    except Exception as error:\n        failure ='
if source.count(needle) != 1 or source.count(failure) != 1:
    raise SystemExit("QA815 gateway ACL focused runner anchor mismatch")
source = source.replace(needle, needle + '            raise StopIteration("QA815 gateway ACL diagnostic complete")\n')
source = source.replace(failure,
                        '    except StopIteration:\n        status = "DIAGNOSTIC_COMPLETED"\n' + failure)
path.write_text(source)
PY
  printf 'task_source_overlay=%s single-suite migrator test role and stop; canonical commit unchanged\n' "$suite" >> "$summary"
fi
if [[ ${QA815_GATEWAY_AUTHORITY_FOCUS:-0} == 1 ]]; then
  [[ ${QA815_GATEWAY_BOOTSTRAP:-0} == 1 ]] || { echo 'Gateway authority requires task-only gateway bootstrap' >&2; exit 2; }
  [[ ${QA815_FRESH_GROUP:-} == '' && ${QA815_ELARA_FOCUS:-0} != 1 && ${QA815_GATEWAY_ACL_FOCUS:-0} != 1 ]] || {
    echo 'Choose one focused backend mode' >&2; exit 2;
  }
  python3 - "$context/ops/compose.be02-test.yaml" "$context/ops/tests/be02/run.py" <<'PY'
from pathlib import Path
import sys

compose = Path(sys.argv[1])
source = compose.read_text()
start = source.index('  test:\n')
end = source.index('  fixture:\n', start)
block = source[start:end]
needle = '      BE02_TASK_DATABASE_NAME: postgres\n'
if block.count(needle) != 1:
    raise SystemExit('QA815 gateway authority test-service anchor mismatch')
block = block.replace(needle, needle +
    '      BE02_ATTACHMENT_GATEWAY_DATABASE_URL: postgres://elevateo_attachment_gateway:${ATTACHMENT_GATEWAY_DB_PASSWORD:-preflight-placeholder}@db:5432/postgres\n')
compose.write_text(source[:start] + block + source[end:])

runner = Path(sys.argv[2])
source = runner.read_text()
needle = '            task.compose("ruby-suites", ["run", "--rm", "--no-deps", "test"], 480)\n'
failure = '    except Exception as error:\n        failure ='
if source.count(needle) != 1 or source.count(failure) != 1:
    raise SystemExit('QA815 gateway authority runner anchors mismatch')
source = source.replace(needle, needle + '            raise StopIteration("QA815 gateway authority diagnostic complete")\n')
source = source.replace(failure, '    except StopIteration:\n        status = "DIAGNOSTIC_COMPLETED"\n' + failure)
runner.write_text(source)
PY
  cat > "$context/ops/tests/be02/test-suites.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
cd /workspace/apps/server
bundle exec ruby test/attachment_gateway/authority_database_test.rb
SH
  printf 'task_source_overlay=private gateway URL and authority suite only; stop before HTTP/worker, canonical commit unchanged\n' >> "$summary"
fi
set +e
python3 "$context/ops/tests/be02/run.py" --context default \
  --expect-host Ubuntu-noble-latest-amd64-base >> "$summary" 2>&1
run_status=$?
set -e
printf 'runner_exit=%s\n' "$run_status" >> "$summary"
shopt -s nullglob
projects=("$context"/ops/local/be02-*)
if [[ ${#projects[@]} -ne 1 || ! -f ${projects[0]}/result.json ]]; then
  printf 'receipt_copy_failed=1 archive_retained=%s\n' "$context" >> "$summary"
  exit 90
fi
project=${projects[0]}
for file in result.json cleanup.json server-image.json; do
  [[ ! -f $project/$file ]] || cp "$project/$file" "$receipt_dir/$file"
done
for source_log in "$project"/*.log; do
  # Task.run writes sanitized logs; runtime credential files and raw snapshots stay excluded.
  cp "$source_log" "$receipt_dir/$(basename "${source_log%.log}").txt"
done
[[ -f $receipt_dir/cleanup.json ]] || { printf 'cleanup_receipt_missing=1 archive_retained=%s\n' "$context" >> "$summary"; exit 91; }
printf 'receipt_copy_failed=0\n' >> "$summary"
rm -rf "$context"
printf 'archive_absent=%s\nfinished=%s\n' "$([[ ! -e $context ]] && echo yes || echo no)" "$(date -u +%FT%TZ)" >> "$summary"
exit "$run_status"
