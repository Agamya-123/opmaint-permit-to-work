import { PrismaClient, UserRole, PermitType, PermitStatus, ApprovalRole, ApprovalDecision, AuditEvent } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data in order of foreign key dependencies
  await prisma.auditLog.deleteMany();
  await prisma.permitApproval.deleteMany();
  await prisma.permit.deleteMany();
  await prisma.areaOwner.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.area.deleteMany();
  await prisma.user.deleteMany();
  await prisma.plant.deleteMany();

  const passwordHash = await bcrypt.hash('Opmaint@123', 10);

  // 1. Plants
  const punePlant = await prisma.plant.create({
    data: {
      name: 'Pune Manufacturing Plant',
      code: 'PLANT-PUNE-01',
    },
  });

  const chennaiPlant = await prisma.plant.create({
    data: {
      name: 'Chennai Chemical Complex',
      code: 'PLANT-CHN-02',
    },
  });

  // 2. Areas
  const boilerHouse = await prisma.area.create({
    data: {
      name: 'Utilities & Boiler House',
      plantId: punePlant.id,
    },
  });

  const processBlockA = await prisma.area.create({
    data: {
      name: 'Process Block A',
      plantId: punePlant.id,
    },
  });

  const tankFarm = await prisma.area.create({
    data: {
      name: 'Tank Farm & Offsites',
      plantId: chennaiPlant.id,
    },
  });

  const substationYard = await prisma.area.create({
    data: {
      name: 'Substation Yard',
      plantId: chennaiPlant.id,
    },
  });

  // 3. Equipment
  const boiler1 = await prisma.equipment.create({
    data: {
      name: 'High Pressure Steam Boiler #1',
      tag: 'EQ-BLR-001',
      areaId: boilerHouse.id,
    },
  });

  const crane10t = await prisma.equipment.create({
    data: {
      name: 'Overhead Crane 10T',
      tag: 'EQ-CRN-010',
      areaId: boilerHouse.id,
    },
  });

  const conveyorB = await prisma.equipment.create({
    data: {
      name: 'Main Conveyor Line B',
      tag: 'EQ-CNV-002',
      areaId: processBlockA.id,
    },
  });

  const reactorTank4 = await prisma.equipment.create({
    data: {
      name: 'Reactor Tank 4',
      tag: 'EQ-RN-004',
      areaId: processBlockA.id,
    },
  });

  const pump102 = await prisma.equipment.create({
    data: {
      name: 'Chemical Transfer Pump P-102',
      tag: 'EQ-PMP-102',
      areaId: tankFarm.id,
    },
  });

  const transformer11k = await prisma.equipment.create({
    data: {
      name: 'Main Substation 11kV Transformer',
      tag: 'EQ-XFR-011',
      areaId: substationYard.id,
    },
  });

  // 4. Users (4 core roles)
  const requester = await prisma.user.create({
    data: {
      name: 'Ravi Kumar',
      email: 'requester@opmaint.com',
      passwordHash,
      role: UserRole.REQUESTER,
      plantId: punePlant.id,
    },
  });

  const areaOwner = await prisma.user.create({
    data: {
      name: 'Meera Nair',
      email: 'areaowner@opmaint.com',
      passwordHash,
      role: UserRole.AREA_OWNER,
      plantId: punePlant.id,
    },
  });

  const safetyOfficer = await prisma.user.create({
    data: {
      name: 'Priya Sharma',
      email: 'safety@opmaint.com',
      passwordHash,
      role: UserRole.SAFETY_OFFICER,
      plantId: null, // Global Safety Officer
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: 'Tanzeel Ahmed',
      email: 'admin@opmaint.com',
      passwordHash,
      role: UserRole.ADMIN,
      plantId: null, // Global Admin
    },
  });

  // Link Area Owner to Areas
  await prisma.areaOwner.createMany({
    data: [
      { areaId: boilerHouse.id, userId: areaOwner.id },
      { areaId: processBlockA.id, userId: areaOwner.id },
    ],
  });

  // Helpers for time offsets
  const now = new Date();
  const hours = (h: number) => new Date(now.getTime() + h * 3600 * 1000);

  // 5. Permits (10 items across statuses)

  // Permit 1: DRAFT (Hot Work)
  const p1 = await prisma.permit.create({
    data: {
      permitNumber: 'PTW-2026-0001',
      type: PermitType.HOT_WORK,
      status: PermitStatus.DRAFT,
      requesterId: requester.id,
      contractorTeam: 'In-house Maintenance',
      workDescription: 'Welding support bracket on Boiler #1 feed pipe',
      plantId: punePlant.id,
      areaId: boilerHouse.id,
      equipmentId: boiler1.id,
      plannedStart: hours(2),
      plannedEnd: hours(10),
      hazards: ['FLAMMABLE_VAPOR', 'SPARKS_HOT_METAL'],
      ppe: ['FIRE_SUIT', 'WELDING_SHIELD', 'SAFETY_SHOES'],
      precautions: [
        { label: '35ft radius cleared of combustibles', checked: true },
        { label: 'Fire extinguisher staged', checked: true },
      ],
      typeData: {
        hotWorkType: 'WELDING',
        fireWatchName: 'Suresh Patel',
        fireExtinguisherType: 'CO2_9KG',
        combustiblesClearedRadiusM: 11,
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      permitId: p1.id,
      actorId: requester.id,
      event: AuditEvent.CREATED,
      toStatus: PermitStatus.DRAFT, metadata: {},
      metadata: { note: 'Draft created by technician' },
    },
  });

  // Permit 2: PENDING_APPROVAL (Confined Space)
  const p2 = await prisma.permit.create({
    data: {
      permitNumber: 'PTW-2026-0002',
      type: PermitType.CONFINED_SPACE,
      status: PermitStatus.PENDING_APPROVAL,
      requesterId: requester.id,
      contractorTeam: 'Apex Tank Cleaners Pvt Ltd',
      workDescription: 'Internal inspection and sludge cleaning of Reactor Tank 4',
      plantId: punePlant.id,
      areaId: processBlockA.id,
      equipmentId: reactorTank4.id,
      plannedStart: hours(1),
      plannedEnd: hours(8),
      hazards: ['OXYGEN_DEFICIENCY', 'TOXIC_GAS_H2S', 'RESTRICTED_ENTRY'],
      ppe: ['FULL_BODY_HARNESS', 'SCBA_BREATHING_APPARATUS'],
      precautions: [
        { label: 'Forced air ventilation running', checked: true },
        { label: 'Atmosphere gas test acceptable', checked: true },
      ],
      typeData: {
        spaceId: 'CS-TANK-04',
        entryPoint: 'Top Manhole #2',
        standbyAttendantName: 'Amit Verma',
        rescuePlan: 'Tripod winch + SRL staged at manhole entry',
        ventilationMethod: 'FORCED_AIR_BLOWER',
        atmosphericTest: {
          o2Percent: 20.8,
          lelPercent: 0,
          h2sPpm: 0,
          coPpm: 2,
          testedAt: hours(-0.5).toISOString(),
        },
        entryExitLog: [],
      },
    },
  });

  await prisma.permitApproval.createMany({
    data: [
      { permitId: p2.id, role: ApprovalRole.AREA_OWNER, decision: ApprovalDecision.PENDING },
      { permitId: p2.id, role: ApprovalRole.SAFETY_OFFICER, decision: ApprovalDecision.PENDING },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        permitId: p2.id,
        actorId: requester.id,
        event: AuditEvent.CREATED,
        toStatus: PermitStatus.DRAFT, metadata: {},
      },
      {
        permitId: p2.id,
        actorId: requester.id,
        event: AuditEvent.SUBMITTED,
        fromStatus: PermitStatus.DRAFT,
        toStatus: PermitStatus.PENDING_APPROVAL, metadata: {},
      },
    ],
  });

  // Permit 3: APPROVED (Working at Height)
  const p3 = await prisma.permit.create({
    data: {
      permitNumber: 'PTW-2026-0003',
      type: PermitType.WORKING_AT_HEIGHT,
      status: PermitStatus.APPROVED,
      requesterId: requester.id,
      contractorTeam: 'SkyHigh Scaffolding',
      workDescription: 'Replace hoist motor cables on 10T Overhead Crane',
      plantId: punePlant.id,
      areaId: boilerHouse.id,
      equipmentId: crane10t.id,
      plannedStart: hours(-1),
      plannedEnd: hours(7),
      hazards: ['FALL_FROM_HEIGHT', 'DROPPED_OBJECTS'],
      ppe: ['FULL_BODY_HARNESS', 'DOUBLE_LANYARD', 'HELMET_WITH_CHINSTRAP'],
      precautions: [
        { label: 'Life line anchor point checked', checked: true },
        { label: 'Ground area barricaded with warning tape', checked: true },
      ],
      typeData: {
        heightMeters: 12.5,
        accessMethod: 'SCAFFOLD',
        fallArrestEquipment: ['FULL_BODY_HARNESS', 'DOUBLE_LANYARD'],
        anchorPointChecked: true,
        barricadingBelow: true,
      },
    },
  });

  await prisma.permitApproval.createMany({
    data: [
      {
        permitId: p3.id,
        role: ApprovalRole.AREA_OWNER,
        decision: ApprovalDecision.APPROVED,
        approverId: areaOwner.id,
        comment: 'Area clear for high work',
        decidedAt: hours(-2),
      },
      {
        permitId: p3.id,
        role: ApprovalRole.SAFETY_OFFICER,
        decision: ApprovalDecision.APPROVED,
        approverId: safetyOfficer.id,
        comment: 'Rigging and harness inspect complete',
        decidedAt: hours(-1.5),
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      permitId: p3.id,
      actorId: safetyOfficer.id,
      event: AuditEvent.APPROVED,
      fromStatus: PermitStatus.PENDING_APPROVAL,
      toStatus: PermitStatus.APPROVED,
      metadata: { note: 'All required approvals granted' },
    },
  });

  // Permit 4: ACTIVE (Electrical LOTO)
  const p4 = await prisma.permit.create({
    data: {
      permitNumber: 'PTW-2026-0004',
      type: PermitType.ELECTRICAL_LOTO,
      status: PermitStatus.ACTIVE,
      requesterId: requester.id,
      contractorTeam: 'PowerGrid Services',
      workDescription: 'Annual preventive maintenance and bushing replacement on 11kV Transformer',
      plantId: chennaiPlant.id,
      areaId: substationYard.id,
      equipmentId: transformer11k.id,
      plannedStart: hours(-3),
      plannedEnd: hours(5),
      activatedAt: hours(-2.5),
      hazards: ['HIGH_VOLTAGE_SHOCK', 'STORED_ELECTRICAL_ENERGY'],
      ppe: ['11KV_INSULATED_GLOVES', 'ARC_FLASH_SUIT'],
      precautions: [
        { label: 'Tested dead with calibrated voltage detector', checked: true },
        { label: 'Earthing leads applied', checked: true },
      ],
      typeData: {
        equipmentTag: 'EQ-XFR-011',
        voltageLevel: '11KV',
        testedDeadBy: 'Amit Verma',
        earthingApplied: true,
        isolationPoints: [
          { point: '11kV Feeder Incomer Breaker', lockNumber: 'LOK-991', tagNumber: 'TAG-331' },
          { point: 'Secondary 415V Outgoing Busbar', lockNumber: 'LOK-992', tagNumber: 'TAG-332' },
        ],
      },
    },
  });

  await prisma.permitApproval.createMany({
    data: [
      {
        permitId: p4.id,
        role: ApprovalRole.AREA_OWNER,
        decision: ApprovalDecision.APPROVED,
        approverId: areaOwner.id,
        comment: 'Substation isolated',
        decidedAt: hours(-4),
      },
      {
        permitId: p4.id,
        role: ApprovalRole.SAFETY_OFFICER,
        decision: ApprovalDecision.APPROVED,
        approverId: safetyOfficer.id,
        comment: 'LOTO verified',
        decidedAt: hours(-3.5),
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      permitId: p4.id,
      actorId: requester.id,
      event: AuditEvent.ACTIVATED,
      fromStatus: PermitStatus.APPROVED,
      toStatus: PermitStatus.ACTIVE, metadata: {},
    },
  });

  // Permit 5: ACTIVE - EXPIRING SOON (Hot Work)
  const p5 = await prisma.permit.create({
    data: {
      permitNumber: 'PTW-2026-0005',
      type: PermitType.HOT_WORK,
      status: PermitStatus.ACTIVE,
      requesterId: requester.id,
      contractorTeam: 'In-house Maintenance',
      workDescription: 'Grinding weld seams on Conveyor Line B guard rails',
      plantId: punePlant.id,
      areaId: processBlockA.id,
      equipmentId: conveyorB.id,
      plannedStart: hours(-6),
      plannedEnd: hours(1), // Expiring in 1 hour!
      activatedAt: hours(-5.5),
      hazards: ['SPARKS', 'FLYING_DEBRIS'],
      ppe: ['FACE_SHIELD', 'LEATHER_GLOVES'],
      precautions: [{ label: 'Spark shield curtain installed', checked: true }],
      typeData: {
        hotWorkType: 'GRINDING',
        fireWatchName: 'Ramesh Kumar',
        fireExtinguisherType: 'DCP_6KG',
        combustiblesClearedRadiusM: 10,
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      permitId: p5.id,
      actorId: requester.id,
      event: AuditEvent.ACTIVATED,
      fromStatus: PermitStatus.APPROVED,
      toStatus: PermitStatus.ACTIVE, metadata: {},
    },
  });

  // Permit 6: SUSPENDED (Confined Space)
  const p6 = await prisma.permit.create({
    data: {
      permitNumber: 'PTW-2026-0006',
      type: PermitType.CONFINED_SPACE,
      status: PermitStatus.SUSPENDED,
      requesterId: requester.id,
      contractorTeam: 'CleanTech',
      workDescription: 'Cleaning chemical residue in Pump P-102 pit',
      plantId: chennaiPlant.id,
      areaId: tankFarm.id,
      equipmentId: pump102.id,
      plannedStart: hours(-4),
      plannedEnd: hours(4),
            hazards: ['TOXIC_GAS_H2S'],
      ppe: ['SCBA'],
      precautions: [{ label: 'Continuous gas monitoring', checked: true }],
      typeData: {
        spaceId: 'PIT-PMP-102',
        entryPoint: 'Access ladder',
        standbyAttendantName: 'Suresh Patel',
        rescuePlan: 'Harness hoist',
        ventilationMethod: 'EXTRACTOR',
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      permitId: p6.id,
      actorId: safetyOfficer.id,
      event: AuditEvent.SUSPENDED,
      fromStatus: PermitStatus.ACTIVE,
      toStatus: PermitStatus.SUSPENDED,
      reason: 'H2S gas detector alarm sounded nearby at 14:15. Work stopped immediately.',
      metadata: {},
    },
  });

  // Permit 7: REJECTED (Hot Work)
  const p7 = await prisma.permit.create({
    data: {
      permitNumber: 'PTW-2026-0007',
      type: PermitType.HOT_WORK,
      status: PermitStatus.REJECTED,
      requesterId: requester.id,
      contractorTeam: 'External Welders',
      workDescription: 'Cutting redundant pipes near solvent store',
      plantId: chennaiPlant.id,
      areaId: tankFarm.id,
      equipmentId: pump102.id,
      plannedStart: hours(2),
      plannedEnd: hours(8),
            hazards: ['EXPLOSION_RISK'],
      ppe: ['FIRE_SUIT'],
      precautions: [],
      typeData: {
        hotWorkType: 'CUTTING',
        fireWatchName: 'None',
        fireExtinguisherType: 'CO2_9KG',
        combustiblesClearedRadiusM: 3,
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      permitId: p7.id,
      actorId: safetyOfficer.id,
      event: AuditEvent.REJECTED,
      fromStatus: PermitStatus.PENDING_APPROVAL,
      toStatus: PermitStatus.REJECTED,
      reason: 'Hot work proposed within 5m of active solvent line without line flushing certificate.',
      metadata: {},
    },
  });

  // Permit 8: CLOSED (Working at Height)
  const p8 = await prisma.permit.create({
    data: {
      permitNumber: 'PTW-2026-0008',
      type: PermitType.WORKING_AT_HEIGHT,
      status: PermitStatus.CLOSED,
      requesterId: requester.id,
      contractorTeam: 'RoofCare Ltd',
      workDescription: 'Fixing roof sheet leaks above Boiler House',
      plantId: punePlant.id,
      areaId: boilerHouse.id,
      plannedStart: hours(-12),
      plannedEnd: hours(-4),
      closedAt: hours(-4.5),
      closureNotes: 'Roof sheets replaced, area cleaned, all tools accounted for.',
      hazards: ['FRAGILE_ROOF', 'HEIGHT'],
      ppe: ['HARNESS'],
      precautions: [{ label: 'Crawling boards used', checked: true }],
      typeData: {
        heightMeters: 18.0,
        accessMethod: 'MEWP',
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      permitId: p8.id,
      actorId: requester.id,
      event: AuditEvent.CLOSED,
      fromStatus: PermitStatus.ACTIVE,
      toStatus: PermitStatus.CLOSED, metadata: {},
    },
  });

  // Permit 9: CLOSED_VERIFIED (Electrical LOTO)
  const p9 = await prisma.permit.create({
    data: {
      permitNumber: 'PTW-2026-0009',
      type: PermitType.ELECTRICAL_LOTO,
      status: PermitStatus.CLOSED_VERIFIED,
      requesterId: requester.id,
      contractorTeam: 'In-house Electrical',
      workDescription: 'Motor replacement on Chemical Transfer Pump P-102',
      plantId: chennaiPlant.id,
      areaId: tankFarm.id,
      equipmentId: pump102.id,
      plannedStart: hours(-24),
      plannedEnd: hours(-12),
      activatedAt: hours(-23.5),
      closedAt: hours(-13),
      verifiedAt: hours(-12.5),
      closureNotes: 'Motor replacement complete, rotation checked, locks removed.',
      hazards: ['ELECTRICAL_SHOCK'],
      ppe: ['INSULATED_GLOVES'],
      precautions: [{ label: 'LOTO applied and removed after test', checked: true }],
      typeData: {
        equipmentTag: 'EQ-PMP-102',
        voltageLevel: '415V_3PHASE',
        testedDeadBy: 'Ravi Kumar',
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      permitId: p9.id,
      actorId: safetyOfficer.id,
      event: AuditEvent.CLOSURE_VERIFIED,
      fromStatus: PermitStatus.CLOSED,
      toStatus: PermitStatus.CLOSED_VERIFIED,
      metadata: { note: 'Site verified clean and safe by Safety Officer' },
    },
  });

  // Permit 10: EXPIRED (Excavation - 5th Type!)
  const p10 = await prisma.permit.create({
    data: {
      permitNumber: 'PTW-2026-0010',
      type: PermitType.EXCAVATION,
      status: PermitStatus.EXPIRED,
      requesterId: requester.id,
      contractorTeam: 'GroundWorks Inc',
      workDescription: 'Trenching for new cable trench in Substation Yard',
      plantId: chennaiPlant.id,
      areaId: substationYard.id,
      plannedStart: hours(-48),
      plannedEnd: hours(-24), // Expired yesterday
      hazards: ['UNDERGROUND_SERVICES', 'TRENCH_COLLAPSE'],
      ppe: ['SAFETY_HELMET', 'HIGH_VIS_VEST'],
      precautions: [{ label: 'Cable detector scan performed', checked: true }],
      typeData: {
        depthMeters: 2.1,
        undergroundServicesChecked: true,
        shoringMethod: 'HYDRAULIC_SHORING',
        soilClassification: 'TYPE_B',
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      permitId: p10.id,
      actorId: null, // Auto-expired by background cron / lazy check
      event: AuditEvent.EXPIRED,
      fromStatus: PermitStatus.APPROVED,
      toStatus: PermitStatus.EXPIRED,
      reason: 'Validity window passed without activation.',
      metadata: {},
    },
  });

  console.log('✅ Seed complete!');
  console.log('Users created: 4 (requester@opmaint.com, areaowner@opmaint.com, safety@opmaint.com, admin@opmaint.com)');
  console.log('Plants created: 2');
  console.log('Equipment created: 6');
  console.log('Permits created: 10 (covering DRAFT, PENDING_APPROVAL, APPROVED, ACTIVE, SUSPENDED, REJECTED, CLOSED, CLOSED_VERIFIED, EXPIRED across all 5 types)');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
