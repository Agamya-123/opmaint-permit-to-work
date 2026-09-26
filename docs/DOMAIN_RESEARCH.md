# Domain Research: Permit to Work in a CMMS

This document synthesizes research into Opmaint’s positioning, the broader CMMS market, and real-world Permit to Work (PTW) implementations (MaintainX, SafetyCulture/Mitti, OSHA, NFPA).

**Goal:** Ground the technical design of the Opmaint PTW module in reality, ensuring we build what plants actually need, match Opmaint's tone, and avoid generic "to-do list" assumptions.

---

## 1. Opmaint Product Context & Positioning

Opmaint is a Computerized Maintenance Management System (CMMS) explicitly designed for shop-floor adoption rather than back-office accounting. 

### What They Do
Opmaint provides web and mobile software to track assets, schedule preventive maintenance (PM), generate work orders, manage spare parts, and digitize inspections. 
Their pricing model is flat-rate per plant, explicitly challenging competitors (MaintainX, UpKeep) who charge per seat.

### Core Philosophy
- **"Because adoption is the product."** If technicians don't use it, the data is fake. 
- **"Made for the technicians."** The bar is: a technician should be able to raise and close a work order from a phone, wearing gloves, in the sun, without training.
- **Action over administration.** "Stop chasing work orders across chat, paper and memory."

### Who Uses It
- **Technicians** (the primary users checking boxes and closing jobs).
- **Maintenance Leads / Supervisors / Planners** (managing the queue and assigning work).
- **Plant Managers / Ops Leads / Safety Officers** (relying on the data for uptime and compliance).
- **Industries:** Manufacturing, chemicals, food & beverage, automotive, facilities.

### Working Terminology
- **Work Order / Job** (never "ticket" or "task").
- **Asset / Equipment / Machine** (interchangeable, but organized into a hierarchy: component → machine → line → plant).
- **Procedure / Inspection / Checklist** (used to standardize work).
- **Meters / Readings** (runtime hours, cycles, pressure—these trigger work when thresholds are breached).
- **QR Codes** (the physical bridge: scan a machine to see manuals, history, and active jobs).

### UI Cues
- High-contrast, mobile-first design.
- Stacked panels, clear statuses (e.g., Running / Active / In service).
- Photo attachments and digital sign-offs are first-class citizens.
- Action-oriented: "Pass/Fail," "Approve," "Reject."

---

## 2. CMMS vs. Permit to Work (PTW)

A CMMS manages the *what* and *when* of maintenance. A Permit to Work manages the *safety authorization* for the most dangerous fraction of that work.

- **Work Order:** "Replace the pump seal on Tank 4." 
- **Permit to Work:** "You are authorized to bring an open flame within 10 meters of Tank 4 between 08:00 and 16:00, provided a fire watch is present and the LEL is 0%."

In a CMMS like MaintainX (and soon Opmaint), permits block work orders. A technician cannot start or close a work order if the required permit is missing, pending, or expired.

---

## 3. Real-World Permit to Work (PTW) Implementation Findings

Research into competitors (MaintainX, SafetyCulture/Mitti) and regulatory bodies (OSHA, NFPA 51B) reveals the anatomy of a real permit.

### The Four Standard Permit Types
1. **Hot Work (NFPA 51B):** Any operation involving open flames or producing heat/sparks (welding, cutting, brazing, grinding).
2. **Confined Space Entry (OSHA 1910.146):** Entry into tanks, silos, sewers. Risk of oxygen deficiency or toxic gas.
3. **Working at Height:** Scaffolds, MEWPs (cherry pickers), roof work. Fall arrest and dropped-object risks.
4. **Electrical / LOTO (OSHA 1910.147):** Lock-Out/Tag-Out. Isolating energy sources to prove equipment is dead.

### Common Structure of a Permit
Competitor templates and OSHA forms share a four-part structure:
1. **Job Overview:** Description, exact location, planned start/end times, personnel involved.
2. **Hazards & Precautions (The Checklist):** Type-specific safety checks (e.g., gas tests, physical barriers, PPE).
3. **Authorization & Acceptance:** Signatures from the Requester, Area Owner, and Safety Officer *before* work starts.
4. **Closure & Hand-back:** Signatures confirming the area was left safe *after* work ends.

