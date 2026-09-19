"""Domain errors and their mapping to HTTP responses.

Services raise these; routers stay free of HTTP error plumbing. The response body is always
`{"error": {"code": ..., "message": ...}}` so the web app can show `message` as-is.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class DomainError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code


class NotAuthenticated(DomainError):
    status_code = 401
    code = "not_authenticated"


class NotFound(DomainError):
    status_code = 404
    code = "not_found"


class Conflict(DomainError):
    status_code = 409
    code = "conflict"


class TooManyRequests(DomainError):
    status_code = 429
    code = "too_many_requests"


class UpstreamError(DomainError):
    """Apple said no, or is unavailable. Not our bug, not the user's."""

    status_code = 502
    code = "apple_error"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError) -> JSONResponse:
        body = ErrorResponse(error=ErrorBody(code=exc.code, message=exc.message))
        return JSONResponse(status_code=exc.status_code, content=body.model_dump())
