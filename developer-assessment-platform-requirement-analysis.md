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
| Manage company problem bank | ❌ | ✅ | ✅ | ❌ | ✅ (global/curated) |
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
| `User` | id, email, passwordHash, role, companyId (nullable), provider, isActive, deletedAt | role ∈ {CANDIDATE, COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR, ADMIN}; `companyId` set for the 3 company-side roles |
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

---

## 6. Authentication & Authorization

- **Better Auth**: email/password + Google (GCP) social login.
- Bearer/JWT tokens on protected routes; role embedded in the token/session and re-verified server-side (never trust a client-supplied role).
- Middleware chain: `authenticate` → `authorize(...allowedRoles)` → `authorizeOwnership` (e.g., "is this Company the owner of this Assessment?") for resource-level checks.
- Candidates must **register/login** to attempt (the invitation grants *access to a specific assessment*, it isn't a passwordless bypass) — this keeps attempt identity, resumability, and history consistent.
- Admin is seeded, not self-registered — this is itself a business/security rule worth stating explicitly, since it affects your seed script and demo credentials.
- `Assessment Creator` and `Evaluator` accounts are provisioned only via an accepted `TeamInvitation` — a user can never self-select these roles at signup; the `Company Owner` assigns the role at invite time.

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
- Rate-limit: login attempts, invitation-sending, and submission endpoints (`express-rate-limit`, Redis-backed store).
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

## 13. Mapping to Mandatory Assignment Requirements

| Assignment requirement | How this design satisfies it |
|---|---|
| Role-based authorization | 5 roles implemented: Candidate / Company Owner / Assessment Creator / Evaluator / Admin, enforced via middleware + companyId ownership checks |
| Real payment (Stripe) | Company buys invitation credits; webhook-driven, idempotent balance updates |
| PostgreSQL + Prisma, relationships, transactions | Entities above map directly to a Prisma schema; §7 lists the transaction boundaries |
| Auth (email/password + GCP) | Better Auth with both providers |
| Soft deletes | `deletedAt` on `User`, `Problem`, `Assessment` |
| Audit logs | Append-only `AuditLog`, admin-reviewable |
| Pagination/filtering/search | Problem-bank listing and results listing are the natural candidates |
| 20+ meaningful endpoints | Auth (3) + Profile (2) + Problems CRUD (5) + Assessments CRUD/publish (5) + Invitations (2) + Attempts/Submissions (4) + Payments (3) + Admin (4) comfortably clears 20 without padding |

---

---

## 14. Timeline Fit (5-Day Plan)

Dropping real code execution (§12) and reusing the invitation pattern for team onboarding keeps the 5-role, multi-tenant design inside the original 5-day, 5–8 hr/day timeline:

| Day | Original focus | What the 5-role design adds |
|---|---|---|
| 1 | Planning & DB | `Company` and `TeamInvitation` plus 3 extra role-enum values — comparable modeling effort to the 3-role version |
| 2 | Auth & core APIs | Team-invite accept/register mirrors the candidate-invite flow already required — incremental, not doubled |
| 3 | Business logic & validation | `PENDING_REVIEW` scoring is *less* work than building a real judge would've been |
| 4 | Payment & testing | Unchanged — credits belong to `Company`, not to a specific role |
| 5 | Deployment & submission | Unchanged |

Main risk to manage: don't let 5 roles tempt scope creep into permission edge cases beyond the matrix in §2 — implement exactly that table and stop.

**Suggested next step:** turn §4 into an actual Prisma schema and a Day-1 ERD — that's the next concrete deliverable on your timeline.
