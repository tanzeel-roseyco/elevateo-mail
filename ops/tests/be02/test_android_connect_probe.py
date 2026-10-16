"""CONNECT probe contract regressions; real Node/TLS transport is proven by the fixture on fleet."""
from __future__ import annotations
from pathlib import Path
import ssl
import unittest
from unittest.mock import Mock, patch
from android_connect_probe import HOST, main, probe


class AndroidConnectProbeTests(unittest.TestCase):
    def test_tunnel_and_tls_use_fixed_destination_and_close(self) -> None:
        response = Mock(status=200)
        response.getheader.return_value = "text/html; charset=utf-8"
        connection = Mock()
        connection.getresponse.return_value = response
        with patch("android_connect_probe.ssl.create_default_context") as context, patch(
                "android_connect_probe.http.client.HTTPSConnection", return_value=connection) as factory:
            probe(Path("/public/ca.pem"))
        context.assert_called_once_with(cafile="/public/ca.pem")
        factory.assert_called_once_with("127.0.0.1", 19443, timeout=2, context=context.return_value)
        connection.set_tunnel.assert_called_once_with(HOST, 443, headers={"Host": HOST + ":443"})
        connection.request.assert_called_once_with("GET", "/", headers={"Host": HOST, "Connection": "close"})
        connection.close.assert_called_once()

    def test_denial_wrong_media_and_tls_failure_close_connection(self) -> None:
        for failure in ("status", "media", "tls"):
            with self.subTest(failure=failure):
                connection = Mock()
                connection.getresponse.return_value = Mock(status=403 if failure == "status" else 200)
                connection.getresponse.return_value.getheader.return_value = "application/json" if failure == "media" else "text/html"
                if failure == "tls":
                    connection.request.side_effect = ssl.SSLCertVerificationError("synthetic")
                with patch("android_connect_probe.ssl.create_default_context"), patch(
                        "android_connect_probe.http.client.HTTPSConnection", return_value=connection):
                    with self.assertRaises((RuntimeError, ssl.SSLCertVerificationError)):
                        probe()
                connection.close.assert_called_once()

    def test_retries_are_bounded_and_timeout_is_failure(self) -> None:
        with patch("android_connect_probe.signal.signal"), patch("android_connect_probe.signal.setitimer") as alarm, patch(
                "android_connect_probe.time.monotonic", side_effect=[0, 0, 0, 60, 60]), patch(
                "android_connect_probe.time.sleep"), patch("android_connect_probe.probe", side_effect=TimeoutError), patch("builtins.print"):
            self.assertEqual(main(), 1)
        self.assertEqual(alarm.call_args.args[1], 0)


if __name__ == "__main__":
    unittest.main()
