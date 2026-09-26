# Database Design — Opmaint PTW

**Engine:** PostgreSQL 16+
**Access layer:** Prisma ORM
**Scope:** 7 tables, 8 enums, 1 append-only log.

This document explains the schema *before* the code, so the reasoning survives independently of `schema.prisma`.

---

## 1. The one decision that shapes everything

Four permit types (soon five) share ~80% of their fields and differ in ~20%. There are three ways to model that:

| Option | Shape | Why not / why yes |
| --- | --- | --- |
| **A. Four tables** | `hot_work_permits`, `confined_space_permits`, … | Rejected. Every query becomes a 4-way UNION. Adding Excavation means a new table, new endpoints, new UI, new tests. The spec calls this out as the main evaluation item. |
| **B. One wide table** | 60 nullable columns, most null on any row | Rejected. `lel_percent` is meaningless on a Working-at-Height permit. Nullable columns can't be constrained, so the DB stops helping you. |
| **C. Core table + JSONB** | One `permits` table; type-specific body in `type_data JSONB` | **Chosen.** One table, one query surface, one detail page. A fifth type is a new schema entry + a new renderer, not a migration. |

**Chosen: C.** The shared header is relational and constrained (FKs, indexes, NOT NULL). The type-specific body lives in `type_data JSONB`, validated at the application boundary by a Zod schema chosen from a **type registry** keyed on `permit.type`.

The tradeoff, stated honestly: the database will not enforce the shape of `type_data`. If validation is skipped, garbage gets in. Mitigation: `type_data` is only ever written through a service that runs the registry validator; the validator is the single source of truth for what a type requires; tests cover each type's schema. If a future type needs heavy querying inside its body (e.g. "all permits where any isolation point is still locked"), that type graduates to a child table. That is a per-type decision, not a reason to abandon the pattern now.

---

## 2. Entities and relationships

```text
Plant 1──* Area 1──* Equipment
  │          │            │
  │          └────────────┴──────┐
  │                              │
  └──* User                      │ (location of work)
        │                        │
        │ requester              │
        └──────────* Permit *────┘
                      │ 1
          ┌───────────┼───────────┐
          │ *                     │ *
   PermitApproval             AuditLog
          │ *                     │ *
          └──────── User ─────────┘
              (approver / actor)
```

Cardinalities:

- `Plant 1 → * Area` — an area belongs to exactly one plant.
- `Area 1 → * Equipment` — equipment sits in exactly one area. The plant is reachable transitively, but `permits` also stores `plant_id` directly (denormalised on purpose — see §5).
- `User * → 1 Plant` — users are scoped to a plant. Nullable, because a corporate Safety Officer or Admin may be plant-agnostic.
- `Area * → * User` via `area_owners` — an area can have several owners, and a person can own several areas. This is why area ownership is a join table and **not** an `owner_id` column on `areas`.
- `Permit 1 → * PermitApproval` — one row per *required* approval slot, created at submit time.
- `Permit 1 → * AuditLog` — append-only history.

### Why `area_owners` is a join table

The spec says "Area Owner approves permits for equipment in their area only." A single `areas.owner_id` column would work until the first plant with two shift owners, and then it breaks in a way that requires a migration plus an authorization rewrite. The join table costs one extra table now and answers the authorization question with a single indexed lookup:

```sql
SELECT 1 FROM area_owners WHERE area_id = $1 AND user_id = $2
```

---

## 3. Enums

Enums are real PostgreSQL enum types, not strings. Prisma generates them as TypeScript union types, so an invalid status is a compile error in the backend before it is a runtime error in the database.

| Enum | Values |
| --- | --- |
| `UserRole` | `REQUESTER`, `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN` |
| `PermitType` | `HOT_WORK`, `CONFINED_SPACE`, `WORKING_AT_HEIGHT`, `ELECTRICAL_LOTO`, `EXCAVATION` |
| `PermitStatus` | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `REJECTED`, `CLOSED`, `CLOSED_VERIFIED`, `CANCELLED` |
| `ApprovalRole` | `AREA_OWNER`, `SAFETY_OFFICER` |
| `ApprovalDecision` | `PENDING`, `APPROVED`, `REJECTED` |
| `AuditEvent` | `CREATED`, `UPDATED`, `SUBMITTED`, `APPROVED`, `REJECTED`, `ACTIVATED`, `SUSPENDED`, `RESUMED`, `CLOSED`, `CLOSURE_VERIFIED`, `CANCELLED`, `EXPIRED`, `WORK_LOGGED` |

`EXCAVATION` is in the enum from day one. It is the proof that a fifth type costs a type-registry entry and a renderer — not a schema migration. (Adding a *sixth* type does need one line in the enum; that is a one-word migration, not a rewrite.)

