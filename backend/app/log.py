from __future__ import annotations

import json
import os
import sys
import traceback
from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import Request

from app.models import User


def _log_dir() -> Path:
    base = os.getenv("LOG_DIR", "logs")
    p = Path(base)
    if not p.is_absolute():
        # Make it relative to the backend working directory (container: /app)
        p = Path.cwd() / p
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_one_line(value: str) -> str:
    return value.replace("\n", "\\n").replace("\r", "\\r")


def _actor_label(user: User | None) -> str | None:
    if not user:
        return None
    return f"{user.username}<{user.email}>"


def _write_prefixed_line(*, prefix: str, line: str) -> None:
    day = datetime.now().strftime("%Y-%m-%d")
    out = _log_dir() / f"{prefix.lower()}-{day}.log"
    try:
        with out.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        # Never crash the app due to logging failures.
        pass


def _now_stamp() -> str:
    # Keep the format user wants: "YYYY-MM-DD HH:MM:SS"
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _ip_label(request: Request | None) -> str:
    if request is None:
        return "-"
    try:
        return request.client.host if request.client else "-"
    except Exception:
        return "-"


def _json_compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _fmt_dt(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.isoformat()
    return value


def _snapshot_from_changes(changes: dict[str, Any] | None, *, which: str) -> dict[str, Any]:
    if not changes:
        return {}
    out: dict[str, Any] = {}
    for k, v in changes.items():
        if not isinstance(v, dict):
            continue
        if which in v:
            out[k] = _fmt_dt(v.get(which))
    out.pop("deleted", None)
    return out


def _normalize_entity_snapshot(
    *,
    entity: str | None,
    snapshot: dict[str, Any],
    actor: User | None,
    include_user_id: bool = False,
) -> dict[str, Any]:
    if entity != "transaction":
        return snapshot

    ordered: dict[str, Any] = {}
    if "type" in snapshot:
        ordered["type"] = snapshot.get("type")
    if "amount" in snapshot:
        ordered["amount"] = snapshot.get("amount")
    if "currency" in snapshot:
        ordered["currency"] = snapshot.get("currency")
    if "note" in snapshot:
        ordered["note"] = snapshot.get("note")
    if "occurred_at" in snapshot:
        ordered["occurred_at"] = snapshot.get("occurred_at")
    if "is_voided" in snapshot:
        ordered["is_voided"] = snapshot.get("is_voided")

    if "user_id" in snapshot:
        ordered["user_id"] = snapshot.get("user_id")
    elif include_user_id and actor is not None:
        ordered["user_id"] = actor.id

    if "category_ids" in snapshot:
        ordered["categories"] = snapshot.get("category_ids")
    if "tag_ids" in snapshot:
        ordered["tags"] = snapshot.get("tag_ids")

    for k, v in snapshot.items():
        if k in {
            "type",
            "amount",
            "currency",
            "note",
            "occurred_at",
            "is_voided",
            "user_id",
            "category_ids",
            "tag_ids",
        }:
            continue
        ordered[k] = v

    return ordered


def _entity_label(entity: str | None) -> str:
    return entity or "entity"


def _entity_label_plural(entity: str | None) -> str:
    if not entity:
        return "entities"
    if entity.endswith("s"):
        return entity
    return f"{entity}s"


def audit_http(
    *,
    request: Request,
    status_code: int,
    actor_id: int | None,
    detail: Any | None = None,
) -> None:
    ts = _now_stamp()
    ip = _ip_label(request)
    actor_text = f"User ({actor_id})" if actor_id else "Anonymous"
    tail = ""
    if detail is not None:
        tail = f" {_json_compact({'detail': detail})}"
    line = f"[{ts} - {ip}] {actor_text} HTTP {status_code} {request.method} {request.url.path}{tail}"
    _write_prefixed_line(prefix="audit", line=line)


def audit_log(
    *,
    action: str,
    actor: User | None,
    entity: str | None = None,
    entity_id: int | str | None = None,
    changes: dict[str, Any] | None = None,
    request: Request | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    ts = _now_stamp()
    ip = _ip_label(request)
    actor_text = f"User ({actor.id})" if actor else "Anonymous"

    normalized_action = action
    if action.startswith("admin."):
        rest = action.split(".", 1)[1]
        for suffix, repl in (
            ("_create", ".create"),
            ("_update", ".update"),
            ("_delete", ".delete"),
            ("_bulk_delete", ".bulk_delete"),
            ("_bulk_void", ".bulk_void"),
            ("_bulk_restore", ".bulk_restore"),
        ):
            if rest.endswith(suffix):
                normalized_action = f"{rest[: -len(suffix)]}{repl}"
                break
    else:
        for suffix, repl in (
            ("_create", ".create"),
            ("_update", ".update"),
            ("_delete", ".delete"),
            ("_bulk_delete", ".bulk_delete"),
            ("_bulk_void", ".bulk_void"),
            ("_bulk_restore", ".bulk_restore"),
        ):
            if action.endswith(suffix):
                normalized_action = f"{action[: -len(suffix)]}{repl}"
                break

    if normalized_action == "auth.login":
        _write_prefixed_line(prefix="audit", line=f"[{ts} - {ip}] {actor_text} Login in")
        return

    if normalized_action == "auth.logout":
        _write_prefixed_line(prefix="audit", line=f"[{ts} - {ip}] {actor_text} Logout")
        return

    if normalized_action == "auth.login_failed":
        login_id = (extra or {}).get("login_id")
        tail = f" { _json_compact({'login_id': login_id}) }" if login_id else ""
        _write_prefixed_line(prefix="audit", line=f"[{ts} - {ip}] {actor_text} Login failed{tail}")
        return

    if ".bulk_" in normalized_action:
        ids = (changes or {}).get("ids") if isinstance(changes, dict) else None
        ids = [int(x) for x in (ids or [])]
        verb = "Batch"
        op = normalized_action.split(".bulk_", 1)[1]
        if op.startswith("delete"):
            verb = "Batch Delete"
        elif op.startswith("void"):
            verb = "Batch Void"
        elif op.startswith("restore"):
            verb = "Batch Restore"
        label = _entity_label_plural(entity)
        _write_prefixed_line(
            prefix="audit", line=f"[{ts} - {ip}] {actor_text} {verb} {label} { _json_compact(ids) }"
        )
        return

    if normalized_action.endswith(".create"):
        snapshot = _snapshot_from_changes(changes, which="to")
        snapshot = _normalize_entity_snapshot(
            entity=entity, snapshot=snapshot, actor=actor, include_user_id=True
        )
        _write_prefixed_line(
            prefix="audit",
            line=f"[{ts} - {ip}] {actor_text} Create {_entity_label(entity)} ({entity_id}) {_json_compact(snapshot)}",
        )
        return

    if normalized_action.endswith(".update"):
        before = _snapshot_from_changes(changes, which="from")
        after = _snapshot_from_changes(changes, which="to")
        before = _normalize_entity_snapshot(entity=entity, snapshot=before, actor=actor)
        after = _normalize_entity_snapshot(entity=entity, snapshot=after, actor=actor)
        _write_prefixed_line(
            prefix="audit",
            line=(
                f"[{ts} - {ip}] {actor_text} Update {_entity_label(entity)} ({entity_id}) "
                f"from {_json_compact(before)} to {_json_compact(after)}"
            ),
        )
        return

    if normalized_action.endswith(".delete"):
        _write_prefixed_line(
            prefix="audit",
            line=f"[{ts} - {ip}] {actor_text} Delete {_entity_label(entity)} ({entity_id})",
        )
        return

    if normalized_action == "admin.user_reset_password":
        _write_prefixed_line(
            prefix="audit", line=f"[{ts} - {ip}] {actor_text} Reset password user ({entity_id})"
        )
        return

    payload: dict[str, Any] = {
        "action": action,
        "actor_id": actor.id if actor else None,
        "actor": _actor_label(actor),
        "entity": entity,
        "entity_id": entity_id,
        "changes": changes or None,
        "extra": extra or None,
    }
    _write_prefixed_line(
        prefix="audit",
        line=f"[{ts} - {ip}] {actor_text} {_safe_one_line(action)} {_json_compact(payload)}",
    )


def error_log(
    *,
    error: BaseException,
    request: Request | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    ts = _now_stamp()
    ip = _ip_label(request)
    payload: dict[str, Any] = {
        "error_type": type(error).__name__,
        "error": _safe_one_line(str(error)),
        "method": request.method if request is not None else None,
        "path": str(request.url.path) if request is not None else None,
        "traceback": _safe_one_line("".join(traceback.format_exception(error))),
        "extra": extra or None,
    }
    _write_prefixed_line(prefix="error", line=f"[{ts} - {ip}] ERROR {_json_compact(payload)}")


def install_global_error_logging() -> None:
    """
    Best-effort: log unhandled exceptions to error-YYYY-MM-DD.log.
    Request-scoped errors should still be logged by FastAPI middleware/handlers.
    """

    def _hook(exc_type, exc, tb):
        try:
            error_log(
                error=exc,
                request=None,
                extra={"unhandled": True, "exc_type": getattr(exc_type, "__name__", str(exc_type))},
            )
        finally:
            sys.__excepthook__(exc_type, exc, tb)

    sys.excepthook = _hook


def diff(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    keys = set(before.keys()) | set(after.keys())
    for k in sorted(keys):
        if before.get(k) != after.get(k):
            out[k] = {"from": before.get(k), "to": after.get(k)}
    return out

