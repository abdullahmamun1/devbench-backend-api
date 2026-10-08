# DevBench Backend

REST API for DevBench, a developer assessment platform. Companies build coding, multiple-choice and written problems, bundle them into timed assessments, invite candidates by email and review the results. Invitations are paid with credits bought through Stripe Checkout.

The frontend lives in a separate repository (`devbench-frontend`).

## Tech stack

| Area | Choice |
|---|---|
| Runtime | Node.js 20+, TypeScript, Express 5 |
| Database | PostgreSQL with Prisma 7 (split schema in `prisma/schema/`) |
| Auth | JWT access and refresh tokens in httpOnly cookies, Google Sign-In (`google-auth-library`) |
| Validation | Zod |
| Cache and rate limits | Upstash Redis, `@upstash/ratelimit` |
| Email | Nodemailer with EJS templates |
| Files | Multer and Cloudinary |
| Payments | Stripe Checkout and webhook |
| Tooling | Biome, tsup, tsx |

## Roles

| Role | What they can do |
|---|---|
| `CANDIDATE` | Accepts invitations and takes timed assessments |
| `COMPANY_OWNER` | Owns a company. Billing, team, problems, assessments, invitations and reviews |
| `ASSESSMENT_CREATOR` | Company team member. Builds problems and assessments, sends invitations, reviews |
| `EVALUATOR` | Company team member. Reviews and scores submissions, can view problems and assessments |
| `ADMIN` | Platform wide. Manages companies and candidates, reads audit logs, adjusts credits |

## Getting started

### Prerequisites

- Node.js 20 or newer
- A PostgreSQL database (local, Neon or Supabase)
- An Upstash Redis instance
- A Stripe account in test mode
- A Google OAuth client ID (for Google sign-in)
- SMTP credentials (Mailtrap or a Gmail app password) and a Cloudinary account

### Install

```bash
git clone <repo-url>
cd DevBench-backend
npm install        # also runs `prisma generate`
cp .env.example .env
```

Fill in `.env`. Every variable is explained in `.env.example`.

### Database

```bash
npx prisma migrate dev
```

### Run

```bash
npm run dev        # tsx watch with hot reload
npm run build      # bundle with tsup
npm run start      # run dist/server.js
```

The API listens on `PORT` (default 5000) and mounts everything under `/api/v1`.

### Demo accounts

The server creates one account per role the first time it starts (`seedAllRoles` runs on every start and skips accounts that exist). Values come from the seed variables in `.env`.

| Role | Email | Password |
|---|---|---|
| Admin | admin@devbench.com | Admin@123 |
| Company owner | owner@acme.com | Owner@123 |
| Assessment creator | creator@acme.com | Creator@123 |
| Evaluator | evaluator@acme.com | Evaluator@123 |
| Candidate | candidate@test.com | Candidate@123 |

The creator and evaluator join the owner's company, and the company starts with 10 credits.

### Stripe webhook (local)

Credits are added only when Stripe's webhook confirms a payment.

```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```

Copy the `whsec_...` value it prints into `STRIPE_WEBHOOK_SECRET`. Test card: `4242 4242 4242 4242`, any future date, any CVC.

## API overview

62 endpoints in 11 modules. Details are in [`API_PLAN.md`](./API_PLAN.md) and the importable Postman collection [`DevBench-Backend.postman_collection.json`](./DevBench-Backend.postman_collection.json).

