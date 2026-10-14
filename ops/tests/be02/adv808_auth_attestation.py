"""Pure projection of Soren's actual engine inspection; never serialize privileged Config.Env."""
from typing import Any
from copy import deepcopy

AUTH_PIN = "supabase/gotrue:v2.196.0@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232"


def attest(container: dict[str, Any], image: dict[str, Any], project: str) -> dict[str, object]:
    config = container["Config"]
    labels = config["Labels"]
    if (labels.get("com.docker.compose.project") != project or
            labels.get("com.docker.compose.service") != "auth" or
            config["Image"] != AUTH_PIN or container["Image"] != image["Id"] or
            not container["State"]["Running"] or container.get("Mounts") or
            config.get("Entrypoint") != image["Config"].get("Entrypoint") or
            config.get("Cmd") != image["Config"].get("Cmd")):
        raise RuntimeError("ADV808 Auth image/ownership/config-source mismatch")
    env: dict[str, str] = {}
    for item in config["Env"]:
        key, value = item.split("=", 1)
        if key in env:
            raise RuntimeError("ADV808 duplicate Auth environment key")
        env[key] = value
    expected = {"GOTRUE_JWT_EXP": "3600", "GOTRUE_SESSIONS_TIMEBOX": "12h",
                "GOTRUE_SESSIONS_SINGLE_PER_USER": "false"}
    if any(env.get(key) != value for key, value in expected.items()) or any(
            key in env for key in ("GOTRUE_SESSIONS_INACTIVITY_TIMEOUT", "GOTRUE_SESSIONS_ALLOW_LOW_AAL")):
        raise RuntimeError("ADV808 Auth policy environment mismatch")
    return {"image": AUTH_PIN, "engine_image_id": image["Id"], "project": project,
            "configured": expected, "inactivity_timeout": "UNSET", "allow_low_aal": "UNSET",
            "behavior": "NOT_RUN"}


def attest_with_controls(container: dict[str, Any], image: dict[str, Any], project: str) -> dict[str, object]:
    receipt = attest(container, image, project)
    # AIDEV-NOTE: Mutate copies of actual inspection only; never configure these rejected values in Auth.
    for key, value in (("GOTRUE_SESSIONS_TIMEBOX", "13h"),
                       ("GOTRUE_SESSIONS_INACTIVITY_TIMEOUT", "0s"),
                       ("GOTRUE_SESSIONS_ALLOW_LOW_AAL", ""),
                       ("GOTRUE_SESSIONS_SINGLE_PER_USER", "true")):
        altered = deepcopy(container)
        altered["Config"]["Env"] = [item for item in altered["Config"]["Env"] if not item.startswith(key + "=")]
        altered["Config"]["Env"].append(key + "=" + value)
        try:
            attest(altered, image, project)
        except RuntimeError:
            continue
        raise RuntimeError("ADV808 configuration rejection control failed")
    return {**receipt, "rejected_inspection_controls": 4}
