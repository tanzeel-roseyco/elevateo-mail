"""DNS record checker for SPF, DKIM, DMARC verification."""

import dns.resolver
from typing import Optional


class DNSChecker:
    """Check SPF, DKIM, and DMARC records for a domain."""

    def check_spf(self, domain: str) -> dict:
        """Check for a valid SPF record."""
        try:
            answers = dns.resolver.resolve(domain, "TXT")
            for rdata in answers:
                txt = str(rdata).strip('"')
                if txt.startswith("v=spf1"):
                    return {
                        "found": True,
                        "record": txt,
                        "valid": True,
                        "error": None,
                    }
            return {"found": False, "record": None, "valid": False, "error": "No SPF record found"}
        except Exception as e:
            return {"found": False, "record": None, "valid": False, "error": str(e)}

    def check_dkim(self, domain: str, selector: str = "default") -> dict:
        """Check for a DKIM record at selector._domainkey.domain."""
        dkim_domain = f"{selector}._domainkey.{domain}"
        try:
            answers = dns.resolver.resolve(dkim_domain, "TXT")
            for rdata in answers:
                txt = str(rdata).strip('"')
                if "v=DKIM1" in txt or "p=" in txt:
                    return {
                        "found": True,
                        "record": txt,
                        "selector": selector,
                        "valid": True,
                        "error": None,
                    }
            return {"found": False, "record": None, "selector": selector, "valid": False, "error": "No DKIM record found"}
        except dns.resolver.NXDOMAIN:
            return {"found": False, "record": None, "selector": selector, "valid": False, "error": f"DKIM record not found at {dkim_domain}"}
        except Exception as e:
            return {"found": False, "record": None, "selector": selector, "valid": False, "error": str(e)}

    def check_dkim_any(self, domain: str, selectors: tuple[str, ...] = ("default", "google")) -> dict:
        """Check DKIM across common selectors and return first valid match."""
        errors: list[str] = []
        for selector in selectors:
            result = self.check_dkim(domain, selector)
            if result.get("valid"):
                return result
            if result.get("error"):
                errors.append(f"{selector}: {result['error']}")
        return {
            "found": False,
            "record": None,
            "selector": ",".join(selectors),
            "valid": False,
            "error": " ; ".join(errors) if errors else "No DKIM record found",
        }

    def check_dmarc(self, domain: str) -> dict:
        """Check for a DMARC record at _dmarc.domain."""
        dmarc_domain = f"_dmarc.{domain}"
        try:
            answers = dns.resolver.resolve(dmarc_domain, "TXT")
            for rdata in answers:
                txt = str(rdata).strip('"')
                if txt.startswith("v=DMARC1"):
                    return {
                        "found": True,
                        "record": txt,
                        "valid": True,
                        "error": None,
                    }
            return {"found": False, "record": None, "valid": False, "error": "No DMARC record found"}
        except Exception as e:
            return {"found": False, "record": None, "valid": False, "error": str(e)}

    def check_all(self, email: str, dkim_selector: Optional[str] = None) -> dict:
        """Run all DNS checks for an email address's domain."""
        domain = email.split("@")[1].lower()
        spf = self.check_spf(domain)
        dkim = self.check_dkim(domain, dkim_selector) if dkim_selector else self.check_dkim_any(domain)
        dmarc = self.check_dmarc(domain)
        return {
            "email": email,
            "domain": domain,
            "spf": spf,
            "dkim": dkim,
            "dmarc": dmarc,
            "overall_healthy": spf["valid"] and dmarc["valid"],  # DKIM optional depending on selector
        }


dns_checker = DNSChecker()
