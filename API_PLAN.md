# API Plan — DevBench Platform

**Total endpoints:** 72 across 13 route modules (exceeds 20+ requirement)

---

## Authentication (9 endpoints)

Custom JWT auth (access + refresh tokens, delivered as httpOnly cookies and in the response body). No Better Auth — Google sign-in is verified directly via `google-auth-library` against the ID token the frontend obtains from Google, then bridged into the same JWT pair as every other login path.

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Creates the user immediately (`emailVerified: false`), creates the Company in the same transaction if `role: COMPANY_OWNER`, emails a 6-digit OTP. Returns `{ email, otpExpiresInSeconds }` — no tokens yet |
| POST | `/auth/verify-email` | Public | Verifies the OTP, sets `emailVerified: true`, sends the welcome email, returns tokens |
| POST | `/auth/resend-otp` | Public | Sends a fresh 6-digit verification code to an unverified account. 60-second cooldown per email on top of the auth rate limit; the response is identical whether or not the email exists, so it can't be used to discover accounts |
| POST | `/auth/login` | Public | Email/password login — rejects with `403` if `emailVerified` is `false`, the account is `SUSPENDED`, or the account's company is `SUSPENDED` |
| POST | `/auth/google` | Public | Verifies a Google ID token server-side; logs in an existing user (linking `googleId` + auto-verifying if they registered by password first) or registers a new one (`role`/`companyName` optional in the payload, only applied on first sign-in) |
| POST | `/auth/forgot-password` | Public | Emails a 6-digit OTP (5 min TTL) for a verified, non-Google account |
| POST | `/auth/reset-password` | Public | Verifies the OTP and sets a new password; sends a confirmation email |
| POST | `/auth/refresh-token` | Public (valid refresh token required) | Rotates the refresh token — issuing a new one invalidates the previous one immediately via a Redis-backed check, not just on natural expiry |
| POST | `/auth/logout` | Authenticated | Revokes the stored refresh token server-side and clears both auth cookies |

Registering with an email that already has an unverified account resends a fresh OTP and refreshes name/password rather than rejecting. Forgot/reset-password and register/login are all rate-limited (`rateLimiter("auth")`, 10 req/min per IP) to prevent email-bombing.

---

## User & Profile (2 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET | `/users/me` | Authenticated | Own profile with nested `candidateProfile`/`company` |
| PATCH | `/users/me` | Authenticated | Update `name`; upserts `candidateProfile` fields for `CANDIDATE` role only |

---

