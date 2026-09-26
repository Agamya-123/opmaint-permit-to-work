# Opmaint PTW Module - Technical Architecture

## 1. System Overview

This stack implements a clean, decoupled architecture:
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js + Express.js + TypeScript
- **Database:** PostgreSQL accessed via Prisma ORM
- **Authentication:** JWT-based stateless authentication

The monorepo structure keeps client and server isolated but deployable together if needed.

## 2. Directory Structure (Monorepo)

```text
/
├── client/                 # React frontend
│   ├── src/
│   │   ├── api/            # Axios interceptors and API calls
│   │   ├── components/     # Reusable UI (Buttons, Modals, StatusBadges)
│   │   ├── features/       # Feature-based modules (ptw, auth)
│   │   │   ├── ptw/        # PTW-specific logic (types, checklists)
│   │   ├── hooks/          # Custom React hooks (e.g., useAuth)
│   │   ├── types/          # Shared TypeScript interfaces
│   │   └── utils/          # Helpers (date formatting, etc.)
├── server/                 # Express backend
│   ├── src/
│   │   ├── controllers/    # Route handlers
│   │   ├── middlewares/    # Auth, RBAC, error handling, validation
│   │   ├── models/         # State machine logic, enums (Prisma abstracts most)
│   │   ├── routes/         # Express route definitions
│   │   ├── services/       # Core business logic (approvals, lifecycles)
│   │   └── utils/          # Audit log helpers, PDF generators, etc.
│   └── prisma/             # Schema & migrations
└── docs/                   # Documentation
```

## 3. Database Schema (Prisma ORM)

The core challenge is balancing generic CMMS data with highly specific Permit-type data. We solve this using a hybrid approach: strongly typed columns for shared fields, and a `JSONB` column for type-specific checklists.

### Core Entities

**1. User**
- `id`, `name`, `email`, `password_hash`
- `role` Enum: `REQUESTER | AREA_OWNER | SAFETY_OFFICER | ADMIN`
- `plant_id` (Users are scoped to a plant)

**2. Location & Hierarchy**
- **Plant:** `id`, `name`
- **Area:** `id`, `name`, `plant_id`
- **Asset/Equipment:** `id`, `name`, `tag`, `area_id`

**3. Permit**
- `id` (UUID), `ptw_number` (String, e.g., "PTW-2023-001")
- `type` Enum: `HOT_WORK | CONFINED_SPACE | HEIGHT | LOTO`
- `status` Enum: `DRAFT | PENDING_APPROVAL | APPROVED | ACTIVE | SUSPENDED | REJECTED | CANCELLED | EXPIRED | CLOSED | CLOSED_VERIFIED`
- `requester_id` (FK to User)
- `area_id`, `equipment_id` (FK to location)
- `planned_start`, `planned_end` (Timestamps)
- `description`, `hazards` (String/Array)
- `type_data` (JSONB) — *Crucial: Prevents schema sprawl.*
  - *Hot Work:* `{ "fireWatch": "Auth-ID", "lelPercent": 0, "radiusClear": 10 }`
  - *Confined Space:* `{ "o2Percent": 20.9, "standbyPerson": "Auth-ID" }`
- `closure_notes` (String)

**4. Approval**
- `id`, `permit_id`
- `approver_id` (FK to User)
- `type` Enum: `AREA_OWNER | SAFETY_OFFICER`
- `status` Enum: `PENDING | APPROVED | REJECTED`
- `comment` (String)
- `timestamp`

**5. AuditLog (Immutable)**
- `id`, `permit_id`, `actor_id`
- `event` Enum: `CREATED | SUBMITTED | APPROVED | REJECTED | ACTIVATED | SUSPENDED | CLOSED | EXPIRED_BY_CRON`
- `details` (JSONB - stores from/to states)
- `timestamp`

## 4. State Machine Enforcement

The state machine is enforced in the `server/src/services/permitService.ts` layer.
- **Rule:** A `DRAFT` can only transition to `PENDING_APPROVAL` (submit) or `CANCELLED`.
- **Rule:** An `ACTIVE` permit can only transition to `CLOSED`, `SUSPENDED`, or `EXPIRED`.
Transitions must be atomic. A request to activate a permit must check the current DB state, verify `status === APPROVED` and all required approvals exist, before writing `status = ACTIVE` and inserting an `AuditLog`.

## 5. Security & RBAC

- **Authentication:** Stateless JWT stored in an HttpOnly cookie (or Authorization header for mobile/API clients). 
- **Authorization (Backend Middleware):**
  - `requireRole(['SAFETY_OFFICER', 'ADMIN'])`
  - Resource-level checks: The `Area Owner` can only approve if `user.role === AREA_OWNER` AND `permit.area.owners.includes(user.id)`.
  - Self-Approval Check: `if (permit.requester_id === req.user.id) throw 403 Forbidden` (Even if the user is an Admin/Safety Officer).

## 6. Background Jobs (The Expiry Problem)

Permits must expire when their `planned_end` passes. Since users might just close their browser, we cannot rely on the frontend to expire a permit.
- **Lazy Evaluation:** On every GET request (e.g. `GET /api/permits/:id`), check if `planned_end < now()` and `status` is non-terminal. If true, mutate to `EXPIRED` before returning.
- **Cron Job:** Run a lightweight node-cron task every 5 minutes: `UPDATE permits SET status = 'EXPIRED' WHERE planned_end < NOW() AND status IN ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUSPENDED')`.
