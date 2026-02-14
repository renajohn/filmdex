IMAGE := ghcr.io/renajohn/filmdex
VERSION := $(shell node scripts/get-version.js)

.PHONY: dev run stop publish build logs status clean install

## Development
dev:                ## Start frontend + backend in dev mode
	npm run dev

install:            ## Install all dependencies
	npm run install:all

## Docker
run:                ## Start the app (pulls from GHCR)
	docker compose up -d

stop:               ## Stop the app
	docker compose down

logs:               ## Tail container logs
	docker compose logs -f

status:             ## Show container status
	docker compose ps

build:              ## Build Docker image locally
	docker compose -f docker-compose.yml -f docker-compose.dev.yml build

test:               ## Build and run locally (no push)
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

publish:            ## Push to main (CI builds and pushes to GHCR)
	git push origin main
	@echo "CI will publish $(IMAGE):$(VERSION)"
	@echo "Watch: https://github.com/renajohn/filmdex/actions"

clean:              ## Remove dist/ and stop containers
	docker compose down 2>/dev/null || true
	rm -rf dist

## Help
help:               ## Show this help
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
