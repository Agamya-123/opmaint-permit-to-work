import { Request, Response, NextFunction } from 'express';
import { login as loginService, register as registerService, getUserProfile } from '../services/auth.service';
import { registerSchema, loginSchema } from '../schemas/auth.schema';
import { UserRole } from '@prisma/client';

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await loginService({ email, password });
    res.json(result);
  } catch (err: any) {
    if (err.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }
    next(err);
  }
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const validated = registerSchema.parse({
      ...req.body,
      role: req.body.role as UserRole,
    });
    const user = await registerService(validated);
    res.status(201).json(user);
  } catch (err: any) {
    if (err.message === 'EMAIL_EXISTS') {
      return res.status(409).json({ error: 'EMAIL_EXISTS', message: 'A user with this email already exists' });
    }
    next(err);
  }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    const profile = await getUserProfile(req.user.id);
    res.json(profile);
  } catch (err: any) {
    if (err.message === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    next(err);
  }
}
