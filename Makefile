.PHONY: help install run lint format typecheck test check up down

GW := gateway

help:  ## Show available targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-12s %s\n", $$1, $$2}'

install:  ## Install gateway dependencies
	cd $(GW) && uv sync

run:  ## Run the gateway with auto-reload on :8080
	cd $(GW) && uv run uvicorn bulwark.main:app --reload --port 8080

lint:  ## Lint with ruff
	cd $(GW) && uv run ruff check .

format:  ## Format with ruff
	cd $(GW) && uv run ruff format . && uv run ruff check --fix .

typecheck:  ## Type-check with mypy (strict)
	cd $(GW) && uv run mypy src tests

test:  ## Run tests with coverage
	cd $(GW) && uv run pytest

check: lint typecheck test  ## Everything CI runs
	cd $(GW) && uv run ruff format --check .

up:  ## Start the full stack
	docker compose up --build

down:  ## Stop the stack
	docker compose down