## Company Management (7 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/companies` | Authenticated, no existing company | Self-serve company creation, promotes caller to `COMPANY_OWNER` |
| GET | `/companies/me` | COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR | Company profile + team member list |
| GET | `/companies/me/activity` | COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR | Dashboard charts: invitations sent and attempts submitted per month for the last 6 months (bucketed by start month, zero-filled), outcomes of submitted attempts (`passed`/`failed`/`awaitingReview` against each assessment's passing score) and the average graded score by problem type |
| PATCH | `/companies/me` | COMPANY_OWNER | Update company name |
| GET | `/companies/credits` | COMPANY_OWNER | Credit balance + last 20 `CreditTransaction` rows |
| POST | `/companies/team/invite` | COMPANY_OWNER | Invite an `ASSESSMENT_CREATOR`/`EVALUATOR` by email |
| POST | `/companies/team/accept/:token` | Public (optional auth) | Accept for an existing logged-in user, or register-on-accept for a new one |

---

## Problem Bank (5 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/problems` | ADMIN, COMPANY_OWNER, ASSESSMENT_CREATOR | Create CODING/MCQ/WRITTEN problem with nested test cases/options |
| GET | `/problems` | ADMIN, COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR | Paginated, filterable by `type`/`search` — company-scoped |
| GET | `/problems/:id` | Same as above | Single problem detail |
| PATCH | `/problems/:id` | ADMIN, COMPANY_OWNER, ASSESSMENT_CREATOR | Update; company-scoped (non-admin can't touch another company's problem) |
| DELETE | `/problems/:id` | ADMIN, COMPANY_OWNER, ASSESSMENT_CREATOR | Soft delete; company-scoped |

`CANDIDATE` cannot reach any Problem Bank route directly — candidates only ever see problems through an active `Attempt`, with answer keys and hidden test cases stripped.

---

## Assessments (10 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/assessments` | ADMIN, COMPANY_OWNER, ASSESSMENT_CREATOR | Create in `DRAFT` status |
| GET | `/assessments` | + EVALUATOR | Paginated, filterable by `status`, `search` matches the title (case-insensitive) |
| GET | `/assessments/:id` | + EVALUATOR | Detail with ordered `assessmentProblems` |
| PATCH | `/assessments/:id` | ADMIN, COMPANY_OWNER, ASSESSMENT_CREATOR | Update — `durationMinutes` locked once any invitation exists |
| DELETE | `/assessments/:id` | Same | Soft delete |
| POST | `/assessments/:id/problems` | Same | Attach a problem with `order`/`points` — locked once any invitation exists |
| DELETE | `/assessments/:id/problems/:problemId` | Same | Detach — same lock |
| POST | `/assessments/:id/publish` | Same | `DRAFT` → `PUBLISHED`; rejects zero attached problems or re-publishing |
| POST | `/assessments/:id/close` | Same | `PUBLISHED` → `CLOSED`; stops new invitations/attempts from starting, does not interrupt attempts already in progress |
| GET | `/assessments/:id/results` | + EVALUATOR | Aggregate per-candidate results (`totalScore`, `passed`) across every attempt on this assessment; `passed` stays `null` while a candidate's score is still pending evaluation |

---

## Invitations (7 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/assessments/:id/invitations` | ADMIN, COMPANY_OWNER, ASSESSMENT_CREATOR | Send — requires `PUBLISHED` assessment, atomically debits 1 credit |
| GET | `/assessments/:id/invitations` | Same | List, filterable by `status`, `search` matches the candidate email (case-insensitive) |
| POST | `/assessments/:id/invitations/:invitationId/resend` | Same | Regenerates token + 7-day expiry, re-sends the email — only while still `PENDING` |
| PATCH | `/assessments/:id/invitations/:invitationId/revoke` | Same | Cancels a still-`PENDING` invitation and refunds the spent credit |
| GET | `/invitations/accept/:token` | Public | Preview assessment title/duration before accepting |
| POST | `/invitations/accept/:token` | Public (optional auth) | Accept for an existing logged-in candidate, or register-on-accept for a new one |
| GET | `/invitations/me` | CANDIDATE | List the caller's own invitations (matched by linked `candidateId` or their email) |

Sending is a single race-safe transaction: atomic `updateMany` credit debit, `Invitation` creation, `CreditTransaction` write, then the email is sent *outside* the transaction so a slow/failed send never rolls back a successful debit.

---

## Attempts & Submissions (6 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/assessments/:id/attempts/start` | CANDIDATE | Starts or resumes; requires an `ACCEPTED` invitation; `expiresAt` computed server-side once |
| GET | `/attempts/:id` | CANDIDATE (own attempt only) | Detail with problems (answer keys/hidden test cases stripped), remaining time, own submissions |
| POST | `/attempts/:id/submissions` | Same | Per-problem answer upsert; payload shape validated and rejected if it doesn't match the problem's `type` |
| POST | `/attempts/:id/submit` | Same | Final submit — grades every attached problem, auto-grades MCQ, flags CODING/WRITTEN with content as `PENDING_REVIEW` |
| GET | `/attempts/me` | CANDIDATE | List the caller's own attempts across all assessments, each with `maxScore` (sum of problem points) and the assessment's `passingScore`, for the candidate score charts |
| POST | `/attempts/:id/events` | CANDIDATE (own, in-progress attempt) | Batched exam-integrity events (`TAB_HIDDEN`, `TAB_VISIBLE`, `PASTE` with `chars`, `QUESTION_VIEWED`), max 50 per request and 2,000 per attempt. Timestamps are clamped to the attempt window; events over the cap or for problems outside the assessment are dropped, never rejected, so logging can't interrupt an exam. Returns `{ accepted, dropped }` |

Any attempt-touching request made after `expiresAt` has passed **auto-finalizes** the attempt with whatever was submitted, rather than rejecting and discarding it — the specific late action is still refused, nothing already answered is lost.

---

## Insights (5 endpoints)

Deterministic analysis, no LLM and no external service. Company-scoped like evaluations; admins see all companies.

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET | `/insights/attempts/:id/signals` | ADMIN, COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR | Summarises an attempt's integrity events: tab switches, total and longest time away, paste count and size, and per-question paste counts and viewing time. `hasSignals: false` for attempts recorded before signal logging existed |
| GET | `/insights/submissions/:id/similarity` | Same | Compares a CODING or WRITTEN answer with every other answer to the same problem in the company using winnowing (the MOSS technique). Names, formatting and comments are ignored; fingerprints shared by 3+ submissions (or 30% on large pools) are treated as common code. Returns the top 3 matches with score, level (`high` ≥ 70, `review` ≥ 40) and matching line ranges for both sides. MCQ returns `applicable: false`; answers under 25 code tokens or 15 words are `comparable: false`. Cached in Redis for 10 minutes |
| GET | `/insights/assessments/:id` | Same | Ranking of fully graded attempts (ties share a rank, percentile = share of others beaten), 10-bucket score histogram, average and pass rate. With 5+ graded attempts, item analysis per question: difficulty (average share of points earned) and discrimination (top 27% minus bottom 27%), flagged when discrimination < 0.2 or difficulty is above 0.9 or below 0.2 |
| GET | `/insights/attempts/:id` | Same | One attempt in context: rank and percentile, score by problem type (graded answers only), time per question from signals, and a plain-language summary built from fixed templates |
| GET | `/insights/assessments/:id/suggestions` | ADMIN, COMPANY_OWNER, ASSESSMENT_CREATOR (standard rate limit) | **Smart assessment builder.** Query: `minutes` (5–600, defaults to the assessment's duration), `coding`/`mcq`/`written` (0–100 share of the time, at least one > 0; default 50/30/20) and `difficulty` (`easier` \| `balanced` \| `harder`). Plans the time left after a 10% buffer and the already attached problems. Each bank problem (company + global, not attached) gets a time: the median of real `QUESTION_VIEWED` timings once 3+ candidates have answered it, otherwise an estimate from type and points. It gets a difficulty from its average graded score once there are 5+ answers (easy ≥ 70%, medium ≥ 40%, else hard). Types are filled largest share first with a 0/1 knapsack over whole minutes (up to 15% over a share, unused minutes carry to the next type, max 50 picks), preferring problems that match the difficulty. Returns `picks[]` with `minutes`, `minutesSource`, `difficulty` and a plain-language `reason`, per-type totals and `notes`. Read-only: attach the picks with `POST /assessments/:id/problems/bulk` |

---

## Public (1 endpoint)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET | `/public/stats` | Public (standard rate limit) | Platform totals for the landing page: problems, published assessments, completed attempts, graded answers, active companies. Aggregate counts only, cached in Redis for `PLATFORM_STATS_CACHE_TTL_SECONDS` |

---

## Evaluation (3 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET | `/evaluations/pending` | ADMIN, COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR | Paginated `PENDING_REVIEW` queue, company-scoped, oldest-first. Filters: `type` (`CODING` \| `WRITTEN`, other values ignored) and `search` (candidate name or email, or assessment title) |
| GET | `/evaluations/:id` | Same | Full detail for review — hidden test cases and `isCorrect` intentionally visible here |
| PATCH | `/evaluations/:id` | Same | Sets `score`/`status`/`feedback`; grading is final, no re-grade; recomputes the parent attempt's `totalScore` |

---

## Payments (3 endpoints)

Stripe Checkout, card-only. Company's `Payment` row created as `PENDING` before redirecting; the webhook is the sole source of truth for marking it `SUCCEEDED`.

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/payments/create-session` | COMPANY_OWNER | Creates a Stripe Checkout session for a `credits` quantity at a server-computed unit price; reuses an existing open session instead of creating duplicates |
| POST | `/payments/webhook` | Public (Stripe-signature verified, no JWT) | Handles `checkout.session.completed` (credits the company, race-safe via an atomic `updateMany` status guard) and `checkout.session.expired` (marks a still-`PENDING` payment `FAILED`) |
| GET | `/payments/history` | COMPANY_OWNER | Paginated list of the caller's company's payments, filterable by `status` (`PENDING` \| `SUCCEEDED` \| `FAILED`, other values ignored) |

A successful payment sends a confirmation email (best-effort, doesn't block the transaction if delivery fails) and writes an `AuditLog` entry attributed to the company's `COMPANY_OWNER`.

---

## Admin (9 endpoints)

The one module with no company-scoping — `ADMIN` legitimately sees across the whole platform. Every route behind `auth("ADMIN")`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/admin/companies` | Paginated, searchable list of all companies |
| PATCH | `/admin/companies/:id/suspend` | Sets `Company.status = SUSPENDED`, blocking login for every member going forward |
| GET | `/admin/candidates` | Paginated, searchable list of all candidates |
| PATCH | `/admin/candidates/:id/suspend` | Sets `User.status = SUSPENDED` |
| PATCH | `/admin/users/:id/suspend` | Role-agnostic version — suspends any account type (`COMPANY_OWNER`, `ASSESSMENT_CREATOR`, `EVALUATOR`, `ADMIN`), not just candidates. Self-suspension blocked |
| DELETE | `/admin/users/:id` | Soft delete (`isDeleted`, `deletedAt`, `status: DELETED`) for any account type. Self-deletion blocked |
| GET | `/admin/audit-logs` | Filterable by `entityType`/`entityId`, paginated |
| GET | `/admin/stats` | Company/candidate counts, assessments run, revenue — cached 5 minutes in Redis |
| POST | `/admin/credits/adjust` | Signed `amount` (+/-) adjustment with a required `reason`; blocks a resulting negative balance; writes both a `CreditTransaction` (`type: ADJUSTMENT`) and an `AuditLog` entry |

Suspension blocks login going forward but does not revoke already-issued access tokens — consistent with the app's stateless-JWT stance elsewhere (refresh tokens *are* revocable, per the Auth section above, but access tokens are short-lived and not individually tracked).

---

## Summary

| Category | Count |
|---|---|
| Authentication | 9 |
| User & Profile | 2 |
| Company Management | 6 |
| Problem Bank | 5 |
| Assessments | 10 |
| Invitations | 7 |
| Attempts & Submissions | 6 |
| Evaluation | 3 |
| Payments | 3 |
| Admin | 9 |
| Insights | 4 |
| Public | 1 |
| **Total** | **65** |

---

## Implementation Notes

**Authorization pattern**: every module-level `ICallerInfo` carries `role` (and `userId`, `companyId` where relevant). Non-`ADMIN` company-scoped reads/writes go through a shared `resolveCompanyScope`/`requireCompanyId` helper (`src/utils/scoping.ts`) rather than each module reinventing the check — this is what closed several cross-company IDOR issues found during review (Problem Bank writes, Assessment problem-attach) before they shipped.

**Audit logging**: a shared `writeAuditLog` helper (`src/utils/auditLog.ts`) wraps its own errors internally so a logging failure can never block or roll back the business action it's recording. Covered actions: `ASSESSMENT_PUBLISHED`/`CLOSED`, `ASSESSMENT_CREATED`/`UPDATED`, `PROBLEM_CREATED`/`UPDATED`/`DELETED`, `PROBLEM_ATTACHED_TO_ASSESSMENT`/`DETACHED`, `INVITATION_SENT`/`ACCEPTED`/`REVOKED` (both team and candidate), `COMPANY_CREATED`/`UPDATED`, `TEAM_MEMBER_INVITED`, `PASSWORD_RESET`, `ATTEMPT_SUBMITTED`/`AUTO_SUBMITTED_ON_EXPIRY`, `SUBMISSION_GRADED`, `PAYMENT_SUCCEEDED`, `COMPANY_SUSPENDED`, `CANDIDATE_SUSPENDED`, `USER_SUSPENDED`, `USER_DELETED`, `CREDIT_ADJUSTED`.

**Rate limiting** (`@upstash/ratelimit`, Redis-backed):
- `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`: 10 requests/minute per IP.
- No rate limiting currently on `/assessments/:id/invitations/:invitationId/resend` — a known gap (can be spammed at zero credit cost), flagged for a follow-up rather than blocking.

**Caching** (Redis):
- `GET /admin/stats`: 5-minute TTL.

**Schema decisions made during implementation**:
- `Submission.selectedOptionId` — a proper FK to `McqOption`, added instead of overloading `answerText` for MCQ answers.
- `Company.status` (`ACTIVE | SUSPENDED`) — added specifically to give Admin's suspend action something meaningful to write to.
- `CreditTransactionType.ADJUSTMENT` — added so manual admin credit changes are distinguishable from real purchases/deductions/refunds in transaction history.
- `@@index` added on `SubmissionResult.status` and `Assessment.companyId` — both are filtered on heavily (Evaluation's pending queue, every company-scoped Assessment read) and had no index through most of development; closed as part of the code review pass.
- `AttemptStatus` simplified from 4 values to 2 (`IN_PROGRESS | SUBMITTED`) — `NOT_STARTED` and `EXPIRED` were audited and found completely unreachable (attempts are always created already `IN_PROGRESS`; expiry auto-submits rather than locking to a dead `EXPIRED` state) and removed rather than left as dead schema.
**Known gaps, not silently missing**: no automated test suite exists.
