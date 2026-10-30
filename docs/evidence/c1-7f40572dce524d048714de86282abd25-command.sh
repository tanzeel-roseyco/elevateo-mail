set -euo pipefail
remote=/home/tanzeel/elevateo-mail-tests-20261012-ultra/c1-regression-7f40572dce524d048714de86282abd25
name=elevateo-c1-7f40572dce524d048714de86282abd25
image=sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
cd "$remote"
printf '%s  %s
' e83b0d8d7dd42f8e99f5e80bc78dd5007b6e81e1d03cded9bc13376d705fb056 invoke.sh 54a9ebeba4282b387b8febab2bd21c8c10732a90a3539adbab51f63dbca1effc invoke-regression.sh | sha256sum -c -
chmod 444 invoke.sh invoke-regression.sh
before=$(df -B1 --output=avail / | tail -n 1 | tr -d ' ')
cleanup() {
  original=$?
  set +e
  remaining=$(timeout 15s docker ps -aq --filter "name=^/${name}$")
  listing=$?
  cleanup_exit=0
  if [[ $listing != 0 ]]; then cleanup_exit=$listing
  elif [[ -n $remaining ]]; then
    label=$(timeout 15s docker inspect --format '{{index .Config.Labels "elevateo.task"}}' "$remaining")
    if [[ $? == 0 && $label == "$name" ]]; then
      timeout 15s docker inspect --format '{{json .Mounts}}' "$remaining"
      timeout 20s docker rm -f "$remaining" || cleanup_exit=$?
    else cleanup_exit=1; fi
  fi
  final=$(timeout 15s docker ps -aq --filter "name=^/${name}$")
  final_exit=$?
  [[ $final_exit == 0 && -z $final ]] || cleanup_exit=1
  after=$(df -B1 --output=avail / | tail -n 1 | tr -d ' ')
  printf 'test_exit=%s
cleanup_exit=%s
remaining=%s
free_before=%s
free_after=%s
' "$original" "$cleanup_exit" "$final" "$before" "$after"
  timeout 15s docker image inspect "$image" --format 'retained_image={{.Id}}'
  if [[ $original == 0 && $cleanup_exit != 0 ]]; then exit "$cleanup_exit"; fi
  exit "$original"
}
trap cleanup EXIT
[[ -z $(timeout 15s docker ps -aq --filter "name=^/${name}$") ]]
timeout -k 10s 90s docker run --rm --pull never --name "$name" --label "elevateo.task=$name" --network none --user 10001:10001 --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 256m --memory-swap 256m --cpus 1 --tmpfs /tmp:rw,nosuid,nodev,size=64m,mode=1777 --mount "type=bind,src=$remote,dst=/src,readonly" --entrypoint /bin/bash "$image" /src/invoke-regression.sh
