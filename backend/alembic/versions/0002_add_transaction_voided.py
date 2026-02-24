from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_add_transaction_voided"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("is_voided", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_transactions_is_voided", "transactions", ["is_voided"])
    op.alter_column("transactions", "is_voided", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_transactions_is_voided", table_name="transactions")
    op.drop_column("transactions", "is_voided")

