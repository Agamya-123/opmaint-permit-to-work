import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

export interface LoginParams {
  email: string;
  password: string;
}

export interface RegisterParams {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  plantId?: string | null;
}

export async function login({ email, password }: LoginParams) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      plant: true,
      ownedAreas: {
        include: { area: true },
      },
    },
  });

  if (!user) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      plantId: user.plantId,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );

  const { passwordHash: _, ...userWithoutPassword } = user;

  return {
    user: userWithoutPassword,
    token,
  };
}

export async function register(data: RegisterParams) {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new Error('EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      plantId: data.plantId ?? null,
    },
    include: { plant: true },
  });

  const { passwordHash: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      plant: true,
      ownedAreas: {
        include: { area: true },
      },
    },
  });

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const { passwordHash: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}
