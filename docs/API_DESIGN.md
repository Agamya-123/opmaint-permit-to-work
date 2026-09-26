# Opmaint PTW Module - API Design Specification

All endpoints expect `Content-Type: application/json` and return standard JSON error structures.

## Error Response Format
```json
{
  "error": true,
  "code": "INVALID_STATE_TRANSITION",
  "message": "Cannot activate a permit that is in PENDING_APPROVAL state.",
  "details": null
}
```

---

## 1. Authentication & Users (`/api/auth`)

### `POST /api/auth/login`
- **Body:** `{ "email": "safety@opmaint.com", "password": "..." }`
- **Response:** `{ "token": "JWT...", "user": { "id": "123", "role": "SAFETY_OFFICER" } }`

### `GET /api/auth/me`
- Returns current logged-in user profile & role.

---

## 2. Permit Core Operations (`/api/permits`)

### `POST /api/permits` (Create Draft)
- **Role:** `REQUESTER`, `ADMIN`
- **Body:**
```json
{
  "type": "HOT_WORK",
  "area_id": "area-101",
  "equipment_id": "eq-505",
  "description": "Welding bracket on line 2",
  "planned_start": "2026-09-27T08:00:00Z",
  "planned_end": "2026-09-27T16:00:00Z",
  "hazards": ["FLAMMABLE_VAPOR"],
  "ppe": ["FIRE_SUIT", "GOGGLES"],
  "type_data": {
    "fire_watch": "John Doe",
    "lel_percent": 0.0,
    "combustibles_radius_m": 10
  }
}
```
- **Response:** `201 Created` with Permit object (Status: `DRAFT`).

### `POST /api/permits/:id/submit` (Submit for Approval)
- **Role:** Requester (must be the permit creator)
- **State Check:** `DRAFT` -> `PENDING_APPROVAL`
- **Effects:** Creates `PENDING` approvals for the Area Owner & Safety Officer.

### `GET /api/permits` (List & Filter)
- **QueryParams:** `status`, `type`, `area_id`, `expiring_soon=true`
- **Response:** Array of permits with basic metadata.

### `GET /api/permits/:id` (Get Detail)
- **Effects:** Triggers lazy-expiry check before returning.

---

## 3. Approval Operations (`/api/permits/:id/approve`)

### `POST /api/permits/:id/approve`
- **Role:** `AREA_OWNER` or `SAFETY_OFFICER`
- **Body:** `{ "comment": "Atmosphere tested, safe to proceed." }`
- **Pre-conditions:**
  - `requester_id != current_user_id` (No self-approval!)
  - User has explicit rights to approve (e.g. is area owner of this area).
- **Effects:** Updates the approval record to `APPROVED`. If ALL required approvals are complete, updates Permit status to `APPROVED`.

### `POST /api/permits/:id/reject`
- **Role:** `AREA_OWNER` or `SAFETY_OFFICER`
- **Body:** `{ "reason": "LEL reading is missing." }` (Reason is mandatory)
- **Effects:** Permit immediately transitions to `REJECTED` (Terminal state).

---

## 4. Lifecycle Controls (`/api/permits/:id/state`)

### `POST /api/permits/:id/activate`
- **Role:** Requester, Safety Officer, Admin
- **State Check:** `APPROVED` -> `ACTIVE`
- **Pre-conditions:** `NOW() >= planned_start` and `NOW() < planned_end`.

### `POST /api/permits/:id/suspend`
- **Role:** `SAFETY_OFFICER`, `ADMIN`
- **Body:** `{ "reason": "Gas leak detected nearby." }`
- **State Check:** `ACTIVE` -> `SUSPENDED`

### `POST /api/permits/:id/resume`
- **Role:** `SAFETY_OFFICER`, `ADMIN`
- **State Check:** `SUSPENDED` -> `ACTIVE`

### `POST /api/permits/:id/close`
- **Role:** Requester
- **Body:** `{ "completion_notes": "Welding complete, area cooled." }`
- **State Check:** `ACTIVE` -> `CLOSED`

### `POST /api/permits/:id/verify-closure`
- **Role:** `SAFETY_OFFICER`
- **State Check:** `CLOSED` -> `CLOSED_VERIFIED`

---

## 5. Audit & History

### `GET /api/permits/:id/audit-log`
- Returns chronological list of all state changes, comments, and actors.
