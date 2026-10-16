"""CONNECT probe contract regressions; real Node/TLS transport is proven by the fixture on fleet."""
from __future__ import annotations
from pathlib import Path
import ssl
import unittest
from unittest.mock import Mock, patch
from android_connect_probe import HOST, UnixHTTPSConnection, main, probe


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

    def test_unix_transport_uses_fixed_socket_then_verified_tls(self) -> None:
        context = Mock()
        with patch("android_connect_probe.socket.socket") as factory:
            connection = UnixHTTPSConnection(context)
            connection.set_tunnel(HOST, 443, headers={"Host": HOST + ":443"})
            with patch.object(connection, "_tunnel") as tunnel:
                connection.connect()
            factory.return_value.connect.assert_called_once_with("/relay/edge.sock")
            factory.return_value.settimeout.assert_called_once_with(2)
            tunnel.assert_called_once_with()
            context.wrap_socket.assert_called_once_with(factory.return_value, server_hostname=HOST)
            connection.close()
            context.wrap_socket.return_value.close.assert_called_once()

    def test_unix_probe_failure_closes_socket_and_does_not_retry_tcp(self) -> None:
        context = Mock()
        context.wrap_socket.side_effect = ssl.SSLCertVerificationError("synthetic")
        with patch("android_connect_probe.ssl.create_default_context", return_value=context), patch(
                "android_connect_probe.socket.socket") as factory, patch.object(UnixHTTPSConnection, "_tunnel"), patch(
                "android_connect_probe.socket.create_connection") as tcp:
            with self.assertRaises(ssl.SSLCertVerificationError):
                probe(unix=True)
            factory.return_value.close.assert_called_once()
            tcp.assert_not_called()

    def test_retries_are_bounded_and_timeout_is_failure(self) -> None:
        with patch("android_connect_probe.signal.signal"), patch("android_connect_probe.signal.setitimer") as alarm, patch(
                "android_connect_probe.time.monotonic", side_effect=[0, 0, 0, 60, 60]), patch(
                "android_connect_probe.time.sleep") as pause, patch("android_connect_probe.probe", side_effect=TimeoutError) as attempt, patch("builtins.print"):
            self.assertEqual(main(), 1)
        attempt.assert_called_once_with(unix=False)
        self.assertEqual([call.args[1] for call in alarm.call_args_list], [3, 0])
        pause.assert_called_once_with(0)


if __name__ == "__main__":
    unittest.main()
