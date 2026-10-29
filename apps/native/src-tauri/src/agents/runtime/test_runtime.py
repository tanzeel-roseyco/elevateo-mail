"""Offline policy regressions; run only in the final Docker check image."""
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch

import launch
import proxy


class RuntimePolicyTest(unittest.TestCase):
    def test_launcher_boundary_accepts_only_bounded_request(self) -> None:
        request = {"runtime": "codex", "prompt": "draft", "timeout_seconds": 30,
                   "mcp_url": "https://mail.example.test/mcp", "grant_token": "grant", "provider_key": "key"}
        self.assertEqual(launch.validate(request)["prompt"], "draft")
        for value in (None, {}, {**request, "prompt": ""}, {**request, "timeout_seconds": True},
                      {**request, "prompt": "x" * 16385}, {**request, "mcp_url": "http://mail.test"},
                      {**request, "provider_key": "bad\nkey"}, {**request, "extra": "ignored"}):
            with self.assertRaises(ValueError):
                launch.validate(value)

    def test_codex_receives_only_fixed_arguments_and_granted_mcp_tools(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with patch("launch.Path", side_effect=lambda value: Path(directory) / Path(value).name):
                args = launch.arguments("codex", "https://mail.example.test/mcp", "grant")
            config = (Path(directory) / ".codex" / "config.toml").read_text()
            self.assertIn('shell_tool = false', config)
            self.assertIn('web_search = "disabled"', config)
            self.assertIn('"mailbox_draft"', config)
            self.assertNotIn("grant", config)
            self.assertIn("read-only", args)
            self.assertEqual(args[-1], "-")

    def test_claude_disables_builtins_and_inherited_mcp(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with patch("launch.Path", side_effect=lambda value: Path(directory) / Path(value).name):
                args = launch.arguments("claude", "https://mail.example.test/mcp", "grant")
            self.assertEqual(args[args.index("--tools") + 1], "")
            self.assertIn("--strict-mcp-config", args)
            self.assertEqual(args[args.index("--permission-mode") + 1], "dontAsk")
            self.assertNotIn("grant", args)

    def test_unrecognized_runtime_cannot_be_executed(self) -> None:
        with self.assertRaises(ValueError):
            launch.arguments("sh", "https://mail.test", "grant")

    def test_only_assistant_text_is_forwarded(self) -> None:
        self.assertEqual(launch.text_blocks("codex", {"type": "item.completed", "item":
            {"type": "agent_message", "text": "draft [message:123]"}}), ["draft [message:123]"])
        self.assertEqual(launch.text_blocks("claude", {"type": "assistant", "message":
            {"content": [{"type": "text", "text": "ok"}, {"type": "tool_use", "input": "secret"}]}}), ["ok"])
        self.assertEqual(launch.text_blocks("codex", {"type": "item.completed", "item":
            {"type": "command_execution", "text": "secret"}}), [])
        self.assertEqual(launch.text_blocks("claude", {"type": "assistant", "message": {"content": None}}), [])

    def test_exact_https_destination_allowed(self) -> None:
        self.assertEqual(proxy.target("api.openai.com:443", {"api.openai.com"}), "api.openai.com")

    def test_arbitrary_host_port_and_host_suffix_are_denied(self) -> None:
        for authority in ["evil.test:443", "api.openai.com:80", "api.openai.com.evil.test:443",
                          "api.openai.com", "user@api.openai.com:443"]:
            with self.assertRaises(ValueError):
                proxy.target(authority, {"api.openai.com"})

    def test_private_dns_answers_fail_before_connect(self) -> None:
        for address in ["127.0.0.1", "10.0.0.1", "169.254.169.254"]:
            answer = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))]
            with patch("proxy.socket.getaddrinfo", return_value=answer), patch("proxy.socket.socket") as opened:
                with self.assertRaises(ValueError):
                    proxy.connect_public("mail.example.test")
                opened.assert_not_called()


if __name__ == "__main__":
    unittest.main()