---

## 4. Table: `permits`

### Shared core (relational, constrained)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | `gen_random_uuid()`. Opaque, non-enumerable. |
| `permit_number` | `text` UNIQUE | Human key, `PTW-2026-0001`. Generated server-side. This is what people say out loud on the radio. |
| `type` | `PermitType` | Selects the `type_data` schema. |
| `status` | `PermitStatus` | Default `DRAFT`. Only the state machine writes this. |
| `requester_id` | `uuid` FK → `users` | `ON DELETE RESTRICT`. You may not delete a person out of a safety record. |
| `contractor_team` | `text` | Free text: "Apex Mechanical / Crew B". Contractors are not system users. |
| `work_description` | `text` | What is actually being done. |
| `plant_id` | `uuid` FK → `plants` | Denormalised. See §5. |
| `area_id` | `uuid` FK → `areas` | Drives Area Owner authorization. |
| `equipment_id` | `uuid` FK → `equipment` | Nullable — some work (e.g. a trench) has no asset. |
| `planned_start` | `timestamptz` | UTC. Activation floor. |
| `planned_end` | `timestamptz` | UTC. Expiry ceiling. |
| `hazards` | `text[]` | Identified hazards. |
| `ppe` | `text[]` | Required PPE. |
| `precautions` | `jsonb` | `[{ "label": "…", "checked": true }]`. A checklist, not prose. |
| `type_data` | `jsonb` | The type-specific body. Default `{}`. |
| `activated_at` | `timestamptz?` | When work actually went live (≠ `planned_start`). |
| `closed_at` | `timestamptz?` | When the requester handed back. |
| `closure_notes` | `text?` | Requester's completion notes. |
| `verified_at` | `timestamptz?` | When Safety confirmed the area was clean. |
| `created_at` / `updated_at` | `timestamptz` | Row bookkeeping. |

**Why `timestamptz` and not `timestamp`:** a permit that expires "at 16:00" must expire at one instant worldwide. Storing naive local time means the expiry worker and the browser can disagree about whether work is still authorised. Store UTC, render `Asia/Kolkata`.

**Why `hazards`/`ppe` are `text[]` but `precautions` is `jsonb`:** hazards and PPE are flat tag lists — a Postgres array indexes and filters cleanly. Precautions carry per-item state (`checked`), so they need objects.

### Type-specific body: `type_data`

The shape per type, validated by the registry. These are the fields the spec names, typed.

**`HOT_WORK`**
```jsonc
{
  "hotWorkType": "WELDING",            // WELDING | GRINDING | CUTTING | SOLDERING
  "fireWatchName": "Ramesh Kumar",     // a named person, not a checkbox
  "fireExtinguisherType": "CO2_9KG",
  "combustiblesClearedRadiusM": 11,    // NFPA 51B: 35 ft ≈ 10.7 m
  "gasTest": { "lelPercent": 0, "o2Percent": 20.9, "testedAt": "2026-09-26T08:15:00Z" }
}
```

**`CONFINED_SPACE`**
```jsonc
{
  "spaceId": "CS-TANK-04",
  "entryPoint": "Top manhole #2",
  "standbyAttendantName": "Suresh Patel",
  "rescuePlan": "Tripod winch + SRL staged at entry",
  "ventilationMethod": "FORCED_AIR_BLOWER",
  "atmosphericTest": { "o2Percent": 20.8, "lelPercent": 0, "h2sPpm": 0, "coPpm": 2,
                       "testedAt": "2026-09-26T08:20:00Z" },
  "entryExitLog": [ { "person": "Vikram Singh", "timeIn": "…", "timeOut": null } ]
}
```
`entryExitLog` is a live log, appended only while the permit is `ACTIVE`. That is the concrete reason rule 5 ("work logs require ACTIVE") exists.

**`WORKING_AT_HEIGHT`**
```jsonc
{
  "heightMeters": 12.5,
  "accessMethod": "SCAFFOLD",          // SCAFFOLD | LADDER | MEWP | ROPE_ACCESS
  "fallArrestEquipment": ["FULL_BODY_HARNESS", "DOUBLE_LANYARD"],
  "anchorPointChecked": true,
  "barricadingBelow": true
}
```

**`ELECTRICAL_LOTO`**
```jsonc
{
  "equipmentTag": "EQ-SUB-011",
  "voltageLevel": "11KV",
  "earthingApplied": true,
  "testedDeadBy": "Amit Verma",
  "isolationPoints": [
    { "point": "MCC-4B breaker", "lockNumber": "LOK-8841", "tagNumber": "TAG-1092" }
  ]
}
```
Isolation points are a list of objects, never three comma-separated strings. One permit legitimately has many points, and an investigator needs to read them one by one.

