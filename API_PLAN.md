# API Plan — DevBench Platform

**Total endpoints:** 27 (exceeds 20+ requirement)

All routes versioned under `/api/v1/`

---

## Authentication (3 endpoints)

Better Auth handles the OAuth flows internally. These are our custom endpoints:

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Email/password registration (creates CANDIDATE or COMPANY_OWNER) |
| POST | `/auth/login` | Public | Email/password login, returns session |
| POST | `/auth/logout` | Authenticated | Clear session |

Better Auth provides at `/api/v1/auth/*`:
- `/auth/sign-in/google` — Google OAuth start
- `/auth/callback/google` — Google OAuth callback
- `/auth/session` — Get current session

---

## User & Profile (3 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET | `/users/me` | Authenticated | Get own profile |
| PATCH | `/users/me` | Authenticated | Update own profile (name, headline) |
| PATCH | `/users/me/resume` | CANDIDATE | Upload resume (multipart, Cloudinary) |

---

## Company Management (3 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/companies` | Authenticated | Register a new company (becomes COMPANY_OWNER) |
| GET | `/companies/me` | COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR | Get own company details + credit balance |
| POST | `/companies/team/invite` | COMPANY_OWNER | Invite team member (ASSESSMENT_CREATOR or EVALUATOR role) |

---

## Problem Bank (5 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/problems` | COMPANY_OWNER, ASSESSMENT_CREATOR | Create problem (CODING/MCQ/WRITTEN + test cases/options) |
| GET | `/problems` | COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR | List company problems (paginated, filterable by type, search by title) |
| GET | `/problems/:id` | COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR | Get problem details |
| PATCH | `/problems/:id` | COMPANY_OWNER, ASSESSMENT_CREATOR | Update problem |
| DELETE | `/problems/:id` | COMPANY_OWNER, ASSESSMENT_CREATOR | Soft-delete problem |

---

## Assessments (5 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/assessments` | COMPANY_OWNER, ASSESSMENT_CREATOR | Create assessment (DRAFT) |
| GET | `/assessments` | COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR | List company assessments (paginated, filterable by status) |
| GET | `/assessments/:id` | COMPANY_OWNER, ASSESSMENT_CREATOR, EVALUATOR | Get assessment with attached problems |
| PATCH | `/assessments/:id` | COMPANY_OWNER, ASSESSMENT_CREATOR | Update assessment (locked once attempts exist) |
| POST | `/assessments/:id/publish` | COMPANY_OWNER, ASSESSMENT_CREATOR | Publish assessment (transaction: validate ≥1 problem) |

---

## Invitations (2 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/invitations` | COMPANY_OWNER, ASSESSMENT_CREATOR | Send candidate invitation (transaction: check/deduct credits) |
| POST | `/invitations/accept/:token` | CANDIDATE | Accept invitation (public link with token) |

---

## Attempts & Submissions (4 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/attempts/:assessmentId/start` | CANDIDATE | Start attempt (creates Attempt, sets timer) |
| GET | `/attempts/:id` | CANDIDATE (own only) | Get attempt with problems and remaining time |
| POST | `/attempts/:id/submit` | CANDIDATE | Submit answers for one or all problems (transaction: create Submissions + compute SubmissionResults + update totalScore) |
| GET | `/attempts/:id/result` | CANDIDATE (own only) | View result after company releases it |

---

## Evaluation (2 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET | `/evaluations/pending` | COMPANY_OWNER, EVALUATOR | List PENDING_REVIEW submissions for company |
| POST | `/evaluations/:submissionId/grade` | COMPANY_OWNER, EVALUATOR | Grade CODING submission (score, feedback) |

---

## Payments (3 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| POST | `/payments/create-session` | COMPANY_OWNER | Create Stripe checkout session for credit purchase |
| POST | `/payments/webhook` | Public (Stripe) | Stripe webhook (transaction: verify signature → mark succeeded → increment credits) |
| GET | `/payments/history` | COMPANY_OWNER | List company payments |

---

## Admin (7 endpoints)

| Method | Route | Roles | Purpose |
|---|---|---|---|
| GET | `/admin/companies` | ADMIN | List all companies (paginated, search) |
| PATCH | `/admin/companies/:id/suspend` | ADMIN | Suspend company |
| GET | `/admin/candidates` | ADMIN | List all candidates (paginated, search) |
| PATCH | `/admin/candidates/:id/suspend` | ADMIN | Suspend candidate |
| GET | `/admin/audit-logs` | ADMIN | View audit logs (filterable by entityType, entityId) |
| GET | `/admin/stats` | ADMIN | Platform stats (companies, candidates, assessments run, revenue) |
| POST | `/admin/credits/adjust` | ADMIN | Manually adjust company credit balance (writes AuditLog) |

---

## Summary

| Category | Count |
|---|---|
| Authentication | 3 |
| User & Profile | 3 |
| Company Management | 3 |
| Problem Bank | 5 |
| Assessments | 5 |
| Invitations | 2 |
| Attempts & Submissions | 4 |
| Evaluation | 2 |
| Payments | 3 |
| Admin | 7 |
| **Total** | **27** |

---

## Implementation Notes

### Pagination
- Use query params: `?page=1&limit=10`
- Apply to: `/problems`, `/assessments`, `/admin/companies`, `/admin/candidates`, `/admin/audit-logs`

### Filtering
- `/problems`: `?type=CODING`
- `/assessments`: `?status=PUBLISHED`
- `/admin/audit-logs`: `?entityType=User&entityId=xxx`

### Search
- `/problems`: `?search=algorithm` (searches `title` and `description`)
- `/admin/companies`: `?search=acme`
- `/admin/candidates`: `?search=john@example.com`

### Soft Deletes
- DELETE endpoints set `deletedAt`, never hard-delete
- Queries filter `WHERE deletedAt IS NULL` by default

### Rate Limiting (via @upstash/ratelimit)
- `/auth/login`: 5 requests / 15 minutes per IP
- `/invitations`: 10 requests / hour per company
- `/attempts/:id/submit`: 30 requests / minute per attempt (prevent spam during timer)

### Response Format
All endpoints return:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": {},
  "meta": { "page": 1, "limit": 10, "total": 42 }  // pagination only
}
```

Errors:
```json
{
  "success": false,
  "statusCode": 400,
  "name": "ValidationError",
  "message": "Invalid request",
  "errorDetails": [{"field": "email", "message": "Invalid email"}]
}
```

### Authentication
- Protected routes require `Authorization: Bearer <token>` header or `accessToken` cookie
- Role enforcement via `auth(...roles)` middleware
- Ownership checks (e.g., company A can't read company B's problems) in service layer

### Edge Cases Covered
- Expired invite token → `410 Gone`
- Duplicate invite (same email + assessment) → `400 Bad Request` with "already invited" message
- Submit after timer expires → `400 Bad Request` "attempt expired"
- Edit assessment with active attempts → `400 Bad Request` "assessment locked"
- Send invite with 0 credits → `400 Bad Request` "insufficient credits"
