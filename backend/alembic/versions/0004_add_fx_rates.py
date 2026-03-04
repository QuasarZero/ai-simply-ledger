from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_add_fx_rates"
down_revision = "0003_add_category_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fx_rates",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("rate_date", sa.Date(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("usd_rate", sa.Numeric(18, 8), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("rate_date", "currency", name="uq_fx_rates_date_currency"),
    )
    op.create_index("ix_fx_rates_rate_date", "fx_rates", ["rate_date"])
    op.create_index("ix_fx_rates_currency", "fx_rates", ["currency"])


def downgrade() -> None:
    op.drop_index("ix_fx_rates_currency", table_name="fx_rates")
    op.drop_index("ix_fx_rates_rate_date", table_name="fx_rates")
    op.drop_table("fx_rates")

