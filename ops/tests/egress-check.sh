#!/bin/sh
# A04: isolated external-network fixture reachable by a control container, unreachable from runtime.
# Creates and removes only task-owned resources labelled elevateo.task=be01-egress.
set -u
RUBY=ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
NET=be01-egress-fixture
L="--label elevateo.task=be01-egress"
cleanup() { docker rm -f be01-egress-server be01-egress-control >/dev/null 2>&1; docker network rm $NET >/dev/null 2>&1; }
trap cleanup EXIT
docker network create $L $NET >/dev/null
docker run -d $L --name be01-egress-server --network $NET $RUBY ruby -rsocket -e 's=TCPServer.new("0.0.0.0",8080); loop{c=s.accept; c.write("HTTP/1.0 200 OK\r\n\r\nfixture"); c.close}' >/dev/null
sleep 2
IP=$(docker inspect -f "{{(index .NetworkSettings.Networks \"$NET\").IPAddress}}" be01-egress-server)
fail=0
ctl=$(docker run --rm $L --name be01-egress-control --network $NET $RUBY ruby -rnet/http -e "print Net::HTTP.get(URI('http://$IP:8080/'))" 2>&1)
[ "$ctl" = "fixture" ] && echo "control -> fixture: reachable (expected)" || { echo "control -> fixture: FAILED ($ctl)"; fail=1; }
for svc in api worker; do
  if docker exec elevateo-local-$svc-1 ruby -rsocket -e "Socket.tcp('$IP',8080,connect_timeout:3).close" >/dev/null 2>&1; then echo "$svc -> fixture: REACHABLE (violation)"; fail=1; else echo "$svc -> fixture: unreachable"; fi
done
for svc in auth mailpit storage; do
  if docker exec elevateo-local-$svc-1 wget -q -T 3 -O /dev/null "http://$IP:8080/" >/dev/null 2>&1; then echo "$svc -> fixture: REACHABLE (violation)"; fail=1; else echo "$svc -> fixture: unreachable"; fi
done
exit $fail
