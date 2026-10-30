"""Read-only, authenticated audit views for the operator dashboard."""

import logging
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import SQLAlchemyError

from bulwark.proxy.routes import authenticate_gateway_key
from bulwark.storage.audit import AuditRepository

router = APIRouter(prefix="/v1/audit", tags=["audit"])
logger = logging.getLogger(__name__)


def _repository(request: Request) -> AuditRepository:
    return cast(AuditRepository, request.app.state.audit_repository)


@router.get("/recent")
async def recent_requests(
    request: Request,
    _: Annotated[None, Depends(authenticate_gateway_key)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> dict[str, Any]:
    try:
        items = await _repository(request).recent(limit)
    except SQLAlchemyError as exc:
        logger.exception("Dashboard audit query failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audit storage is unavailable.",
        ) from exc
    return {"data": items}


@router.get("/summary")
async def audit_summary(
    request: Request,
    _: Annotated[None, Depends(authenticate_gateway_key)],
    hours: Annotated[int, Query(ge=1, le=720)] = 24,
) -> dict[str, Any]:
    try:
        summary = await _repository(request).summary(hours)
    except SQLAlchemyError as exc:
        logger.exception("Dashboard audit summary query failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audit storage is unavailable.",
        ) from exc
    return summary
