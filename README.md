# DevBench Backend

REST API for DevBench, a developer assessment platform. Companies build coding, MCQ and written problems, bundle them into timed assessments, invite candidates by email, and review results. Credits are bought through Stripe and spent one per invitation.

| | |
|---|---|
| Frontend repo | https://github.com/abdullahmamun1/devbench-frontend |
| Live API | _add after deployment_ |
| Frontend (live) | _add after deployment_ |
| Postman collection | [`DevBench-Backend.postman_collection.json`](./DevBench-Backend.postman_collection.json) |
| API plan | [`API_PLAN.md`](./API_PLAN.md) |

## Tech stack

| Area | Choice |
|---|---|
| Runtime | Node.js 20+, TypeScript, Express 5 |
| Database | PostgreSQL with Prisma 7 (split schema in `prisma/schema/`) |
| Auth | JWT access and refresh tokens in httpOnly cookies, Google Sign-In |
| Validation | Zod |
| Cache and rate limits | Upstash Redis, `@upstash/ratelimit` |
| Email | Nodemailer with EJS templates |
| Files | Multer and Cloudinary |
| Payments | Stripe Checkout and webhook |
| Tooling | tsx, tsup, Biome |
| Hosting | Vercel (`vercel.json`) |

## Roles

| Role | What they can do |
|---|---|
| `CANDIDATE` | Accept an invitation, take a timed assessment, see their results |
| `COMPANY_OWNER` | Owns a company, buys credits, manages the team, full control of assessments |
| `ASSESSMENT_CREATOR` | Company member who builds problems and assessments and sends invitations |
| `EVALUATOR` | Company member who reviews and scores pending submissions |
| `ADMIN` | Platform wide. Manages companies, users, payments, credits and audit logs |

All non-admin access is scoped to the caller's own company.

## Getting started

### Prerequisites

- Node.js 20 or newer
- A PostgreSQL database (local, Neon or Supabase)
- An Upstash Redis database
- A Stripe account in test mode, plus the Stripe CLI for local webhooks
- A Google OAuth client ID
- SMTP credentials (Gmail app password or Mailtrap) and a Cloudinary account

### Install

```bash
git clone https://github.com/abdullahmamun1/devbench-back.git
cd devbench-back
npm install
cp .env.example .env     # then fill in the values
npx prisma migrate dev
```

`npm install` runs `prisma generate` through `postinstall`.

### Run

```bash
npm run dev       # tsx watch, http://localhost:5000
npm run build     # bundle with tsup into dist/
npm run start     # run dist/server.js
npm run lint      # Biome check
npm run lint:fix
npm run format
```

All routes are mounted under `/api/v1`.

### Stripe webhook (local)

```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
```

Copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`. Test card: `4242 4242 4242 4242`, any future date, any CVC.

## Environment variables

Copy `.env.example` and fill in each value.

| Group | Variables |
|---|---|
| Server | `NODE_ENV`, `PORT`, `APP_URL` (the frontend URL, used for Stripe redirects and email links) |
| Database | `DATABASE_URL` |
| Auth | `BCRYPT_SALT_ROUNDS`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `REFRESH_TOKEN_TTL_SECONDS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| OTP | `REGISTRATION_OTP_TTL_SECONDS`, `FORGOT_PASSWORD_OTP_TTL_SECONDS` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CREDIT_PRICE_IN_CENTS` (must match the frontend `NEXT_PUBLIC_CREDIT_PRICE_CENTS`) |
| Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Invitations | `CANDIDATE_INVITATION_EXPIRES_IN_DAYS`, `TEAM_INVITATION_EXPIRES_IN_DAYS` |
| Admin stats | `PLATFORM_STATS_CACHE_KEY`, `PLATFORM_STATS_CACHE_TTL_SECONDS`, `TREND_MONTHS` |
| Seed accounts | `ADMIN_*`, `COMPANY_OWNER_*`, `COMPANY_NAME`, `ASSESSMENT_CREATOR_*`, `EVALUATOR_*`, `CANDIDATE_*` (email, password, name for each) |

Never commit `.env`.

## Seeding

The server calls `seedAllRoles()` on every start. It creates one account per role from the seed variables, and it is safe to run repeatedly.

For a fuller dataset to test the whole product, run the demo seed:

```bash
npm run seed:demo          # add demo data
npm run seed:demo:reset    # wipe demo data first, then add it again
```

> `seed:demo:reset` deletes data for the demo companies and every `.example` user. Use it on a development database only.

### What the demo seed creates

- 14 demo candidates (`firstname.lastname@demo.example`, password `Demo@1234`). One of them is suspended.
- **Acme Corp:** 11 problems, 6 assessments (draft, active and closed), 36 invitations in every status, attempts in every state, 15 submissions waiting for review, payments and credit history that add up, and 3 team invitations.
- **Globex Labs** (`owner@globex.example`), used to check that companies cannot see each other's data.
- **Initech Ltd** (`owner@initech.example`), a suspended company.
- About 150 audit log entries.

The script prints the live invitation links when it finishes.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@devbench.com | Admin@123 |
| Company owner | owner@acme.com | Owner@123 |
| Assessment creator | creator@acme.com | Creator@123 |
| Evaluator | evaluator@acme.com | Evaluator@123 |
| Candidate | candidate@test.com | Candidate@123 |
| Other demo users | any `@demo.example` | Demo@1234 |

## API overview

63 endpoints across 11 modules. Details are in [`API_PLAN.md`](./API_PLAN.md) and the Postman collection.

| Module | Base path | Endpoints |
|---|---|---|
| Auth | `/api/v1/auth` | 8 |
| Users | `/api/v1/users` | 2 |
| Companies | `/api/v1/companies` | 6 |
| Problems | `/api/v1/problems` | 5 |
| Assessments | `/api/v1/assessments` | 15 |
| Invitations | `/api/v1/invitations` | 4 |
| Attempts | `/api/v1/attempts` | 4 |
| Evaluations | `/api/v1/evaluations` | 3 |
| Payments | `/api/v1/payments` | 3 |
| Contact | `/api/v1/contact` | 1 |
| Admin | `/api/v1/admin` | 12 |

Every response uses one envelope:

```json
{ "success": true, "statusCode": 200, "message": "...", "data": {}, "meta": { "page": 1, "limit": 10, "total": 42 } }
```

### Core flows

- **Auth:** register, verify the email OTP, then log in. Tokens are httpOnly cookies. Refresh tokens rotate and are tracked in Redis, so an old token stops working at once.
- **Billing:** the owner buys credits through Stripe Checkout. The webhook is the only thing that confirms a payment and adds credits. A stale or missing pending checkout is retired automatically so the owner can always start a new one.
- **Problems:** company-owned CODING, MCQ and WRITTEN problems. Candidates only see problems inside an active attempt, with answer keys and hidden test cases removed.
- **Assessments:** `DRAFT`, `ACTIVE`, then `CLOSED`. Duration and attached problems lock once an invitation exists. Several problems can be attached at once with `POST /assessments/:id/problems/bulk`.
- **Invitations:** sending one costs one credit, taken in the same transaction as the invitation. Revoking a pending one refunds it. If the email cannot be sent, the response says so (`emailSent: false`) and nothing is lost. A failed team invite rolls back fully.
- **Attempts:** a candidate starts a timed attempt (the invitation must be accepted), saves answers, and submits. A request after the timer ends finalizes the attempt with what was saved.
- **Evaluation:** MCQ is graded automatically. CODING and WRITTEN answers with content go to a review queue. A score cannot exceed the maximum. The attempt total appears once nothing is pending.
- **Admin:** company, user and payment views, suspend and reactivate, manual credit adjustments with a reason, platform stats and monthly trends, and the audit log.

### Cross-cutting behavior

- **Company scoping:** `src/utils/scoping.ts` keeps each role inside its own company.
- **Audit log:** `src/utils/auditLog.ts` records key actions and never blocks the action it logs.
- **Rate limits (per IP, Redis):** auth routes (register, login, forgot and reset password, verify email, invitation resend) 10 per minute. Contact form 5 per hour.
- **Caching:** admin stats and trends are cached in Redis and cleared by the seed.
- **Safe email:** `trySendMail` in `src/utils/sendMailSafe.ts` turns mail failures into a flag instead of a 500.
- **Errors:** one global handler returns the standard envelope.

## Project structure

```
src/
├── app.ts                 Express app, middleware, route mounting
├── server.ts              Entry point (also seeds the role accounts)
├── config/                Environment loader
├── middleware/            auth, validateRequest, rate limits, error handling
├── modules/
│   ├── auth  user  company  problem  assessment
│   ├── invitation  attempt  evaluation  payment
│   ├── contact  admin
│   └── each: *.route.ts  *.controller.ts  *.service.ts
│            *.validation.ts (Zod)  *.interface.ts
├── templates/             EJS email templates
└── utils/                 jwt, session, scoping, auditLog, sendMailSafe,
                           sendResponse, seed, seedDemo

prisma/
└── schema/                user, company, problem, assessment, attempt,
                           audit, enums
```

## Deployment

The project is set up for Vercel through `vercel.json`.

1. Add every variable from `.env.example` to the Vercel project. Set `NODE_ENV=production` so cookies use `Secure` and `SameSite=None`.
2. Set `APP_URL` to the deployed frontend URL.
3. In the Stripe Dashboard, add a webhook endpoint for `https://<your-api>/api/v1/payments/webhook`, listen for `checkout.session.completed`, and copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Run `npx prisma migrate deploy` against the production database.
5. Optional: run `npm run seed:demo` once against the production database to load demo data.

## Known gaps

- There is no automated test suite. The API was checked by hand with the Postman collection and the demo seed.