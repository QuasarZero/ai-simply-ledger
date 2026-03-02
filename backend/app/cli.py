from __future__ import annotations

import argparse
import sys
from datetime import date

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models import User
from app.security import hash_password
from app.services.fx import sync_fx_rates


def _db() -> Session:
    return SessionLocal()


def cmd_init_admin(_: argparse.Namespace) -> int:
    settings = get_settings()
    db = _db()
    try:
        existing = db.query(User).filter(User.username == settings.admin_username).first()
        if existing:
            print("Admin already exists, skipped.")
            return 0
        user = User(
            email=settings.admin_email,
            username=settings.admin_username,
            password_hash=hash_password(settings.admin_password),
            is_admin=True,
            is_active=True,
        )
        db.add(user)
        db.commit()
        print("Admin created.")
        return 0
    finally:
        db.close()


def cmd_reset_password(args: argparse.Namespace) -> int:
    db = _db()
    try:
        user = db.query(User).filter(User.username == args.username).first()
        if not user:
            print("User not found.", file=sys.stderr)
            return 1
        user.password_hash = hash_password(args.password)
        db.commit()
        print("Password updated.")
        return 0
    finally:
        db.close()


def cmd_create_user(args: argparse.Namespace) -> int:
    db = _db()
    try:
        if db.query(User).filter(User.username == args.username).first():
            print("Username already exists.", file=sys.stderr)
            return 1
        if db.query(User).filter(User.email == args.email).first():
            print("Email already exists.", file=sys.stderr)
            return 1
        user = User(
            email=args.email,
            username=args.username,
            password_hash=hash_password(args.password),
            is_admin=(args.admin.lower() == "true"),
            is_active=True,
        )
        db.add(user)
        db.commit()
        print("User created.")
        return 0
    finally:
        db.close()


def cmd_sync_fx(args: argparse.Namespace) -> int:
    settings = get_settings()
    db = _db()
    try:
        start = date.fromisoformat(args.start)
        end = date.fromisoformat(args.end)
        currencies = None
        if args.currencies:
            currencies = [x.strip().upper() for x in args.currencies.split(",") if x.strip()]
        result = sync_fx_rates(
            db,
            start=start,
            end=end,
            currencies=currencies,
            source=settings.fx_source,
        )
        print(result)
        return 0
    finally:
        db.close()


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)

    s1 = sub.add_parser("init-admin", help="Initialize the admin account (if not exists)")
    s1.set_defaults(func=cmd_init_admin)

    s2 = sub.add_parser("reset-password", help="Reset a user's password by username")
    s2.add_argument("--username", required=True)
    s2.add_argument("--password", required=True)
    s2.set_defaults(func=cmd_reset_password)

    s3 = sub.add_parser("create-user", help="Create a new user (console/ops)")
    s3.add_argument("--email", required=True)
    s3.add_argument("--username", required=True)
    s3.add_argument("--password", required=True)
    s3.add_argument("--admin", default="false", choices=["true", "false"])
    s3.set_defaults(func=cmd_create_user)

    s4 = sub.add_parser("sync-fx", help="Sync daily FX rates into database (USD base)")
    s4.add_argument("--start", required=True, help="YYYY-MM-DD")
    s4.add_argument("--end", required=True, help="YYYY-MM-DD")
    s4.add_argument(
        "--currencies",
        default="",
        help="Comma separated currency list (default: FX_CURRENCIES)",
    )
    s4.set_defaults(func=cmd_sync_fx)
    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