| Module | Base path | Endpoints | Notes |
|---|---|---|---|
| Auth | `/auth` | 8 | register, verify-email, login, google, refresh-token, forgot-password, reset-password, logout |
| Users | `/users` | 2 | `GET` and `PATCH /me` |
| Companies | `/companies` | 6 | create, `/me`, credits, team invite, team accept |
| Problems | `/problems` | 5 | CRUD for coding, MCQ and written problems |
| Assessments | `/assessments` | 15 | CRUD, attach and detach problems, publish, close, invite, resend, list invitations, results, start attempt |
| Invitations | `/invitations` | 4 | my invitations, preview and accept by token, revoke |
| Attempts | `/attempts` | 4 | my attempts, attempt detail, save answer, final submit |
| Evaluations | `/evaluations` | 3 | pending queue, detail, grade |
| Payments | `/payments` | 3 | create checkout session, webhook, history |
| Admin | `/admin` | 11 | companies, candidates, suspend and reactivate, delete user, audit logs, stats, trends, credit adjustment |
| Contact | `/contact` | 1 | public contact form |

### Core flows

- **Auth.** Register, verify the emailed 6-digit code, then log in. Refresh tokens are rotated and stored in Redis, so an old token stops working immediately.
- **Billing.** The owner buys credits through Stripe Checkout. The webhook is the only thing that credits the company.
- **Problems.** Company-scoped. Candidates never read the problem bank. They see problems only inside an active attempt, with answer keys and hidden test cases removed.
- **Assessments.** `DRAFT`, then `PUBLISHED`, then `CLOSED`. Duration and attached problems lock once any invitation exists.
- **Invitations.** Sending one debits a credit in the same transaction as the invitation. Revoking a pending invitation refunds it.
- **Attempts.** A candidate starts a timed attempt, saves answers per problem and submits. A request after the deadline finalizes the attempt with what was saved.
- **Evaluation.** MCQ is graded automatically. Coding and written answers wait in a review queue until an evaluator scores them. A grade is final.
- **Admin.** Suspend and reactivate companies and users, soft-delete users, adjust credits. Every action is audit logged.

### Cross-cutting behavior

- **Company scoping.** `resolveCompanyScope` and `requireCompanyId` (`src/utils/scoping.ts`) keep non-admin roles inside their own company.
- **Audit log.** `writeAuditLog` (`src/utils/auditLog.ts`) records key actions and never blocks the action if logging fails.
- **Rate limiting** (Redis, per IP):

  | Limiter | Limit | Applied to |
  |---|---|---|
  | `auth` | 10 per minute | register, login, forgot-password, reset-password, invitation resend |
  | `contact` | 5 per hour | contact form |

- **Caching.** `GET /admin/stats` and `/admin/stats/trends` are cached in Redis for `PLATFORM_STATS_CACHE_TTL_SECONDS`.
- **Responses.** Every response uses the envelope `{ success, statusCode, message, data, meta? }` (`src/utils/sendResponse.ts`). Errors go through `src/middleware/globalErrorHandler.ts`.
- **Cookies.** `httpOnly`. In production they are `secure` with `SameSite=None`, so the frontend must call the API over HTTPS.

## Project structure

```
src/
  app.ts            Express setup, middleware, route mounting
  server.ts         Entry point, connects the database and seeds demo users
  config/           Environment loader
  lib/              prisma, redis, stripe, nodemailer, google auth
  middleware/       auth, rateLimiter, validateRequest, notFound, globalErrorHandler
  modules/          one folder per feature
                    (controller, service, route, validation, interface)
  templates/        EJS email templates
  utils/            jwt, session, scoping, auditLog, seed, sendResponse
prisma/
  schema/           user, company, problem, assessment, attempt, audit, enums
  migrations/
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Bundle to `dist/` |
| `npm run start` | Run the bundle |
| `npm run lint` and `npm run lint:fix` | Biome check |
| `npm run format` | Biome format |

## Known gaps

- No automated test suite. Behavior was checked by hand with the Postman collection and through the frontend.
- If the mail server is down, candidate invitations are still created and the response reports `emailSent: false` so the invitation can be resent. Team invitations are rolled back and return an error.

## Deployment

Configured for Vercel (`vercel.json`). Set every variable from `.env.example` in the project settings, set `APP_URL` to the deployed frontend URL, and register `https://<api-host>/api/v1/payments/webhook` as a Stripe webhook endpoint.