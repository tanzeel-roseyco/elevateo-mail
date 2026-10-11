"""Email verification utilities."""

import re
import dns.resolver
from typing import Optional


class EmailVerifier:
    """Verify email addresses via syntax check and MX record lookup."""

    EMAIL_REGEX = re.compile(
        r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    )

    # Common disposable email domains
    DISPOSABLE_DOMAINS = {
        "mailinator.com", "guerrillamail.com", "tempmail.com",
        "throwaway.email", "yopmail.com", "sharklasers.com",
        "guerrillamailblock.com", "grr.la", "dispostable.com",
    }

    def validate_syntax(self, email: str) -> bool:
        """Check basic email syntax."""
        return bool(self.EMAIL_REGEX.match(email))

    def get_domain(self, email: str) -> str:
        return email.split("@")[1].lower()

    def is_disposable(self, email: str) -> bool:
        """Check if the domain is a known disposable email provider."""
        domain = self.get_domain(email)
        return domain in self.DISPOSABLE_DOMAINS

    def check_mx_records(self, email: str) -> dict:
        """Look up MX records for the domain. Returns dict with status info."""
        domain = self.get_domain(email)
        try:
            mx_records = dns.resolver.resolve(domain, "MX")
            records = [str(r.exchange).rstrip(".") for r in mx_records]
            return {
                "valid": True,
                "domain": domain,
                "mx_records": records,
                "error": None,
            }
        except dns.resolver.NoAnswer:
            return {"valid": False, "domain": domain, "mx_records": [], "error": "No MX records"}
        except dns.resolver.NXDOMAIN:
            return {"valid": False, "domain": domain, "mx_records": [], "error": "Domain does not exist"}
        except Exception as e:
            return {"valid": False, "domain": domain, "mx_records": [], "error": str(e)}

    def verify(self, email: str) -> dict:
        """Full verification: syntax + disposable check + MX lookup."""
        result = {
            "email": email,
            "valid_syntax": False,
            "is_disposable": False,
            "mx_valid": False,
            "overall_valid": False,
            "errors": [],
        }

        if not self.validate_syntax(email):
            result["errors"].append("Invalid email syntax")
            return result
        result["valid_syntax"] = True

        if self.is_disposable(email):
            result["is_disposable"] = True
            result["errors"].append("Disposable email domain")

        mx_result = self.check_mx_records(email)
        result["mx_valid"] = mx_result["valid"]
        if not mx_result["valid"]:
            result["errors"].append(f"MX check failed: {mx_result['error']}")

        result["overall_valid"] = result["valid_syntax"] and result["mx_valid"] and not result["is_disposable"]
        return result


email_verifier = EmailVerifier()
