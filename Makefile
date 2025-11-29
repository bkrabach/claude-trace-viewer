# Claude Trace Viewer Makefile
# Simple development workflow commands

# Default target - show help
.DEFAULT_GOAL := help

# Python and environment
PYTHON := python3
UV := uv
VENV := .venv
PYTHON_BIN := $(VENV)/bin/python

# Detect environment mode:
# - ACTIVATED: A venv is already activated (VIRTUAL_ENV set) - run commands directly
# - LOCAL: Local .venv exists - use uv run
# - NONE: No venv available
# This allows the Makefile to work both standalone and as a submodule
VENV_ACTIVATED := $(shell if [ -n "$$VIRTUAL_ENV" ]; then echo "1"; fi)
HAS_LOCAL_VENV := $(shell if [ -d "$(VENV)" ]; then echo "1"; fi)
HAS_VENV := $(shell if [ -n "$$VIRTUAL_ENV" ] || [ -n "$$UV_PROJECT_ENVIRONMENT" ] || [ -d "$(VENV)" ]; then echo "1"; fi)

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

.PHONY: help
help: ## Show this help message
	@echo "$(BLUE)Claude Trace Viewer - Development Commands$(NC)"
	@echo ""
	@echo "$(GREEN)Setup:$(NC)"
	@echo "  make install    Install dependencies and set up development environment"
	@echo "  make clean      Remove build artifacts and caches"
	@echo ""
	@echo "$(GREEN)Development:$(NC)"
	@echo "  make check      Run all checks (test, format, lint)"
	@echo "  make test       Run test suite"
	@echo "  make format     Format code with black/ruff"
	@echo "  make lint       Run linting checks"
	@echo ""
	@echo "$(GREEN)Running:$(NC)"
	@echo "  make run        Run the trace viewer locally"
	@echo ""
	@echo "$(GREEN)Release:$(NC)"
	@echo "  make release    Create a new release (interactive)"
	@echo "  make build      Build distribution packages"
	@echo ""
	@echo "$(YELLOW)Use 'make <target>' to run a command$(NC)"

.PHONY: install
install: ## Install dependencies and set up development environment
	@echo "$(BLUE)Setting up development environment...$(NC)"
	@command -v $(UV) >/dev/null 2>&1 || { echo "$(RED)Error: uv is not installed. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh$(NC)"; exit 1; }
	@if [ -z "$$UV_PROJECT_ENVIRONMENT" ]; then \
		echo "Creating virtual environment..."; \
		$(UV) venv; \
	else \
		echo "Using environment from UV_PROJECT_ENVIRONMENT: $$UV_PROJECT_ENVIRONMENT"; \
	fi
	@echo "Installing package in editable mode with dev dependencies..."
	@$(UV) pip install -e ".[dev]"
	@echo "$(GREEN)✓ Development environment ready!$(NC)"
	@if [ -z "$$UV_PROJECT_ENVIRONMENT" ]; then \
		echo ""; \
		echo "$(YELLOW)Activate the virtual environment with:$(NC)"; \
		echo "  source .venv/bin/activate"; \
	fi

.PHONY: test
test: ## Run test suite
	@echo "$(BLUE)Running tests...$(NC)"
	@if [ "$(VENV_ACTIVATED)" = "1" ]; then \
		pytest tests/ -v; \
	elif [ "$(HAS_LOCAL_VENV)" = "1" ]; then \
		$(UV) run pytest tests/ -v; \
	else \
		echo "$(RED)Virtual environment not found. Run 'make install' first.$(NC)"; \
		exit 1; \
	fi

.PHONY: format
format: ## Format code with ruff
	@echo "$(BLUE)Formatting code...$(NC)"
	@if [ "$(VENV_ACTIVATED)" = "1" ]; then \
		ruff format .; \
		echo "$(GREEN)✓ Code formatted$(NC)"; \
	elif [ "$(HAS_LOCAL_VENV)" = "1" ]; then \
		$(UV) run ruff format .; \
		echo "$(GREEN)✓ Code formatted$(NC)"; \
	else \
		echo "$(RED)Virtual environment not found. Run 'make install' first.$(NC)"; \
		exit 1; \
	fi

.PHONY: lint
lint: ## Run linting checks
	@echo "$(BLUE)Running linting checks...$(NC)"
	@if [ "$(VENV_ACTIVATED)" = "1" ]; then \
		ruff check . || true; \
	elif [ "$(HAS_LOCAL_VENV)" = "1" ]; then \
		$(UV) run ruff check . || true; \
	else \
		echo "$(RED)Virtual environment not found. Run 'make install' first.$(NC)"; \
		exit 1; \
	fi

.PHONY: check
check: test format lint ## Run all checks (test, format, lint)
	@echo "$(GREEN)✓ All checks complete!$(NC)"

.PHONY: run
run: ## Run the trace viewer locally
	@echo "$(BLUE)Starting Claude Trace Viewer...$(NC)"
	@if [ "$(VENV_ACTIVATED)" = "1" ]; then \
		claude-trace-viewer; \
	elif [ "$(HAS_LOCAL_VENV)" = "1" ]; then \
		$(UV) run claude-trace-viewer; \
	else \
		echo "$(RED)Virtual environment not found. Run 'make install' first.$(NC)"; \
		exit 1; \
	fi

.PHONY: release
release: ## Create a new release (interactive)
	@echo "$(BLUE)Starting release process...$(NC)"
	@if [ "$(VENV_ACTIVATED)" = "1" ]; then \
		python tools/release.py; \
	elif [ "$(HAS_LOCAL_VENV)" = "1" ]; then \
		$(UV) run python tools/release.py; \
	else \
		echo "$(RED)Virtual environment not found. Run 'make install' first.$(NC)"; \
		exit 1; \
	fi

.PHONY: build
build: ## Build distribution packages
	@echo "$(BLUE)Building distribution packages...$(NC)"
	@if [ "$(VENV_ACTIVATED)" = "1" ]; then \
		$(UV) pip install --upgrade build; \
		python -m build; \
		echo "$(GREEN)✓ Build complete! Packages in dist/$(NC)"; \
	elif [ "$(HAS_LOCAL_VENV)" = "1" ]; then \
		$(UV) pip install --upgrade build; \
		$(UV) run python -m build; \
		echo "$(GREEN)✓ Build complete! Packages in dist/$(NC)"; \
	else \
		echo "$(RED)Virtual environment not found. Run 'make install' first.$(NC)"; \
		exit 1; \
	fi

.PHONY: clean
clean: ## Remove build artifacts and caches
	@echo "$(BLUE)Cleaning up...$(NC)"
	@rm -rf dist/ build/ *.egg-info/
	@rm -rf .pytest_cache/ .ruff_cache/
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

.PHONY: dev
dev: install ## Alias for install
	@echo "$(GREEN)Ready for development!$(NC)"

# Install and activate helper
.PHONY: setup
setup: install ## Install and show activation command
	@echo ""
	@echo "$(GREEN)Setup complete! Now run:$(NC)"
	@echo "$(YELLOW)  source .venv/bin/activate$(NC)"
	@echo ""
	@echo "Then you can use:"
	@echo "  make test      - Run tests"
	@echo "  make run       - Start the viewer"
	@echo "  make release   - Create a new release"
