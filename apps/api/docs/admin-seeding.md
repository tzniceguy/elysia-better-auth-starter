# Admin Seeding & Staff Registration — Implementation Plan

## Overview

API uses a model where **staff (including admins) do not self-register**. Access to the platform's internal/operator surface is provisioned by administrators. This feature delivers two mechanisms:

1. **Admin bootstrap seed** — a one-time script that creates the first admin account per environment.
2. **Admin-only register-staff endpoint** — lets an existing admin onboard additional staff programmatically.

Together they remove any public self-signup path for staff, enforcing that all staff accounts are created by an admin.

---

## Scope

| # | Piece | Location |
|---|-------|----------|
| 1 | Bootstrap admin seed script | `apps/api/scripts/seed-admin.ts` |
| 2 | Admin guard (`adminOnly` macro) | `apps/api/src/plugins/guards/admin-guard.ts` |
| 3 | Register-staff service | `apps/api/src/modules/staff/register/service.ts` |
| 4 | Register-staff routes | `apps/api/src/modules/staff/register/routes.ts` |
| 5 | Wiring into the staff app | `apps/api/src/modules/staff/index.ts` |
| 6 | Script registration (`seed:admin`) | `apps/api/package.json` + root `package.json` |
| 7 | Service unit tests (mock db) | `apps/api/tests/modules/staff/register/service.test.ts` |

---

## Prerequisites (already present in the scaffold)

- Better Auth configured with `database: drizzleAdapter` (email + password).
- `staffGuard` (`src/plugins/guards/staff-guard.ts`) deriving `user`/`staffSession`, with a `staffOnly` macro.
- Auth `user` table with `principalType` and `staffRole` columns; `staff` profile table with `role` and `status`.
- `generateId` helper (`src/utils/id-generate`) and `nanoid` for `publicId` (`stf_${nanoid(12)}`).
- `ok`/`fail` response helpers (`src/lib/http.ts`) and response-schema convention (`src/lib/response-schema.ts`).
- `./.env.local` at `apps/api` (the `test` script already loads it via `bun test --env-file=.env.local`).

---

## Implementation

### 1. Bootstrap admin seed — `scripts/seed-admin.ts`

- Constants: `ADMIN_EMAIL = "admin@makazi.local"`, `ADMIN_PASSWORD = "admin123"`, `ADMIN_NAME`, `ADMIN_PHONE`.
- **Idempotency**: before creating anything, query for an existing `user` row with `ADMIN_EMAIL`; if found, log and exit (runs once per environment, never duplicates).
- Seed the admin:
  1. `auth.api.signUpEmail({ body: { name, email, password, principalType: "staff" } })`.
  2. Update the created `user` row: `staffRole = "admin"`.
  3. Insert a `staff` row: `role: "admin"`, `status: "active"`, `fullName`, `phoneNumber`.
  4. If the insert returns no row, roll back by `auth.api.deleteUser({ id })` and throw.
- Exit codes: `0` on success, `1` on failure (with error logged).

### 2. Admin guard — `plugins/guards/admin-guard.ts`

- Composes `staffGuard` (inherits `staffSession` derivation) and adds an `adminOnly` macro.
- `adminOnly` logic: unchanged if disabled; else return `403` when there is no `staffSession`, and `403` when `staffSession.role !== "admin"`.

### 3. Register-staff service — `modules/staff/register/service.ts`

- Exposed entry point: `registerStaff(adminStaffId, adminRole, input)`.
  - `adminStaffId` is currently unused (kept for audit/future use); the effective gate is `adminRole`.
- **Validation & authorization**:
  - If `adminRole !== "admin"` → `403 FORBIDDEN` ("Only admins can register staff.").
  - If any of `email`, `password`, `fullName`, `phoneNumber` is missing → `400 STAFF_REGISTER_REQUIRED`.
- **Provisioning flow** (in a try/catch):
  1. `signUpEmail({ body: { name, email, password, principalType: "staff" } })`.
  2. `db.update(user).set({ staffRole: staffRoleFromUserRole(input.role) })`.
  3. `db.insert(staff).values({ ..., role: input.role, status: "active" })`.
  4. If no row returned → `deleteUser(id)` rollback, `500 STAFF_REGISTER_FAILED`.