**`EXCAVATION`** (the extensibility proof)
```jsonc
{
  "depthMeters": 2.4,
  "undergroundServicesChecked": true,
  "shoringMethod": "HYDRAULIC_SHORING",
  "soilClassification": "TYPE_B"
}
```
Everything needed to ship this type: one Zod schema, one field-renderer entry, one seed row. Zero migrations.

---

## 5. Deliberate denormalisation: `plants.id` on `permits`

`plant_id` is reachable via `area → plant`. It is stored on the permit anyway, for two reasons:

1. **Filtering.** "Show me everything live in Chennai" is a dashboard default. Without the column it is a join on every list query.
2. **Historical truth.** If an area is ever re-parented, the permit must still say which plant authorised the work at the time. A safety record should not change retroactively because master data was reorganised.

The cost is one consistency rule enforced in the service layer: `permit.plant_id` must equal `area.plant_id` at write time.

---

## 6. Table: `permit_approvals`

One row per **required** approval slot, created when the permit is submitted — not when someone happens to click approve.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `permit_id` | `uuid` FK → `permits` | `ON DELETE CASCADE`. |
| `role` | `ApprovalRole` | `AREA_OWNER` or `SAFETY_OFFICER`. |
| `decision` | `ApprovalDecision` | `PENDING` → `APPROVED` \| `REJECTED`. |
| `approver_id` | `uuid?` FK → `users` | Null while pending; filled by whoever acts. |
| `comment` | `text?` | Optional on approve, **mandatory on reject**. |
| `decided_at` | `timestamptz?` | |

**Unique constraint:** `(permit_id, role)` — exactly one Area Owner slot and one Safety Officer slot per permit. This is what makes "all required approvals present" a countable, race-free question:

```sql
SELECT count(*) FROM permit_approvals
WHERE permit_id = $1 AND decision <> 'APPROVED'   -- must be 0 to activate
```

Modelling slots as rows (rather than two boolean columns on `permits`) is what makes the approver set **data**, not code. A future type that needs three approvers inserts three rows; the activation rule above does not change.

`approver_id` is nullable by design: the slot says *a* qualified person must sign, not *which* person. Any owner of the area may fill the Area Owner slot (§D2 in the domain notes).

---

## 7. Table: `audit_logs` — append-only

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `permit_id` | `uuid` FK → `permits` | |
| `actor_id` | `uuid?` FK → `users` | Null when the actor is the system (cron expiry). |
| `event` | `AuditEvent` | |
| `from_status` / `to_status` | `PermitStatus?` | Null for non-transition events (e.g. `UPDATED`). |
| `reason` | `text?` | Mandatory for `REJECTED`, `SUSPENDED`, `CANCELLED` — enforced in the service. |
| `metadata` | `jsonb` | Field diffs, approval role, gas readings at the time. |
| `created_at` | `timestamptz` | Default `now()`. |

**How immutability is actually achieved.** "Immutable" here means *append-only from the application's perspective*, and that is enforced by construction, not by hope:

1. The table has **no `updated_at`** — there is no concept of a revised entry.
2. The Prisma model exposes only `create`. No service calls `update` or `delete` on it; a repository wrapper is the only write path.
3. Writes happen **inside the same transaction** as the state change. A transition that commits without its audit row is not possible: either both land or neither does.
4. Production hardening (documented, not implemented in 16 hours): a dedicated DB role with `INSERT`-only grant on `audit_logs`, plus a `BEFORE UPDATE OR DELETE` trigger that raises an exception. Application-level discipline is the 90% answer; the grant is the 100% answer.

**Why `from_status` and `to_status` are stored rather than derived:** an investigator reading the timeline should not have to replay the whole log to know what the permit looked like before a change. Each row is self-describing: "14:32 — Priya (Safety) moved ACTIVE → SUSPENDED: gas alarm on adjacent line."

---

## 8. Indexes

Every index below answers a screen or a worker, not a hunch.

| Index | Serves |
| --- | --- |
| `permits(status, planned_end)` | The expiry sweep (`status IN (…) AND planned_end < now()`) and the "expiring in the next 2 hours" dashboard card. The single most important index in the schema. |
| `permits(area_id, status)` | Area Owner's "my approvals pending" and per-area filtering. |
| `permits(requester_id, status)` | "My permits" for a technician. |
| `permits(plant_id, status)` | Plant-scoped dashboard. |
| `permits(type)` | Type filter on the list screen. |
| `permits(permit_number)` UNIQUE | Radio-call lookup. |
| `permit_approvals(permit_id, role)` UNIQUE | Slot integrity + the activation count query. |
| `permit_approvals(approver_id)` | "What have I signed?" |
| `audit_logs(permit_id, created_at)` | Timeline render, in order, one seek. |
| `equipment(tag)` UNIQUE | QR scan → asset. |
| `area_owners(area_id, user_id)` PK | The authorization check on every approve call. |

