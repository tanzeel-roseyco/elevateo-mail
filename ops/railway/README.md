# Restricted transport verification

`transport.Dockerfile`, `sshd_config` and `transport.compose.yaml` define an isolated
SSH forwarding service. The root daemon needs only SETUID, SETGID and SYS_CHROOT;
clients receive no shell, session, remote forwarding or Unix socket forwarding.
Only `launch-api:3000` and `oauth-proxy:8080` are permitted destinations. The
transport container joins only the transport network, never the private data network.

Run the disposable test **on fleet-02**, from a staged repository root:

```sh
bash ops/railway/check-transport.sh
```

The test holds `/tmp/elevateo-launch-20261023-transport/lease`, builds with a dedicated
BuildKit builder, creates disposable keys and two fake HTTP upstreams, and exercises
the SSH boundary inside Docker. It checks allowed destinations, denied command and
remote/Unix/arbitrary forwards, host-key mismatch, effective capabilities,
no-new-privileges, read-only root/key mounts and single-network membership. No host
port is published. It refuses pre-existing named resources and nonempty key storage.
EXIT cleanup inspects mounts before removing exact test containers, network, image,
builder/cache and generated key files; shared images and unrelated workloads remain.
The directory retains nonsecret effective-config and container-inspect evidence.

This test uses Docker-run equivalents of the transport profile, not the production
application composition. It establishes an isolated transport boundary, not a live
deployment, provider connectivity, application authorization or browser acceptance.
Production application of the compose overlay, key provisioning/rotation and pin
distribution remain coordinator-owned activation work. Use a protected dedicated
directory containing only the server host key and authorized public key, mounted
read-only; never mount a client private key into the deployed service. Pin the exact
`[host]:port` host-key identity out of band; never use trust-on-first-use for activation.