### Specific Safety Checks & Fields
- **Hot Work (NFPA 51B):** 
  - 35-foot rule: Combustibles within 35 ft (10.7m) must be removed or shielded.
  - Fire watch: Required during work and for 30–60 minutes after.
  - Gas test: `% LEL` (Lower Explosive Limit) must be recorded.
- **Confined Space:**
  - Atmospheric hazard tests: `O2 %` (must be 19.5–23.5%), `% LEL`, `CO ppm`, `H2S ppm`.
  - Standby attendant assigned.
  - Rescue plan in place.
- **LOTO:**
  - List of exact isolation points.
  - Lock numbers and tag numbers applied.

### The Lifecycle & Statuses (MaintainX Reference)
MaintainX defines specific statuses that we should emulate:
- **Draft:** Unsubmitted.
- **Pending Approval:** Waiting for signatures.
- **Approved / Active:** Live window. Work is unblocked.
- **Changes Requested:** An approver kicked it back.
- **Suspended:** Paused due to an emergency or shift change. Work blocked.
- **Expired:** The time window closed before completion. Work blocked. Requires an extension or a new permit.
- **Work Done / Closed:** Area restored, paperwork finalized.

### Strict Industry Rules
- **No Self-Approval:** The person doing the work (Requester) cannot be the person authorizing the risk (Safety Officer).
- **Time-Bounded (Expiry):** A permit is valid for a specific window (e.g., 24 hours). Extending it requires a formal request and re-approval.
- **Auditability:** Every check, signature, and status change must be logged immutably. If it isn't documented, it didn't happen.

---

## 4. What We Must Incorporate into Our Design

1. **Backend State Machine:** The lifecycle (`DRAFT → PENDING → ACTIVE → EXPIRED / CLOSED`) must be enforced server-side. Bypassing the UI to activate a permit must throw a `409 Conflict`.
2. **Dynamic Fields via JSONB:** Do not build four different tables for four permit types. Build one relational table (`permits`) with a `type_data` JSONB column holding the type-specific checklists (LEL readings, LOTO points).
3. **Strict RBAC:** 
   - Requesters create and close.
   - Area Owners approve for *their* areas.
   - Safety Officers approve, suspend, and verify closure globally.
   - Enforce "no self-approval" at the API layer.
4. **Immutable Audit Trail:** An `audit_events` table tracking every transition and signature. The UI should render this as a vertical timeline ("14:32 - Priya (Safety) approved: Gas test acceptable").
5. **Real Expiry:** Permits must expire even if the user closes all browser tabs. (Lazy evaluation on read + background cron).
6. **Mobile-First UX:** Big buttons, high contrast. A technician with gloves must execute closure.

## 5. What We Should Deliberately Avoid

1. **A Generic "To-Do" Flow:** Permits are not Jira tickets. They are legal safety documents. Do not let users drag-and-drop a permit into "Active."
2. **Copy-Pasted Forms:** Do not build `HotWorkForm.tsx` and `ConfinedSpaceForm.tsx`. Build a type registry and a schema-driven rendering engine.
3. **Silent Activation:** Do not automatically switch a permit to `ACTIVE` just because the clock struck 08:00. Activation requires human intent.
4. **Editing Active Permits:** Once approved, fields like "location" or "fire watch assigned" must be locked.
5. **Fictitious Features:** No websockets, no realtime chat, no multi-tenancy. Stick to the core safety flow.

---

## 6. Sources

- [MaintainX: About Permit to Work](https://help.getmaintainx.com/about-permit-to-work)
- [MaintainX: Approve a Permit to Work](https://help.getmaintainx.com/approve-a-permit-to-work)
- [Limble CMMS: How Limble Can be Used for Safety](https://help.limblecmms.com/en/articles/3094311-how-limble-can-be-used-for-safety)
- [Mitti/SafetyCulture Checklist Templates](https://mitti.com/checklists/hot-work-permit)
- [OSHA 1910 Subpart Q - Welding, Cutting, and Brazing](https://www.osha.gov/laws-regs/regulations/standardnumber/1910)
- NFPA 51B: Standard for Fire Prevention During Welding, Cutting, and Other Hot Work (35-foot rule).
- Opmaint Marketing Site Analysis (Solutions, Careers, Asset Pages).