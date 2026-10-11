"""Domain derivation utilities for prospecting leads."""

FREE_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
    "icloud.com", "mail.com", "protonmail.com", "zoho.com", "yandex.com",
    "live.com", "msn.com", "gmx.com", "me.com", "mac.com",
    "comcast.net", "verizon.net", "att.net", "cox.net", "sbcglobal.net",
    "qq.com", "163.com", "126.com", "sina.com", "yeah.net",
    "googlemail.com", "fastmail.com", "tutanota.com", "hushmail.com",
}


def derive_domain_from_email(email: str) -> str | None:
    """Extract company domain from email. Returns None for free email providers."""
    if not email or "@" not in email:
        return None
    domain = email.split("@")[1].lower().strip()
    if domain in FREE_EMAIL_DOMAINS:
        return None
    return domain


def derive_website_from_domain(domain: str) -> str:
    """Convert domain to website URL."""
    return f"https://{domain}"
