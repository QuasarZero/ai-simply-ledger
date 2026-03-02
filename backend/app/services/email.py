from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.config import get_settings

settings = get_settings()

SUPPORTED_LANGS = {"en", "zh", "ja"}


def _normalize_lang(lang: str | None) -> str:
    if not lang:
        return "en"
    v = str(lang).strip().lower()
    if v.startswith("zh"):
        return "zh"
    if v.startswith("ja"):
        return "ja"
    if v.startswith("en"):
        return "en"
    return "en"


def _t(lang: str, key: str) -> str:
    lang = _normalize_lang(lang)
    table: dict[str, dict[str, str]] = {
        "en": {
            "subject": "Simply Ledger - Reset your password",
            "intro": "You requested a password reset.",
            "cta": "Reset password",
            "hint": "If you did not request this, you can ignore this email.",
            "expire": "This link expires in {minutes} minutes.",
        },
        "zh": {
            "subject": "Simply Ledger - 重置密码",
            "intro": "你正在找回密码。",
            "cta": "重置密码",
            "hint": "如果不是你本人操作，请忽略此邮件。",
            "expire": "该链接将在 {minutes} 分钟后失效。",
        },
        "ja": {
            "subject": "Simply Ledger - パスワード再設定",
            "intro": "パスワード再設定のリクエストを受け付けました。",
            "cta": "パスワードをリセット",
            "hint": "身に覚えがない場合は、このメールを無視してください。",
            "expire": "このリンクは {minutes} 分後に無効になります。",
        },
    }
    return table.get(lang, table["en"]).get(key, table["en"].get(key, key))


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


def send_password_reset_email(*, to_email: str, reset_url: str, lang: str | None = None) -> None:
    """
    Send a password reset email.

    In local/dev, you can set EMAIL_MODE=log to print the reset URL to container logs.
    """
    lang = _normalize_lang(lang)
    subject = _t(lang, "subject")

    minutes = int(settings.password_reset_token_expire_minutes)
    text_body = (
        f"{_t(lang, 'intro')}\n\n"
        f"{reset_url}\n\n"
        f"{_t(lang, 'expire').format(minutes=minutes)}\n"
        f"{_t(lang, 'hint')}\n"
    )
    html_body = f"""\
<!doctype html>
<html>
  <body>
    <p>{_t(lang, "intro")}</p>
    <p><a href="{reset_url}">{_t(lang, "cta")}</a></p>
    <p>{_t(lang, "expire").format(minutes=minutes)}</p>
    <p style="color:#666">{_t(lang, "hint")}</p>
  </body>
</html>
"""

    mode = (settings.email_mode or "log").strip().lower()
    if mode == "smtp":
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from or settings.smtp_user or "no-reply@example.com"
        msg["To"] = to_email
        msg.set_content(text_body)
        msg.add_alternative(html_body, subtype="html")

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
        return

    # log mode
    print(f"[EMAIL:password_reset] to={to_email} lang={lang} url={reset_url}")
