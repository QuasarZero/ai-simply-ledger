from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_add_category_fields"
down_revision = "0002_add_transaction_voided"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "category_fields",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name="fk_category_fields_category_id_categories",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("category_id", "name", name="uq_category_fields_category_id_name"),
    )
    op.create_index("ix_category_fields_category_id", "category_fields", ["category_id"])

    op.create_table(
        "transaction_field_values",
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("field_id", sa.Integer(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("transaction_id", "field_id", name="pk_transaction_field_values"),
        sa.ForeignKeyConstraint(
            ["transaction_id"],
            ["transactions.id"],
            name="fk_tfv_transaction_id_transactions",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["field_id"],
            ["category_fields.id"],
            name="fk_tfv_field_id_category_fields",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_transaction_field_values_field_id", "transaction_field_values", ["field_id"])

    op.alter_column("category_fields", "is_required", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_transaction_field_values_field_id", table_name="transaction_field_values")
    op.drop_table("transaction_field_values")
    op.drop_index("ix_category_fields_category_id", table_name="category_fields")
    op.drop_table("category_fields")

