set -eu
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -w 120 9
docker run --rm --network none --mount type=bind,src=/tmp/elevateo-initrepair20261023,dst=/source,readonly -w /source/ops/production/initialize --entrypoint python3 sha256:94b8c87f0970c71e7a2b24fdeec849254ed30f4fd12f4402f4be3faada9e69e7 -B -m unittest -v test_source test_admission
