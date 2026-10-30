"""Index request timestamps for dashboard queries.

Revision ID: 0002_request_created_at_index
Revises: 0001_request_audit
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_request_created_at_index"
down_revision: str | None = "0001_request_audit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_requests_created_at", "requests", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_requests_created_at", table_name="requests")
