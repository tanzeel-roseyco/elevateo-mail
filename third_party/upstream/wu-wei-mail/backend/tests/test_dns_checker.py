"""Unit tests for DNS checker DKIM selector behavior."""

from unittest.mock import patch

import dns.resolver

from app.utils.dns_checker import DNSChecker


class TestDNSCheckerDKIMSelectors:
    def test_check_all_uses_default_selector_when_present(self):
        checker = DNSChecker()

        def fake_resolve(name, record_type):
            if name == "example.com" and record_type == "TXT":
                return ['"v=spf1 include:_spf.google.com ~all"']
            if name == "_dmarc.example.com" and record_type == "TXT":
                return ['"v=DMARC1; p=none"']
            if name == "default._domainkey.example.com" and record_type == "TXT":
                return ['"v=DKIM1; p=abc"']
            raise dns.resolver.NXDOMAIN

        with patch("dns.resolver.resolve", side_effect=fake_resolve):
            result = checker.check_all("sender@example.com")

        assert result["dkim"]["valid"] is True
        assert result["dkim"]["selector"] == "default"

    def test_check_all_falls_back_to_google_selector(self):
        checker = DNSChecker()

        def fake_resolve(name, record_type):
            if name == "example.com" and record_type == "TXT":
                return ['"v=spf1 include:_spf.google.com ~all"']
            if name == "_dmarc.example.com" and record_type == "TXT":
                return ['"v=DMARC1; p=none"']
            if name == "default._domainkey.example.com" and record_type == "TXT":
                raise dns.resolver.NXDOMAIN
            if name == "google._domainkey.example.com" and record_type == "TXT":
                return ['"v=DKIM1; p=xyz"']
            raise dns.resolver.NXDOMAIN

        with patch("dns.resolver.resolve", side_effect=fake_resolve):
            result = checker.check_all("sender@example.com")

        assert result["dkim"]["valid"] is True
        assert result["dkim"]["selector"] == "google"

    def test_check_all_reports_missing_when_no_selector_exists(self):
        checker = DNSChecker()

        def fake_resolve(name, record_type):
            if name == "example.com" and record_type == "TXT":
                return ['"v=spf1 include:_spf.google.com ~all"']
            if name == "_dmarc.example.com" and record_type == "TXT":
                return ['"v=DMARC1; p=none"']
            raise dns.resolver.NXDOMAIN

        with patch("dns.resolver.resolve", side_effect=fake_resolve):
            result = checker.check_all("sender@example.com")

        assert result["dkim"]["valid"] is False
        assert "default" in result["dkim"]["error"]
        assert "google" in result["dkim"]["error"]