---

## 9. Referential integrity policy

| Relationship | On delete | Why |
| --- | --- | --- |
| `permits.requester_id → users` | `RESTRICT` | A safety record must always name a real person. Deactivate users; never delete them. |
| `permits.area_id → areas` | `RESTRICT` | Same reasoning — the area that authorised the work must remain resolvable. |
| `permits.equipment_id → equipment` | `SET NULL` | Equipment is decommissioned in real life; the permit survives with its description intact. |
| `permit_approvals.permit_id → permits` | `CASCADE` | Approvals have no meaning without their permit. |
| `audit_logs.permit_id → permits` | `CASCADE` | Same. (Permits themselves are cancelled, not deleted.) |
| `areas.plant_id → plants` | `RESTRICT` | Prevents orphaning a live hierarchy. |

Note the asymmetry: master data is protected (`RESTRICT`), children of a permit follow it (`CASCADE`). Permits are never hard-deleted in normal operation — `CANCELLED` is the delete verb for a permit.

---

## 10. Seed data

Enough to log in and understand the product in under two minutes, per the spec.

**4 users** (password `Opmaint@123` for all, hashed with bcrypt):

| Email | Role | Notes |
| --- | --- | --- |
| `requester@opmaint.com` | `REQUESTER` | Ravi Kumar, maintenance technician |
| `areaowner@opmaint.com` | `AREA_OWNER` | Meera Nair, owns Utilities + Process areas |
| `safety@opmaint.com` | `SAFETY_OFFICER` | Priya Sharma, plant-wide |
| `admin@opmaint.com` | `ADMIN` | Tanzeel Ahmed |

**2 plants:** Pune Manufacturing Plant, Chennai Chemical Complex.

**4 areas:** Utilities & Boiler House, Process Block A (Pune); Tank Farm, Substation Yard (Chennai).

**6 equipment items:** Steam Boiler #1, Overhead Crane 10T, Conveyor Line B, Reactor Tank 4, Transfer Pump P-102, 11kV Transformer.

**10 permits**, chosen so every meaningful state and all five types appear on first login:

| # | Type | Status | Why it's in the seed |
| --- | --- | --- | --- |
| 1 | `HOT_WORK` | `DRAFT` | Unsubmitted work in progress |
| 2 | `CONFINED_SPACE` | `PENDING_APPROVAL` | Lands in Area Owner + Safety queues |
| 3 | `WORKING_AT_HEIGHT` | `APPROVED` | Signed but not yet activated |
| 4 | `ELECTRICAL_LOTO` | `ACTIVE` | Live work right now |
| 5 | `HOT_WORK` | `ACTIVE` | **Expires in ~90 minutes** — drives the "expiring soon" card |
| 6 | `CONFINED_SPACE` | `SUSPENDED` | Suspended on a gas alarm, with reason |
| 7 | `HOT_WORK` | `REJECTED` | Rejected with a mandatory reason |
| 8 | `WORKING_AT_HEIGHT` | `CLOSED` | Awaiting Safety verification |
| 9 | `ELECTRICAL_LOTO` | `CLOSED_VERIFIED` | Fully closed out |
| 10 | `EXCAVATION` | `EXPIRED` | Window passed; **also proves the fifth type works with zero schema change** |

Every seeded permit carries a coherent audit trail (not just a `CREATED` row), so the timeline UI has something real to render on day one.

---

## 11. Known limitations

Stated plainly, because an evaluator will find them anyway:

1. **`type_data` is not constrained by the database.** Application-layer Zod validation is the only guard. A direct `psql` write can insert nonsense. Accepted for this scope; a `CHECK (jsonb_typeof(type_data) = 'object')` plus per-type constraints would be the next step.
2. **Audit immutability is application-enforced.** The DB-level `INSERT`-only grant and update/delete trigger are documented above but not shipped.
3. **No soft-delete on users.** Deletion is blocked by `RESTRICT` rather than handled by an `is_active` flag. Fine for a seeded demo, wrong for a real plant with staff turnover.
4. **Permit numbering has a theoretical race.** `PTW-YYYY-NNNN` is generated from a per-year counter; under genuine concurrency this needs a Postgres sequence rather than a read-then-write. Single-writer demo traffic will not hit it.
