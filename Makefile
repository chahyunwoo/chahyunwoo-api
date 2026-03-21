.PHONY: install dev build migrate migrate-dev migrate-create test lint hash-password up down logs

install:
	pnpm install

dev:
	pnpm start:dev

build:
	pnpm build

migrate:
	pnpm db:migrate

migrate-dev:
	pnpm db:migrate:dev

migrate-create:
	@read -p "Migration name: " name; pnpm db:migrate:dev --name "$$name"

generate:
	pnpm db:generate

test:
	pnpm test:cov

lint:
	pnpm lint

# Generate bcrypt hash for ADMIN_PASSWORD_HASH
# Usage: make hash-password PASSWORD=yourpassword
hash-password:
	@node -e "const b=require('bcryptjs');console.log(b.hashSync('$(PASSWORD)',12))"

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api

studio:
	pnpm db:studio
