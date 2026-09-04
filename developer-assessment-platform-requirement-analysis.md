# DevBench — Requirement Analysis

**Developer Assessment & Coding Platform**
**Category:** Education / Recruitment
**Assignment:** B7A6 Backend Project

---

## 1. Problem & Solution

**Problem:** Companies need a reliable way to screen developer candidates at scale before an interview — beyond a resume — using standardized coding/MCQ/written tests, without manually tracking spreadsheets of invites, deadlines, and scores.

**Solution:** A backend platform where companies build a reusable problem bank, compose problems into timed assessments, invite candidates by email, and get automatically-scored, comparable results and reports — while candidates get a single place to accept invites, take timed attempts, and see their outcome.

**Core value loop:** Company creates problems → composes an assessment → invites candidates → candidates attempt under a timer → system scores the attempt → company reviews results/reports → makes a hiring decision.

---

## 2. Users & Roles

| Role | Represents |
|---|---|
| **Candidate** | Takes assessments they're invited to |
| **Company Owner** | Registers the company/org, manages billing & credits, manages the team |
| **Assessment Creator** | Company team member — builds the problem bank, composes/publishes assessments, invites candidates |
| **Evaluator** | Company team member — reviews `PENDING_REVIEW` submissions, adds feedback, can override auto-scores |
| **Admin** | Platform owner — governs companies, sees global data; seeded, not self-registerable |

`Company Owner`, `Assessment Creator`, and `Evaluator` all belong to the same `Company` tenant (via `companyId`) — this makes the platform genuinely multi-tenant with per-company teams, not just single-user ownership.

### Permission matrix

| Action | Candidate | Company Owner | Assessment Creator | Evaluator | Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Register/login (email or Google) | ✅ | ✅ | ❌ (invited only) | ❌ (invited only) | ❌ (seeded only) |
| Invite team members | ❌ | ✅ | ❌ | ❌ | ❌ |
| View company problem bank (read) | ❌ (only via active attempt) | ✅ | ✅ | ✅ (read-only) | ✅ (all + global) |
| Create/edit/delete problems (write) | ❌ | ✅ | ✅ | ❌ | ✅ (global/curated only) |
| Create/publish assessment | ❌ | ✅ | ✅ | ❌ | ❌ |
| Invite candidates | ❌ | ✅ | ✅ | ❌ | ❌ |
| Attempt an assessment | ✅ (if invited) | ❌ | ❌ | ❌ | ❌ |
| Review/grade a submission | ❌ | ✅ | ❌ | ✅ | ❌ |
| View own attempt result | ✅ (own only) | ❌ | ❌ | ❌ | ❌ |
| View assessment results/report | ❌ | ✅ | ✅ (own assessments) | ✅ (assigned) | ✅ (all) |
| Purchase credits (Stripe) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Suspend a company/candidate | ❌ | ❌ | ❌ | ❌ | ✅ |
| View audit logs / platform stats | ❌ | ❌ | ❌ | ❌ | ✅ |

Admin accounts are **not self-registerable** — seeded via migration/seed script, which is also where you'll produce the mandatory demo admin credentials. `Assessment Creator` and `Evaluator` accounts are likewise never self-registered — they're created by accepting a **team invitation** from a Company Owner (mirrors the candidate-invitation flow, just scoped to team membership instead of assessment access).

---

## 3. Core Workflows

**Company Owner workflow**
1. Register/login → create the company/org
2. Purchase invitation credits (Stripe) — a shared pool for the whole team
3. Invite team members as Assessment Creator or Evaluator (team-invitation token, mirrors candidate invites)
4. Has superset access to everything below, plus manages billing and the team roster

