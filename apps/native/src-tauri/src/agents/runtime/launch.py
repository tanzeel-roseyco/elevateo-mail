"""Fixed container entrypoint; no user-controlled argv, executable, mounts or shell."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
from typing import Any, TypedDict
from urllib.parse import urlsplit

LIMIT = 1_048_576
TOOLS = ["mailbox_search", "mailbox_read", "mailbox_draft"]


class Request(TypedDict):
    runtime: str
    prompt: str
    timeout_seconds: int
    mcp_url: str
    grant_token: str
    provider_key: str


def validate(value: object) -> Request:
    # AIDEV-NOTE: Revalidate stdin independently: container entrypoints can be invoked without the Rust bridge.
    fields = {"runtime", "prompt", "timeout_seconds", "mcp_url", "grant_token", "provider_key"}
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError("invalid request")
    for key in fields - {"timeout_seconds"}:
        if not isinstance(value[key], str) or not value[key]:
            raise ValueError("invalid string")
    if value["runtime"] not in ("codex", "claude") or len(value["prompt"]) > 16384:
        raise ValueError("invalid runtime or prompt")
    for key in ("grant_token", "provider_key"):
        if len(value[key]) > 4096 or any(ord(char) < 32 or ord(char) == 127 for char in value[key]):
            raise ValueError("invalid credential")
    url = urlsplit(value["mcp_url"])
    if (url.scheme != "https" or not url.hostname or url.port not in (None, 443)
            or url.username is not None or url.password is not None or url.query or url.fragment):
        raise ValueError("invalid MCP origin")
    timeout = value["timeout_seconds"]
    if type(timeout) is not int or not 1 <= timeout <= 300:
        raise ValueError("invalid timeout")
    return Request(runtime=value["runtime"], prompt=value["prompt"], timeout_seconds=timeout,
                   mcp_url=value["mcp_url"], grant_token=value["grant_token"], provider_key=value["provider_key"])


def arguments(runtime: str, mcp_url: str, token: str) -> list[str]:
    # AIDEV-NOTE: Empty ephemeral HOME prevents inherited MCP servers, hooks, plugins and project instructions.
    if runtime == "codex":
        home = Path("/home/agent/.codex")
        home.mkdir(mode=0o700, exist_ok=True)
        config = '\n'.join([
            'web_search = "disabled"', 'project_doc_max_bytes = 0',
            '[features]', 'shell_tool = false', 'shell_snapshot = false',
            'skill_mcp_dependency_install = false', '[mcp_servers.mailbox]',
            f'url = {json.dumps(mcp_url)}', 'bearer_token_env_var = "ELEVATEO_GRANT_TOKEN"',
            f'enabled_tools = {json.dumps(TOOLS)}', 'required = true',
        ])
        (home / "config.toml").write_text(config, encoding="utf-8")
        return ["/usr/local/bin/codex", "-a", "never", "exec", "--sandbox", "read-only",
                "--json", "--ephemeral", "--skip-git-repo-check", "-"]
    if runtime != "claude":
        raise ValueError("unsupported runtime")
    mcp = {"mcpServers": {"mailbox": {"type": "http", "url": mcp_url,
           "headers": {"Authorization": f"Bearer {token}"}}}}
    path = Path("/home/agent/mcp.json")
    path.write_text(json.dumps(mcp), encoding="utf-8")
    path.chmod(0o600)
    return ["/usr/local/bin/claude", "-p", "--tools", "", "--strict-mcp-config",
            "--mcp-config", str(path), "--setting-sources", "", "--no-session-persistence",
            "--permission-mode", "dontAsk", "--allowedTools", *[f"mcp__mailbox__{tool}" for tool in TOOLS],
            "--output-format", "stream-json", "--verbose"]


def text_blocks(runtime: str, event: dict[str, Any]) -> list[str]:
    # AIDEV-NOTE: CLI JSON is heterogeneous; Any is confined here and every field is narrowed before emission.
    # Only assistant text crosses the native boundary; tool arguments, reasoning and diagnostics are discarded.
    if runtime == "codex" and event.get("type") == "item.completed":
        item = event.get("item")
        if isinstance(item, dict) and item.get("type") == "agent_message" and isinstance(item.get("text"), str):
            return [item["text"]]
    if runtime == "claude" and event.get("type") == "assistant":
        message = event.get("message")
        blocks = message.get("content", []) if isinstance(message, dict) else []
        if isinstance(blocks, list):
            return [block["text"] for block in blocks if isinstance(block, dict)
                    and block.get("type") == "text" and isinstance(block.get("text"), str)]
    return []


def main() -> int:
    raw = sys.stdin.buffer.read(131_073)
    if len(raw) > 131_072:
        return 1
    request = validate(json.loads(raw))
    timeout = request["timeout_seconds"]
    os.umask(0o077)
    environment = {"HOME": "/home/agent", "PATH": "/usr/local/bin:/usr/bin:/bin",
        "HTTPS_PROXY": "http://egress:8080", "HTTP_PROXY": "http://egress:8080",
        "https_proxy": "http://egress:8080", "http_proxy": "http://egress:8080",
        "ELEVATEO_GRANT_TOKEN": request["grant_token"], "DISABLE_AUTOUPDATER": "1",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"}
    runtime = request["runtime"]
    environment["CODEX_API_KEY" if runtime == "codex" else "ANTHROPIC_API_KEY"] = request["provider_key"]
    argv = arguments(runtime, request["mcp_url"], request["grant_token"])
    # The internal-only network has no direct Internet route; the allowlisted CONNECT proxy is mandatory.
    for attempt in range(20):
        try:
            with socket.create_connection(("egress", 8080), timeout=0.2):
                break
        except OSError:
            if attempt == 19:
                return 1
            time.sleep(0.1)
    child = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, env=environment, start_new_session=True)
    def expired(_signal: int, _frame: object) -> None:
        os.killpg(child.pid, signal.SIGKILL)
        raise TimeoutError("deadline")
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(timeout)
    try:
        assert child.stdin is not None and child.stdout is not None
        child.stdin.write(request["prompt"].encode("utf-8"))
        child.stdin.close()
        sys.stdout.write("READY\n")
        sys.stdout.flush()
        emitted = 0
        while True:
            line = child.stdout.readline(LIMIT + 1)
            if not line:
                break
            if len(line) > LIMIT:
                return 1
            event = json.loads(line)
            if not isinstance(event, dict):
                return 1
            if event.get("type") in ("error", "turn.failed") or event.get("is_error") is True:
                return 1
            for text in text_blocks(runtime, event):
                for secret in (request["grant_token"], request["provider_key"]):
                    text = text.replace(secret, "[redacted]")
                encoded = (text + "\n").encode("utf-8")
                emitted += len(encoded)
                if emitted > LIMIT:
                    return 1
                sys.stdout.buffer.write(encoded)
                sys.stdout.flush()
        return 0 if child.wait() == 0 else 1
    except TimeoutError:
        return 124
    finally:
        signal.alarm(0)
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
        child.wait()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError):
        sys.exit(1)  # Never print request data or provider credentials in error diagnostics.
