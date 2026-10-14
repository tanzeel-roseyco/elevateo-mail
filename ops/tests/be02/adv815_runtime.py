"""Expiry job authority comes from engine inspection, never caller-provided JSON."""
import json
import re
import secrets
from typing import Any
from adv808_auth_attestation import AUTH_PIN, attest
from docker_task import Task

AUTH_SOURCE = "0204331ca41a5b49f076b6fa3dc6c0d20b996590"


def expiry_receipt(container: dict[str, Any], image: dict[str, Any], network: dict[str, Any],
                   project: str, password: str, nonce: str) -> dict[str, object]:
    # AIDEV-NOTE: Engine JSON is a boundary; inherited attestation rejects image/command/env ambiguity.
    attest(container, image, project)
    env = dict(item.split("=", 1) for item in container["Config"]["Env"])
    attached = container["NetworkSettings"]["Networks"]
    if (not re.fullmatch(r"be02-[a-z0-9-]{1,60}", project) or
            not re.fullmatch(r"[0-9a-f]{32}", nonce) or
            network.get("Labels", {}).get("com.docker.compose.project") != project or
            network.get("Internal") is not True or len(attached) != 1 or
            next(iter(attached.values()))["NetworkID"] != network["Id"] or
            container["HostConfig"].get("PortBindings") or
            env.get("GOTRUE_DB_DATABASE_URL") !=
            f"postgres://supabase_auth_admin:{password}@db:5432/postgres" or
            env.get("GOTRUE_SMTP_HOST") != "mailpit" or env.get("GOTRUE_SMTP_PORT") != "1025"):
        raise RuntimeError("ADV815 disposable topology/config mismatch")
    raw = env.get("GOTRUE_MAILER_OTP_EXP")
    if raw is not None and (not re.fullmatch(r"[1-9][0-9]{0,5}", raw) or int(raw) > 604800):
        raise RuntimeError("ADV815 unsupported effective OTP TTL")
    return {"auth_image": AUTH_PIN, "auth_source": AUTH_SOURCE, "disposable": True,
            "nonce": nonce, "otp_seconds": int(raw) if raw is not None else 86400,
            "project": project, "ttl_source": "running_env" if raw is not None else "pinned_default"}


def run_expiry(task: Task) -> None:
    auth = [item for item in task.project_containers()
            if item["Config"]["Labels"].get("com.docker.compose.service") == "auth"]
    if len(auth) != 1:
        raise RuntimeError("ADV815 requires exactly one owned Auth container")
    image = task.inspect("image", [AUTH_PIN])
    attached = auth[0]["NetworkSettings"]["Networks"]
    if len(image) != 1 or len(attached) != 1:
        raise RuntimeError("ADV815 ambiguous engine identity/topology")
    network = task.inspect("network", [next(iter(attached.values()))["NetworkID"]])
    if len(network) != 1:
        raise RuntimeError("ADV815 missing isolated network")
    # AIDEV-NOTE: Resolve DB/SMTP aliases only within the same owned disposable engine network.
    expected = {"db": "supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00",
                "mailpit": "axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea"}
    owned = task.project_containers()
    for service, pin in expected.items():
        matches = [item for item in owned if item["Config"]["Labels"].get("com.docker.compose.service") == service]
        if len(matches) != 1:
            raise RuntimeError("ADV815 dependency ownership ambiguous")
        dependency = matches[0]
        peers = dependency["NetworkSettings"]["Networks"]
        images = task.inspect("image", [pin])
        if (dependency["Config"]["Labels"].get("com.docker.compose.project") != task.project or
                dependency["Config"]["Image"] != pin or len(images) != 1 or
                dependency["Image"] != images[0]["Id"] or not dependency["State"]["Running"] or
                len(peers) != 1 or next(iter(peers.values()))["NetworkID"] != network[0]["Id"] or
                service not in next(iter(peers.values())).get("Aliases", [])):
            raise RuntimeError("ADV815 dependency image/network mismatch")
    nonce = secrets.token_hex(16)
    receipt = expiry_receipt(auth[0], image[0], network[0], task.project,
                             task.secrets["POSTGRES_PASSWORD"], nonce)
    task.write("adv815-auth-attestation.json", receipt)
    # AIDEV-NOTE: Type failure stops the probe; outer runner finally retains sole dataset cleanup ownership.
    task.compose("adv815-strict", ["run", "--rm", "--no-deps", "fixture", "bundle", "exec", "steep",
                 "check", "--steepfile", "/workspace/ops/tests/be02/Steepfile.adv815"], 180)
    args = ["run", "--rm", "--no-deps"]
    for key, value in (("ADV815_AUTH_RECEIPT", json.dumps(receipt, separators=(",", ":"))),
                       ("ADV815_PROJECT", task.project), ("ADV815_NONCE", nonce)):
        args.extend(["-e", f"{key}={value}"])
    task.compose("adv815-expiry", [*args, "fixture", "bundle", "exec", "ruby",
                 "-r", "/workspace/ops/tests/be02/adv815_json_boundary_test.rb",
                 "/workspace/ops/tests/be02/adv815_expiry_test.rb"], 240)