- **Role mapping** (`staffRoleFromUserRole`): `zone_manager` → `operations` (Better Auth user-level role); `admin` → `admin`.
- **Error mapping**: duplicate email → `409 EMAIL_IN_USE` (detected via `USER_ALREADY_EXISTS` / `EMAIL_ALREADY_EXISTS` / `422`); anything else → `500 STAFF_REGISTER_FAILED`.
- **Dependency injection** to keep it unit-testable without a DB: `db`, `signUpEmail`, `deleteUser` are injected; defaults resolve to the real `@api/db`/`auth.api`.

### 4. Register-staff routes — `modules/staff/register/routes.ts`

- Prefix: `/v1/app/staff`, tag `staff-register`.
- `POST /register` — body `{ email, password, fullName, phoneNumber, role }` where `role` is `"zone_manager" | "admin"`.
- Guard chain: `.use(adminGuard).guard({ adminOnly: true }, ...)`.
- Handler: if no `staffSession` → `403`; else call `service.registerStaff(staffSession.staffId, staffSession.role, body)`; map failures to `fail(code, message)` with the error status; return `ok(result.data)` on success.
- Response codes: `200` (staff schema), `400`, `403`, `409`, `500`.

### 5. Wiring — `modules/staff/index.ts`

- Import `createStaffRegisterRoutes`/`createStaffRegisterService` + `StaffRegisterService` type.
- Accept `staffRegisterService` in the services bag (defaults to `createStaffRegisterService()`).
- `.use(createStaffRegisterRoutes(staffRegisterService))` alongside the other staff modules.

### 6. Script registration

- `apps/api/package.json`: `"seed:admin": "bun run scripts/seed-admin.ts"`.
- Root `package.json`: `"seed:admin": "pnpm --dir apps/api seed:admin"`.

### 7. Service unit tests — `tests/modules/staff/register/service.test.ts`

- Rely on a hand-rolled **mock db** (thenable builder queueing results per `kind.table`, capturing `insert`/`update`/`deleteUser` calls) plus injected `signUpEmail`/`deleteUser`.
- Coverage:
  - Registers a `zone_manager` and sets user `staffRole = "operations"`.
  - Registers an `admin` and sets user `staffRole = "admin"`.
  - Rejects non-admin callers with `FORBIDDEN` (no staff insert performed).
  - Rejects missing required fields with `STAFF_REGISTER_REQUIRED`.
  - Returns `EMAIL_IN_USE` when sign-up throws a duplicate-email error.
  - Cleans up the auth user (`deleteUser` called) when the staff insert returns no row.

---

## Verification

```bash
# Type check
pnpm --dir apps/api typecheck

# Seed the first admin (once per environment)
pnpm seed:admin

# Run the api test suite (loads .env.local)
pnpm --dir apps/api test
```

Expected: typecheck passes; all register-staff service tests pass as part of the API suite.

---

## Key Design Decisions & Tradeoffs

1. **No self-registration for staff.** The only creation paths are the seed script (first admin) and the admin-only endpoint (everyone else). This centralizes provisioning and avoids exposing a public staff signup.
2. **`adminGuard` composes `staffGuard`.** Reuses session derivation and adds a single `adminOnly` macro, so admin-enforcement is explicit and consistent across future admin routes.
3. **Guard in the service, not only the route.** The service independently checks `adminRole !== "admin"`, so authorization is enforced even outside the HTTP guard layer.
4. **Rollback on partial failure.** If the staff-profile insert fails, the created auth user is deleted to avoid orphaned auth accounts.
5. **Mock-db test strategy.** The service takes injected `db`/`signUpEmail`/`deleteUser`, enabling full coverage without a running database or Better Auth server.
6. **Role mapping.** The platform `staff.role` (`zone_manager` | `admin`) is mapped onto the Better Auth `user.staffRole` (`operations` | `admin`) to keep the shared auth table staff-role-agnostic.
7. **Hardcoded seed credentials.** For local/bootstrap simplicity the first admin uses fixed default credentials; an environment-aware approach (env var override) is a possible follow-up but out of scope for the initial seed.
