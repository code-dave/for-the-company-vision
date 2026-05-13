.PHONY: dev build test sync analyze health

dev:
	./start.sh

build:
	./scripts/build.sh

test:
	go test ./...
	npm --prefix frontend run typecheck

sync:
	go run ./cmd/vision sync

analyze:
	go run ./cmd/vision analyze

health:
	go run ./cmd/vision health

