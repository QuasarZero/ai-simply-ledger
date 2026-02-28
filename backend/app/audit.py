from __future__ import annotations

# Backward-compatible shim.
# The implementation was moved to `app.log`.

from app.log import audit_http, audit_log, diff, error_log, install_global_error_logging

__all__ = [
    "audit_http",
    "audit_log",
    "diff",
    "error_log",
    "install_global_error_logging",
]

