"""Exercise the actual launcher with offline child processes inside the final Docker gate."""
import io
import json
import sys
import subprocess
import unittest
from unittest.mock import MagicMock, patch

import launch
import proxy


class LauncherExecutionTest(unittest.TestCase):
    # AIDEV-NOTE: Only executable selection and proxy readiness are replaced; framing, deadlines and reaping are real.
    def execute(self, script: str, timeout: int = 5) -> tuple[int, str]:
        request = {"runtime": "codex", "prompt": "draft", "timeout_seconds": timeout,
                   "mcp_url": "https://mail.example.test/mcp", "grant_token": "grant-secret", "provider_key": "key-secret"}
        source = io.TextIOWrapper(io.BytesIO(json.dumps(request).encode()))
        sink = io.TextIOWrapper(io.BytesIO(), write_through=True)
        with patch("launch.sys.stdin", source), patch("launch.sys.stdout", sink), \
             patch("launch.arguments", return_value=[sys.executable, "-u", "-c", script]), \
             patch("launch.socket.create_connection", return_value=MagicMock()):
            status = launch.main()
        sink.flush()
        return status, sink.buffer.getvalue().decode()

    def test_real_child_streams_prompt_and_redacts_both_credentials(self) -> None:
        script = "import sys,json; p=sys.stdin.read(); print(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':p+' grant-secret key-secret'}}))"
        status, output = self.execute(script)
        self.assertEqual(status, 0)
        self.assertEqual(output, "READY\ndraft [redacted] [redacted]\n")

    def test_nonobject_and_oversized_child_output_fail(self) -> None:
        for script in ("import sys; sys.stdin.read(); print('null')",
                       "import sys; sys.stdin.read(); print('x'*1048577)"):
            with self.subTest(script=script):
                status, output = self.execute(script)
                self.assertEqual(status, 1)
                self.assertEqual(output, "READY\n")

    def test_deadline_kills_and_reaps_actual_child(self) -> None:
        status, output = self.execute("import sys,time; sys.stdin.read(); time.sleep(30)", timeout=1)
        self.assertEqual(status, 124)
        self.assertEqual(output, "READY\n")

    def test_malformed_json_reaps_actual_child_before_propagating(self) -> None:
        children: list[subprocess.Popen[bytes]] = []
        original = subprocess.Popen
        def spawn(*args: object, **kwargs: object) -> subprocess.Popen[bytes]:
            child = original(*args, **kwargs)
            children.append(child)
            return child
        with patch("launch.subprocess.Popen", side_effect=spawn), self.assertRaises(ValueError):
            self.execute("import sys,time; sys.stdin.read(); print('{bad',flush=True); time.sleep(30)")
        self.assertEqual(len(children), 1)
        self.assertIsNotNone(children[0].poll())


class HeaderDeadlineTest(unittest.TestCase):
    def test_complete_header_and_reset_idle_timeout(self) -> None:
        client = MagicMock()
        header = b"CONNECT api.openai.com:443 HTTP/1.1\r\n\r\n"
        client.recv.side_effect = [bytes([byte]) for byte in header]
        self.assertEqual(proxy.read_header(client), header)
        client.settimeout.assert_called_with(10)

    def test_slow_bytes_exceed_total_deadline(self) -> None:
        client = MagicMock()
        client.recv.return_value = b"C"
        with patch("proxy.time.monotonic", side_effect=[0, 0, 6, 11]), self.assertRaises(ValueError):
            proxy.read_header(client)
        self.assertEqual(client.recv.call_count, 2)

    def test_empty_and_oversized_headers_rejected(self) -> None:
        for value in (b"", b"A"):
            client = MagicMock()
            client.recv.return_value = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                proxy.read_header(client)


if __name__ == "__main__":
    unittest.main()
