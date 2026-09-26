import { prisma } from '../lib/prisma';

export async function getPlants() {
  return prisma.plant.findMany({
    include: {
      areas: true,
    },
    orderBy: { name: 'asc' },
  });
}

export async function createPlant(data: { name: string; code: string }) {
  return prisma.plant.create({ data });
}

export async function getAreas(plantId?: string) {
  return prisma.area.findMany({
    where: plantId ? { plantId } : undefined,
    include: {
      plant: true,
      equipment: true,
      owners: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function createArea(data: { name: string; plantId: string }) {
  return prisma.area.create({ data });
}

export async function assignAreaOwner(areaId: string, userId: string) {
  return prisma.areaOwner.create({
    data: { areaId, userId },
    include: {
      area: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

export async function getEquipment(areaId?: string) {
  return prisma.equipment.findMany({
    where: areaId ? { areaId } : undefined,
    include: {
      area: {
        include: { plant: true },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function createEquipment(data: { name: string; tag: string; areaId: string }) {
  return prisma.equipment.create({ data });
}

export async function getUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      plantId: true,
      plant: true,
      createdAt: true,
    },
    orderBy: { name: 'asc' },
  });
}
