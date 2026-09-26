import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from './app';
import { processExpiredPermits } from './services/expiry.service';

describe('Opmaint PTW REST API Integration Tests', () => {
  let requesterToken: string;
  let areaOwnerToken: string;
  let safetyOfficerToken: string;
  let adminToken: string;

  let plantId: string;
  let areaId: string;
  let equipmentId: string;

  beforeAll(async () => {
    // Login Requester
    const resRequester = await request(app)
      .post('/api/auth/login')
      .send({ email: 'requester@opmaint.com', password: 'Opmaint@123' });
    expect(resRequester.status).toBe(200);
    requesterToken = resRequester.body.token;

    // Login Area Owner
    const resAreaOwner = await request(app)
      .post('/api/auth/login')
      .send({ email: 'areaowner@opmaint.com', password: 'Opmaint@123' });
    expect(resAreaOwner.status).toBe(200);
    areaOwnerToken = resAreaOwner.body.token;

    // Login Safety Officer
    const resSafety = await request(app)
      .post('/api/auth/login')
      .send({ email: 'safety@opmaint.com', password: 'Opmaint@123' });
    expect(resSafety.status).toBe(200);
    safetyOfficerToken = resSafety.body.token;

    // Login Admin
    const resAdmin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@opmaint.com', password: 'Opmaint@123' });
    expect(resAdmin.status).toBe(200);
    adminToken = resAdmin.body.token;

    // Fetch Master Data
    const plantsRes = await request(app)
      .get('/api/plants')
      .set('Authorization', `Bearer ${requesterToken}`);
    plantId = plantsRes.body[0].id;

    const areasRes = await request(app)
      .get('/api/areas')
      .set('Authorization', `Bearer ${requesterToken}`);
    areaId = areasRes.body[0].id;

    const eqRes = await request(app)
      .get('/api/equipment')
      .set('Authorization', `Bearer ${requesterToken}`);
    equipmentId = eqRes.body[0].id;
  });

  describe('1. Authentication Endpoints', () => {
    it('POST /api/auth/login - fails with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'requester@opmaint.com', password: 'wrong-password' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_CREDENTIALS');
    });

    it('GET /api/auth/me - returns user profile', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${requesterToken}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('requester@opmaint.com');
      expect(res.body.role).toBe('REQUESTER');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('GET /api/auth/me - unauthorized without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });
  });

  describe('2. Master Data Endpoints', () => {
    it('GET /api/plants - returns plants list', async () => {
      const res = await request(app)
        .get('/api/plants')
        .set('Authorization', `Bearer ${requesterToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('GET /api/users - fails for Requester, succeeds for Admin', async () => {
      const failRes = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${requesterToken}`);
      expect(failRes.status).toBe(403);

      const passRes = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(passRes.status).toBe(200);
      expect(Array.isArray(passRes.body)).toBe(true);
    });
  });

  describe('3. Permit Workflow Lifecycle', () => {
    let createdPermitId: string;

    it('POST /api/permits - creates a draft permit', async () => {
      const now = new Date();
      const plannedStart = new Date(now.getTime() - 60 * 1000).toISOString();
      const plannedEnd = new Date(now.getTime() + 8 * 3600 * 1000).toISOString();

      const res = await request(app)
        .post('/api/permits')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          type: 'HOT_WORK',
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Apex Welding Corp',
          workDescription: 'Pipe flange welding and cutting',
          plannedStart,
          plannedEnd,
          hazards: ['SPARKS', 'HIGH_HEAT'],
          ppe: ['SAFETY_GLASSES', 'FIRE_SUIT'],
          precautions: [{ label: 'Fire extinguisher staged', checked: true }],
          typeData: {
            hotWorkType: 'WELDING',
            fireWatchName: 'John Doe',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.permitNumber).toMatch(/^PTW-/);
      createdPermitId = res.body.id;
    });

    it('PUT /api/permits/:id - updates draft permit', async () => {
      const res = await request(app)
        .put(`/api/permits/${createdPermitId}`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          workDescription: 'Updated: Pipe flange welding and cutting at section B',
        });

      expect(res.status).toBe(200);
      expect(res.body.workDescription).toBe('Updated: Pipe flange welding and cutting at section B');
    });

    it('POST /api/permits/:id/action - SUBMIT moves to PENDING_APPROVAL', async () => {
      const res = await request(app)
        .post(`/api/permits/${createdPermitId}/action`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ action: 'SUBMIT' });

      expect(res.status).toBe(200);
      expect(res.body.toStatus).toBe('PENDING_APPROVAL');
    });

    it('POST /api/permits/:id/action - Self-Approval Ban (Requester cannot approve their own permit)', async () => {
      const res = await request(app)
        .post(`/api/permits/${createdPermitId}/action`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ action: 'APPROVE', reason: 'Self approving' });

      // Should be blocked either by RBAC middleware or Domain Error (403 or 400)
      expect([400, 403]).toContain(res.status);
    });

    it('POST /api/permits/:id/action - Area Owner approves permit', async () => {
      const res = await request(app)
        .post(`/api/permits/${createdPermitId}/action`)
        .set('Authorization', `Bearer ${areaOwnerToken}`)
        .send({ action: 'APPROVE', reason: 'Area looks clear' });

      expect(res.status).toBe(200);
      // Still PENDING_APPROVAL because Safety Officer approval is also needed
      expect(res.body.toStatus).toBe('PENDING_APPROVAL');
    });

    it('POST /api/permits/:id/action - Safety Officer approves permit (Status becomes APPROVED)', async () => {
      const res = await request(app)
        .post(`/api/permits/${createdPermitId}/action`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ action: 'APPROVE', reason: 'Safety protocols verified' });

      expect(res.status).toBe(200);
      expect(res.body.toStatus).toBe('APPROVED');
    });

    it('GET /api/permits/:id/readiness - checks activation readiness', async () => {
      const res = await request(app)
        .get(`/api/permits/${createdPermitId}/readiness`)
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.isReady).toBe('boolean');
    });

    it('POST /api/permits/:id/action - ACTIVATE permit', async () => {
      const res = await request(app)
        .post(`/api/permits/${createdPermitId}/action`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ action: 'ACTIVATE' });

      expect(res.status).toBe(200);
      expect(res.body.toStatus).toBe('ACTIVE');
    });

    it('POST /api/permits/:id/work-logs - logs work progress', async () => {
      const res = await request(app)
        .post(`/api/permits/${createdPermitId}/work-logs`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ notes: 'Completed welding seam test', hoursLogged: 3 });

      expect(res.status).toBe(201);
      expect(res.body.event).toBe('WORK_LOGGED');
    });

    it('POST /api/permits/:id/action - CLOSE permit fails for non-requester', async () => {
      const res = await request(app)
        .post(`/api/permits/${createdPermitId}/action`)
        .set('Authorization', `Bearer ${areaOwnerToken}`)
        .send({ action: 'CLOSE', reason: 'Trying to close as area owner' });

      expect(res.status).toBe(403);
    });

    it('POST /api/permits/:id/action - CLOSE permit succeeds for requester', async () => {
      const res = await request(app)
        .post(`/api/permits/${createdPermitId}/action`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ action: 'CLOSE', reason: 'Work completed safely' });

      expect(res.status).toBe(200);
      expect(res.body.toStatus).toBe('CLOSED');
    });

    it('POST /api/permits/:id/action - VERIFY_CLOSURE fails for non-Safety Officer', async () => {
      const res = await request(app)
        .post(`/api/permits/${createdPermitId}/action`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ action: 'VERIFY_CLOSURE', reason: 'Trying to verify as requester' });

      expect(res.status).toBe(403);
    });

    it('POST /api/permits/:id/action - VERIFY_CLOSURE by Safety Officer', async () => {
      const res = await request(app)
        .post(`/api/permits/${createdPermitId}/action`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ action: 'VERIFY_CLOSURE', reason: 'Inspected site, area is safe' });

      expect(res.status).toBe(200);
      expect(res.body.toStatus).toBe('CLOSED_VERIFIED');
    });
  });

  describe('4. Permit Listing & Query Filtering', () => {
    it('GET /api/permits - filter by status=ACTIVE', async () => {
      const res = await request(app)
        .get('/api/permits?status=ACTIVE')
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.every((p: any) => p.status === 'ACTIVE')).toBe(true);
    });

    it('GET /api/permits - filter by type=HOT_WORK', async () => {
      const res = await request(app)
        .get('/api/permits?type=HOT_WORK')
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((p: any) => p.type === 'HOT_WORK')).toBe(true);
    });
  });

  describe('5. Automatic Permit Expiry & Lifecycle Enforcement', () => {
    let expirablePermitId: string;
    let plannedEnd: Date;

    beforeAll(async () => {
      const now = new Date();
      const plannedStart = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
      plannedEnd = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes in future

      // Create permit
      const createRes = await request(app)
        .post('/api/permits')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          type: 'ELECTRICAL_LOTO',
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Power Corp',
          workDescription: 'Main breaker maintenance',
          plannedStart,
          plannedEnd: plannedEnd.toISOString(),
          hazards: ['HIGH_VOLTAGE'],
          ppe: ['INSULATED_GLOVES'],
          precautions: [{ label: 'Lockout tagged out', checked: true }],
          typeData: { voltageLevel: '440V' },
        });

      expirablePermitId = createRes.body.id;

      // Submit
      await request(app)
        .post(`/api/permits/${expirablePermitId}/action`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ action: 'SUBMIT' });

      // Area Owner Approve
      await request(app)
        .post(`/api/permits/${expirablePermitId}/action`)
        .set('Authorization', `Bearer ${areaOwnerToken}`)
        .send({ action: 'APPROVE', reason: 'Area isolated' });

      // Safety Officer Approve
      await request(app)
        .post(`/api/permits/${expirablePermitId}/action`)
        .set('Authorization', `Bearer ${safetyOfficerToken}`)
        .send({ action: 'APPROVE', reason: 'LOTO verified' });

      // Activate
      await request(app)
        .post(`/api/permits/${expirablePermitId}/action`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ action: 'ACTIVATE' });
    });

    it('1. Active permit before expiry remains ACTIVE', async () => {
      const nowBeforeExpiry = new Date(plannedEnd.getTime() - 5 * 60 * 1000); // 5 mins before plannedEnd
      const expiredCount = await processExpiredPermits(nowBeforeExpiry);
      expect(expiredCount).toBe(0);

      const res = await request(app)
        .get(`/api/permits/${expirablePermitId}`)
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACTIVE');
    });

    it('2. Active permit at expiry automatically transitions to EXPIRED', async () => {
      const nowAtExpiry = new Date(plannedEnd.getTime() + 1000); // 1 sec after plannedEnd
      const expiredCount = await processExpiredPermits(nowAtExpiry);
      expect(expiredCount).toBeGreaterThanOrEqual(1);

      const res = await request(app)
        .get(`/api/permits/${expirablePermitId}`)
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('EXPIRED');

      // Check audit log contains EXPIRED event
      const hasExpiredAudit = res.body.auditLogs.some((a: any) => a.event === 'EXPIRED');
      expect(hasExpiredAudit).toBe(true);
    });

    it('3. EXPIRED permit cannot receive work logs', async () => {
      const res = await request(app)
        .post(`/api/permits/${expirablePermitId}/work-logs`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ notes: 'Attempting to log work after expiry', hoursLogged: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('NOT_ACTIVE');
    });

    it('4. Expired -> ACTIVE transition is rejected (cannot reactivate or resume)', async () => {
      const resActivate = await request(app)
        .post(`/api/permits/${expirablePermitId}/action`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ action: 'ACTIVATE' });

      expect([400, 403, 409]).toContain(resActivate.status);

      const resResume = await request(app)
        .post(`/api/permits/${expirablePermitId}/action`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ action: 'RESUME', reason: 'Trying to resume expired permit' });

      expect([400, 403, 409]).toContain(resResume.status);
    });

    it('5. Expired permit appears correctly in dashboard / status query filter', async () => {
      const resExpiredList = await request(app)
        .get('/api/permits?status=EXPIRED')
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(resExpiredList.status).toBe(200);
      expect(resExpiredList.body.data.some((p: any) => p.id === expirablePermitId)).toBe(true);

      const resActiveList = await request(app)
        .get('/api/permits?status=ACTIVE')
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(resActiveList.status).toBe(200);
      expect(resActiveList.body.data.some((p: any) => p.id === expirablePermitId)).toBe(false);
    });
  });

  describe('8. Permit Safety Conflict Detection API', () => {
    let confinedPermitId: string;
    const startTime = new Date(Date.now() + 3600000 * 5); // 5 hours from now
    const endTime = new Date(Date.now() + 3600000 * 10); // 10 hours from now

    it('creates an active/approved CONFINED_SPACE permit', async () => {
      const createRes = await request(app)
        .post('/api/permits')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          type: 'CONFINED_SPACE',
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'CleanTank Inc',
          workDescription: 'Cleaning inside storage vessel',
          plannedStart: startTime.toISOString(),
          plannedEnd: endTime.toISOString(),
          hazards: ['Toxic gases'],
          ppe: ['Respirator'],
          precautions: [{ label: 'Continuous ventilation', checked: true }],
        });

      expect(createRes.status).toBe(201);
      confinedPermitId = createRes.body.id;

      // Submit permit
      await request(app)
        .post(`/api/permits/${confinedPermitId}/submit`)
        .set('Authorization', `Bearer ${requesterToken}`);
    });

    it('detects HOT_WORK overlapping with CONFINED_SPACE permit and returns warnings', async () => {
      const res = await request(app)
        .post('/api/permits')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          type: 'HOT_WORK',
          plantId,
          areaId,
          equipmentId,
          contractorTeam: 'Apex Welding Corp',
          workDescription: 'Hot work welding pipeline near vessel',
          plannedStart: new Date(startTime.getTime() + 1800000).toISOString(), // 30 min after start
          plannedEnd: new Date(endTime.getTime() - 1800000).toISOString(), // 30 min before end
          hazards: ['Sparks', 'Open flame'],
          ppe: ['Face shield'],
          precautions: [{ label: 'Fire watch', checked: true }],
        });

      expect(res.status).toBe(201);
      expect(res.body.warnings).toBeDefined();
      expect(res.body.warnings.length).toBeGreaterThanOrEqual(1);

      const warning = res.body.warnings.find((w: any) => w.code === 'HOT_WORK_CONFINED_SPACE_OVERLAP');
      expect(warning).toBeDefined();
      expect(warning.severity).toBe('CRITICAL');
      expect(warning.conflictingPermit.id).toBe(confinedPermitId);
    });
  });
});
