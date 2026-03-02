from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.config import get_settings

settings = get_settings()


def _send_smtp(*, to_email: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from or settings.smtp_user or "no-reply@example.com"
    msg["To"] = to_email
    msg.set_content(body)

    if settings.smtp_ssl:
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20)
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)

    try:
        server.ehlo()
        if settings.smtp_tls and not settings.smtp_ssl:
            server.starttls()
            server.ehlo()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:
            pass


def send_password_reset_email(*, to_email: str, reset_url: str) -> None:
    """
    Send a password reset email.

    In local/dev, you can set EMAIL_MODE=log to print the reset URL to container logs.
    """
    subject = "Simply Ledger - Reset your password"
    body = (
        "You requested a password reset.\n\n"
        f"Open this link to set a new password:\n{reset_url}\n\n"
        f"This link expires in {settings.password_reset_token_expire_minutes} minutes.\n"
        "If you did not request this, you can ignore this email.\n"
    )

    mode = (settings.email_mode or "log").strip().lower()
    if mode == "smtp":
        _send_smtp(to_email=to_email, subject=subject, body=body)
        return

    # log mode
    print(f"[EMAIL:password_reset] to={to_email} url={reset_url}")

