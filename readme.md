# Full-Stack Monorepo Starter

A pnpm workspace monorepo template for building production-ready applications with:

- **API** — Bun + Elysia + Drizzle ORM + Better Auth
- **Web** — TanStack Start + React 19 + Tailwind CSS v4 + shadcn/ui
- **Mobile** — Expo SDK 56 + React Native 0.85

Shared as a public template so anyone can bootstrap a full-stack app with
auth, database, and two clients out of the box.

---

## Prerequisites

- [Bun](https://bun.sh) ^1.3.11
- [pnpm](https://pnpm.io) 11.1.1
- Node.js (required by Expo / Metro)

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure environment variables
cp apps/api/.env.example apps/api/.env.local
# Edit .env.local with your DATABASE_URL, BETTER_AUTH_SECRET, etc.

# Push database schema (creates tables)
pnpm --dir apps/api db:push

# Start all apps in separate terminals
pnpm dev:api      # API on http://localhost:8080
pnpm dev:web      # Web on http://localhost:3000
pnpm dev:mobile   # Expo dev server
```

---

## Monorepo Structure

```
mono-repo/
├── apps/
│   ├── api/                          Elysia + Drizzle + Better Auth
│   │   ├── src/
│   │   │   ├── app.ts                Elysia app factory
│   │   │   ├── index.ts              Entry point
│   │   │   ├── env.ts                @t3-oss/env-core validation
│   │   │   ├── db/                   Schema, migrations, connection pool
│   │   │   ├── modules/              Feature slices (customer, driver)
│   │   │   └── util/                 Auth config, response helpers
│   │   ├── tests/                    bun:test with dependency injection
│   │   └── drizzle/                  Generated SQL migrations
│   │
│   ├── web/                          TanStack Start + React 19
│   │   ├── src/
│   │   │   ├── env.ts                Server + client env vars
│   │   │   ├── lib/                  Auth client/server, utilities
│   │   │   ├── routes/               File-based TanStack Router
│   │   │   ├── components/           shadcn/ui (New York style)
│   │   │   └── integrations/         Better Auth, TanStack Query providers
│   │   └── vite.config.ts
│   │
│   └── mobile/                       Expo SDK 56 + React Native 0.85
│       ├── src/
│       │   ├── app/                  Expo Router file-based pages
│       │   ├── components/           Cross-platform + .web.tsx variants
│       │   ├── hooks/                use-color-scheme, use-theme
│       │   └── constants/            Theme tokens
│       └── app.json
│
├── packages/                         Shared libraries (coming soon)
├── pnpm-workspace.yaml               Workspace + catalog config
├── tsconfig.json                     Global path aliases
└── biome.json                        Linting and formatting
```

---

## Path Aliases

| Alias        | Resolves to            | Scope                  |
| ------------ | ---------------------- | ---------------------- |
| `@api/*`     | `apps/api/src/*`       | API imports            |
| `#web/*`     | `apps/web/src/*`       | Web (root tsconfig)    |
| `@mobile/*`  | `apps/mobile/src/*`    | Mobile (root tsconfig) |
| `@/assets/*` | `apps/mobile/assets/*` | Mobile assets          |

---

## Environment Variables

Environment variables are validated at runtime using `@t3-oss/env-core` + Zod.

### API (`apps/api/.env.local`)

| Variable             | Required | Description                |
| -------------------- | -------- | -------------------------- |
| `DATABASE_URL`       | Yes      | PostgreSQL connection      |
| `BETTER_AUTH_SECRET` | Yes      | Auth signing secret        |
| `BETTER_AUTH_URL`    | Yes      | Public API base URL        |
| `PORT`               | No       | Server port (default 8080) |

### Web (`apps/web/.env.local`)

| Variable         | Required | Description       |
| ---------------- | -------- | ----------------- |
| `SERVER_URL`     | No       | Server-side URL   |
| `VITE_APP_TITLE` | No       | Browser tab title |

Copy `.env.example` → `.env.local` for each app. All `*.local` and `.env`
files are gitignored.

---

## Scripts

Root scripts delegate to each app:

| Command            | Action                          |
| ------------------ | ------------------------------- |
| `pnpm dev:api`     | Start API dev server            |
| `pnpm dev:web`     | Start web dev server            |
| `pnpm dev:mobile`  | Start Expo dev server           |
| `pnpm test:api`    | Run API tests                   |
| `pnpm test:web`    | Run web tests                   |
| `pnpm check:api`   | Typecheck API (tsc --noEmit)    |
| `pnpm db:generate` | Generate Drizzle migration      |
| `pnpm db:push`     | Push Drizzle schema to database |
| `pnpm build:api`   | Build API binary                |
| `pnpm build:web`   | Build web for production        |

---

## Testing

| App    | Runner     | Pattern                        |
| ------ | ---------- | ------------------------------ |
| API    | `bun test` | DI-based unit tests with mocks |
| Web    | `bun test` | not yet configured             |
| Mobile | —          | Not yet configured             |

API tests run with `bun test --env-file=.env.local`. Services accept injected
dependencies, making them fully mockable without a database.

---

## Project Conventions

- **Database tables**: snake_case, singular names (e.g. `customer`, `driver`)
- **IDs**: internal `id` is never exposed; use NanoID `public_id` for external references
- **API auth**: Better Auth mounted via Elysia `.mount()`, principal type stored as user additional field
- **Migrations**: always generated with `drizzle-kit generate` — never hand-write SQL
- **Linting/formatting**: Biome 2.x — run `pnpm --dir apps/web check`

---

## Contributing

Contributions are welcome. Please adhere to the conventions above and ensure
`pnpm check:api` and relevant tests pass before opening a PR.

---

## License

MIT
