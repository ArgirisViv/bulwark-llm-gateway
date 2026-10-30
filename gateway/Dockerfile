# syntax=docker/dockerfile:1

# ---- build stage: install the package and its dependencies ----
FROM python:3.12-slim AS build
WORKDIR /build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --prefix=/install .

# ---- runtime stage: minimal image, non-root user ----
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
ENV BULWARK_POLICY_PATH=/app/policies/default.yaml
WORKDIR /app
RUN useradd --create-home --uid 10001 bulwark
COPY --from=build /install /usr/local
COPY policies /app/policies
COPY alembic.ini /app/alembic.ini
COPY migrations /app/migrations
USER bulwark
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz')"
CMD ["uvicorn", "bulwark.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers"]
