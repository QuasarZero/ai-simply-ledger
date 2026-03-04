from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_add_currencies"
down_revision = "0004_add_fx_rates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "currencies",
        sa.Column("code", sa.String(length=8), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # Minimal seed so the system works even without network access.
    op.bulk_insert(
        sa.table(
            "currencies",
            sa.column("code", sa.String),
            sa.column("name", sa.String),
            sa.column("is_enabled", sa.Boolean),
        ),
        [
            {"code": "USD", "name": "US Dollar", "is_enabled": True},
            {"code": "CNY", "name": "Chinese Yuan", "is_enabled": True},
            {"code": "EUR", "name": "Euro", "is_enabled": True},
            {"code": "JPY", "name": "Japanese Yen", "is_enabled": True},
            {"code": "HKD", "name": "Hong Kong Dollar", "is_enabled": True},
            {"code": "GBP", "name": "Pound Sterling", "is_enabled": True},
        ],
    )

    op.alter_column("currencies", "is_enabled", server_default=None)


def downgrade() -> None:
    op.drop_table("currencies")