**Assessment Creator workflow**
1. Accept team invite → login
2. Build problem bank (CODING / MCQ / WRITTEN problems, each with points and, for CODING, test cases; for MCQ, options with a correct flag)
3. Create an assessment (title, duration, passing score) and attach problems with per-problem point weights
4. Publish the assessment (must have ≥1 problem to publish)
5. Invite candidates by email (consumes 1 credit from the company's shared balance per invite)

**Evaluator workflow**
1. Accept team invite → login
2. See submissions flagged `PENDING_REVIEW` for the company's assessments
3. Score/grade manually, leave feedback, finalize the result

**Candidate workflow**
1. Receive invite (email with token link)
2. Register/login if not already a user
3. Accept invite → attempt becomes available within its time window
4. Start attempt → server timer starts (source of truth, not the client clock)
5. Answer problems, submit per-problem or all-at-once
6. Auto-submit on time expiry
7. View result once the company allows/results are released

**Admin workflow**
1. Review/approve or suspend company accounts
2. View platform-wide stats and audit logs
3. Manage a shared/global problem bank companies can optionally use
4. Handle support actions: manual credit adjustment, refunds (all logged)

---

## 4. Database Entities & Relationships

```
Company ──1:N── User (role: COMPANY_OWNER | ASSESSMENT_CREATOR | EVALUATOR)
   │
   ├──1:N── TeamInvitation
   ├──1:N── Problem ──1:N── TestCase
   │            └──1:N── McqOption
   ├──1:N── Assessment ──N:N(AssessmentProblem)── Problem
   │            ├──1:N── Invitation
   │            └──1:N── Attempt
   ├──1:N── Payment
   └──1:N── CreditTransaction

User (role: CANDIDATE) ──1:1── CandidateProfile ──1:N── Attempt ──1:N── Submission ──1:1── SubmissionResult

AuditLog references any actor (User) + any entity, independently
```

| Entity | Key fields | Notes |
|---|---|---|
| `User` | id, email, passwordHash (nullable — null for Google-only accounts), role, companyId (nullable), provider (CREDENTIALS/GOOGLE), googleId (nullable), emailVerified, isActive, status, deletedAt | role ∈ {CANDIDATE, COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR, ADMIN}; `companyId` set for the 3 company-side roles |
| `Company` | id, companyName, creditBalance, deletedAt | the tenant/org — owns problems, assessments, and the shared credit balance |
| `TeamInvitation` | id, companyId, email, role (ASSESSMENT_CREATOR/EVALUATOR), token, status, expiresAt | mirrors candidate `Invitation`, scoped to team membership instead of assessment access |
| `CandidateProfile` | id, userId (1:1), headline, resumeUrl, skills[] | |
| `Problem` | id, companyId (nullable = admin/global), type, title, points, deletedAt | type ∈ {CODING, MCQ, WRITTEN} |
| `TestCase` | id, problemId, input, expectedOutput, isHidden, weight | only for CODING |
| `McqOption` | id, problemId, text, isCorrect | only for MCQ |
| `Assessment` | id, companyId, title, durationMinutes, passingScore, status, deletedAt | status ∈ {DRAFT, PUBLISHED, CLOSED} |
| `AssessmentProblem` | assessmentId, problemId, order, points | join table, unique (assessmentId, problemId) |
| `Invitation` | id, assessmentId, candidateEmail, candidateId, token, status, expiresAt | unique (assessmentId, candidateEmail) |
| `Attempt` | id, assessmentId, candidateId, status, startedAt, expiresAt, totalScore | unique (assessmentId, candidateId) |
| `Submission` | id, attemptId, problemId, answer/code, language, submittedAt | unique (attemptId, problemId) |
| `SubmissionResult` | id, submissionId, score, maxScore, status, feedback | status ∈ {PASSED, FAILED, PARTIAL, PENDING_REVIEW} |
| `Payment` | id, companyId, stripeSessionId, amount, status, creditsPurchased | idempotency key = stripeSessionId |
| `CreditTransaction` | id, companyId, type, amount, balanceAfter, referenceId | type ∈ {PURCHASE, DEDUCTION, REFUND} |
| `AuditLog` | id, actorId, actorRole, action, entityType, entityId, metadata, createdAt | append-only |

**Indexing candidates:** `User.email`, `Invitation.token`, `Invitation(assessmentId, candidateEmail)`, `Attempt(assessmentId, candidateId)`, `Problem.companyId`, `AuditLog.entityType, entityId`.

---

## 5. Business Rules

- A candidate gets **exactly one attempt** per assessment (`unique(assessmentId, candidateId)`), enforced at the DB level, not just app logic.
- An assessment can only be **published** if it has ≥1 attached problem.
- Once an assessment has at least one attempt with status ≠ `NOT_STARTED`, its problems/duration become locked — only metadata (title/description) stays editable, to keep scoring fair and comparable.
- **1 invitation = 1 credit**, deducted at send time. A company cannot send an invite with `creditBalance ≤ 0`.
- Invitation tokens are single-use and expire after a configurable window (e.g., 7 days).
- Deleting a `Problem` or `Assessment` is always a **soft delete** (`deletedAt`) — never hard-deleted, since past `Submission`/`AssessmentProblem` rows must remain valid historical records.
- Score = Σ(problem points × pass ratio) across all problems in the attempt, computed once on submission and never recalculated retroactively if problems change later.
- Only users belonging to the owning `Company` can read that company's `Problem`, `Assessment`, `Invitation`, and `Attempt` data (row-level `companyId` check in every query, not just at the route level) — but only `Company Owner` and `Assessment Creator` can *write* Problems/Assessments/Invitations, and only `Company Owner` and `Evaluator` can write `SubmissionResult` overrides.
- Only the `Company Owner` can send team invitations, purchase credits, or manage billing — `Assessment Creator` and `Evaluator` cannot touch the company's Stripe/credit data even though they share the same tenant.
- Candidates never hit `GET /problems` or `GET /problems/:id` directly — problem content (statement, options, or test cases minus hidden ones) is delivered only through the active-attempt endpoints, scoped to problems attached to that specific assessment, so nothing is browsable ahead of time.

---

## 6. Authentication & Authorization

- **Custom JWT auth** (access + refresh tokens, delivered as httpOnly cookies and in the response body) — not Better Auth, which was scoped out during implementation due to Express 5 wildcard-routing and cookie/CORS-ordering issues that made bridging its session model into the rest of the app more invasive than it was worth.
- **Email/password registration is OTP-gated**: `/auth/register` creates the user immediately with `emailVerified: false` and emails a 6-digit OTP; `/auth/verify-email` confirms it and returns tokens. `/auth/login` rejects an unverified account with `403`. Re-registering an already-unverified email resends a fresh OTP rather than failing outright, so a mistyped/expired OTP doesn't permanently lock someone out of their own email.
- **Google (GCP) social login** is verified server-side via `google-auth-library` against the ID token the frontend obtains from Google (`POST /auth/google`) — not an OAuth redirect flow. Logs in an existing user (linking `googleId`, and auto-verifying their email if they'd registered by password first but never completed OTP verification) or registers a new one; `role`/`companyName` are accepted the same way as password registration, but only apply the first time a given Google account is seen.
- **Forgot/reset password** (`/auth/forgot-password`, `/auth/reset-password`) is OTP-based (5-minute TTL) and blocked for Google-only accounts (no `passwordHash` to reset), verified/suspended/deleted accounts, matching the same gating rules as login.
- Bearer/JWT tokens on protected routes; role embedded in the token/session and re-verified server-side (never trust a client-supplied role).
- Middleware chain: `authenticate` → `authorize(...allowedRoles)` → `authorizeOwnership` (e.g., "is this Company the owner of this Assessment?") for resource-level checks.
- Candidates must **register/login** to attempt (the invitation grants *access to a specific assessment*, it isn't a passwordless bypass) — this keeps attempt identity, resumability, and history consistent.
- Admin is seeded, not self-registered — this is itself a business/security rule worth stating explicitly, since it affects your seed script and demo credentials.
- `Assessment Creator` and `Evaluator` accounts are provisioned only via an accepted `TeamInvitation` — a user can never self-select these roles at signup; the `Company Owner` assigns the role at invite time. Accepting an invitation (team or candidate) creates the user with `emailVerified: true` directly, since receiving and clicking the invite link already proves control of that email — no separate OTP step for that path.

---

## 7. Transaction Boundaries

Wrap these in a single DB transaction each — they're exactly the "prevent race conditions" cases the assignment calls out:

1. **Publish assessment**: validate ≥1 problem attached + flip status, atomically.
2. **Send invitation**: check `creditBalance > 0` → decrement balance → create `Invitation` → write `CreditTransaction`, all-or-nothing (prevents two concurrent invite requests from overspending the same last credit).
3. **Submit attempt**: create/update `Submission` rows → compute `SubmissionResult`s → update `Attempt.totalScore` and status, atomically.
4. **Stripe webhook**: verify signature → check `Payment` isn't already `SUCCEEDED` (idempotency, since Stripe retries webhooks) → mark succeeded → increment `creditBalance` → write `CreditTransaction`, atomically.

---

## 8. Caching Strategy (Redis)

- Cache a company's problem-bank listing (invalidate on create/update/delete).
- Cache published assessment public metadata (title, duration) shown on the invite-landing page.
- **Attempt timer as source of truth**: store `attempt:{id}:expiresAt` in Redis (or just trust the DB `expiresAt` column) and check it server-side on every submission — never trust the client's remaining-time display.
- Rate-limit: login/register/forgot-password/reset-password attempts, invitation-sending, and submission endpoints (`@upstash/ratelimit`, Redis-backed store).
- Cache admin/company dashboard aggregates with a short TTL (e.g., 5 min) since they're expensive `GROUP BY` queries.

---

## 9. Admin Operations

- List/search/suspend companies and candidates.
- View global audit logs and platform-wide stats (companies, candidates, assessments run, revenue).
- Maintain a shared/global problem bank (`Problem.companyId = null`) companies can optionally reuse.
- Manually adjust a company's credit balance or process a refund — always writing an `AuditLog` entry.

---

## 10. Analytics & Reporting

- **Company dashboard**: completion rate, average score, score distribution, and per-problem pass rate for each assessment.
- **Per-candidate report**: score breakdown per problem, which test cases passed/failed.
- **Admin dashboard**: revenue over time (from `Payment`), active companies, candidate growth, most-used problems/tags.

---

## 11. Edge Cases

- Candidate opens an invite link after it's expired → `410 Gone`, not a generic error.
- Candidate refreshes/reopens the attempt mid-way → resumes from the server-stored `expiresAt`, never restarts the timer.
- Two tabs submit the same problem → second write is an idempotent no-op or rejected (`unique(attemptId, problemId)`).
- Client's clock says time remains but server `expiresAt` has passed → server rejects/late-marks the submission; client timer is cosmetic only.
- Company tries to edit problems/duration on an assessment that already has attempts in progress → blocked (see business rules).
- Stripe webhook delivered twice (Stripe's own retry behavior) → second delivery is a no-op via the idempotency check.
- Company invites the same candidate email to the same assessment twice → unique constraint triggers an "already invited, resend?" flow instead of a duplicate row.
- Company soft-deletes a problem that's already used in a past assessment → historical `AssessmentProblem`/`Submission` rows stay intact; it just disappears from the "create new assessment" picker.

---

## 12. Coding Assessment Evaluation: Manual Review

Real sandboxed code execution (isolated per-submission containers, running against test cases with strict timeouts) is out of scope for this build — it's the highest-risk, most time-consuming piece to get right and secure, and isn't worth it on a 5-day solo timeline.

MCQ and simple WRITTEN answers are auto-graded on submit. CODING submissions are marked `PENDING_REVIEW`; an Evaluator reviews the code manually via a "grade submission" endpoint, assigns a score against the problem's point value, and can leave feedback to finalize the result. This still demonstrates a complete evaluation *workflow* — submission → review → score → result — without the security surface of executing untrusted code.

If you want to revisit real execution later, it's a clean addition on top: point it at the same `SubmissionResult` model, just populated automatically instead of by an Evaluator.

---

