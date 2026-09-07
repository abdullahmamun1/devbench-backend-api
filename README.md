# DevBench — Developer Assessment & Coding Platform

A backend-only REST API for a hiring assessment platform: companies create coding/MCQ/written problems, bundle them into assessments, invite candidates, and review timed attempts — with credit-based billing via Stripe.

Built for the B7A6 backend course assignment. No frontend; the API is exercised via Postman/Thunder Client.

## Tech Stack

- **Runtime**: Node.js, TypeScript, Express 5
- **Database**: PostgreSQL + Prisma ORM (7)
- **Auth**: Custom JWT (access + refresh, httpOnly cookies) + Google Sign-In via `google-auth-library`
- **Validation**: Zod
- **Caching / Rate limiting**: Upstash Redis + `@upstash/ratelimit`
- **Email**: Nodemailer + EJS templates
- **File storage**: Multer + Cloudinary
- **Payments**: Stripe Checkout
- **Linting/formatting**: Biome
- **Deployment**: Vercel

## Roles

Five roles instead of a flat 3, to model a real hiring org:

| Role | Scope |
|---|---|
| `CANDIDATE` | Takes assessments via invitation |
| `COMPANY_OWNER` | Owns a company, manages billing/team, full assessment control |
| `ASSESSMENT_CREATOR` | Company team member — builds problems/assessments, sends invitations |
| `EVALUATOR` | Company team member — reviews and scores pending submissions |
| `ADMIN` | Platform-wide — no company scoping, manages companies/candidates/audit logs |

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL database (local or hosted, e.g. Neon/Supabase)
- Upstash Redis instance
- Stripe account (test mode is fine)
- Google OAuth Client ID (for social login)
- SMTP credentials (e.g. Mailtrap, Gmail app password) and a Cloudinary account

### Installation

```bash
git clone <repo-url>
cd DevBench-backend
npm install
```

`npm install` runs `prisma generate` automatically via `postinstall`.

### Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`
- `BCRYPT_SALT_ROUNDS`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM`
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`
- `INVITATION_EXPIRES_IN_DAYS`
- Seed credentials (`ADMIN_EMAIL`/`ADMIN_PASSWORD`, `COMPANY_OWNER_EMAIL`/..., `CANDIDATE_EMAIL`/..., `ASSESSMENT_CREATOR_EMAIL`/..., `EVALUATOR_EMAIL`/...) — one demo user per role

### Database setup

```bash
npx prisma migrate dev
npx tsx src/utils/seed.ts
```

The seed script creates one demo account per role (credentials from the `.env` seed variables above), so every role can be demoed immediately after setup.

### Run

```bash
npm run dev      # local dev server with hot reload (tsx watch)
npm run build    # bundle with tsup
npm run start    # run the built output (dist/server.js)
```

By default the server listens on `PORT` (5000) and mounts all routes under `/api/v1`.

### Linting

```bash
npm run lint
npm run lint:fix
npm run format
```

## API Overview

58 endpoints across 10 modules (full detail in [`API_PLAN.md`](./API_PLAN.md); importable Postman collection: [`DevBench-Backend.postman_collection.json`](./DevBench-Backend.postman_collection.json)).

| Module | Base path | Endpoints |
|---|---|---|
| Auth | `/api/v1/auth` | 8 |
| Users | `/api/v1/users` | 2 |
| Companies | `/api/v1/companies` | 6 |
| Problems | `/api/v1/problems` | 5 |
| Assessments | `/api/v1/assessments` | 10 |
| Invitations | `/api/v1/invitations` | 7 |
| Attempts | `/api/v1/attempts` | 5 |
| Evaluations | `/api/v1/evaluations` | 3 |
| Payments | `/api/v1/payments` | 3 |
| Admin | `/api/v1/admin` | 9 |

### Core flows

- **Auth**: register → email OTP verification → login (JWT access + refresh, httpOnly cookies) or Google Sign-In; refresh-token rotation is Redis-backed to invalidate old tokens immediately.
- **Company & billing**: a `COMPANY_OWNER` buys credits via Stripe Checkout; the webhook is the sole source of truth for confirming payment and crediting the company.
- **Problem Bank**: company-scoped CODING/MCQ/WRITTEN problems; candidates never query this directly — they only see problems through an active attempt, with answer keys and hidden test cases stripped.
- **Assessments**: `DRAFT` → `PUBLISHED` → `CLOSED` lifecycle; structural edits (duration, attached problems) lock once any invitation exists.
- **Invitations**: sending debits one credit atomically in the same transaction as the invitation write; revoking a pending invitation refunds it.
- **Attempts & submissions**: candidates start a timed attempt, submit per-problem answers, and finalize; requests made after expiry auto-finalize with whatever was submitted rather than being rejected outright.
- **Evaluation**: MCQ auto-grades; CODING/WRITTEN submissions with content go to a `PENDING_REVIEW` queue for an `EVALUATOR`/creator to score (final, no re-grade).
- **Admin**: platform-wide company/candidate/user management, audit log viewing, and manual credit adjustments — all logged.

### Cross-cutting behavior

- **Company scoping**: a shared `resolveCompanyScope`/`requireCompanyId` helper (`src/utils/scoping.ts`) enforces that non-admin roles can only touch their own company's data.
- **Audit logging**: a shared `writeAuditLog` helper (`src/utils/auditLog.ts`) records key actions (assessment/problem/invitation lifecycle, payments, suspensions, credit adjustments) without ever blocking the action it logs if logging itself fails.
- **Rate limiting**: `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password` are limited to 10 requests/minute per IP (Redis-backed).
- **Caching**: `GET /admin/stats` is cached for 5 minutes in Redis.
- **Response format**: all responses go through a standardized JSON envelope (`src/utils/sendResponse.ts`), with centralized error handling (`src/middleware/globalErrorHandler.ts`).

## Project Structure

```
src/
├── app.ts                # Express app setup, middleware, route mounting
├── server.ts              # Entry point
├── config/                # Env config loader
├── middleware/             # auth, validateRequest, error handling, notFound
├── modules/
│   ├── auth/               user/               company/
│   ├── problem/             assessment/         invitation/
│   ├── attempt/             evaluation/         payment/
│   └── admin/
│       each module: *.controller.ts, *.service.ts, *.route.ts,
│                    *.validation.ts (Zod), *.interface.ts
├── templates/              # EJS email templates (OTP, welcome, payment success...)
└── utils/                 # jwt, session, scoping, auditLog, seed, sendResponse

prisma/
└── schema/                 # split Prisma schema: user, company, problem,
                             # assessment, attempt, audit, enums
```

## Known Gaps

- No automated test suite — verified manually via the Postman collection.
- `/assessments/:id/invitations/:invitationId/resend` is not currently rate-limited (can be resent at zero credit cost).

## Deployment

Configured for Vercel (`vercel.json`). Set all environment variables from `.env.example` in the Vercel project settings, and point `STRIPE_WEBHOOK_SECRET` at a webhook endpoint registered for the deployed `/api/v1/payments/webhook` URL.