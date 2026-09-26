import { Request, Response, NextFunction } from 'express';
import {
  createPermitSchema,
  updatePermitSchema,
  permitActionSchema,
  getPermitsQuerySchema,
  logWorkSchema,
} from '../schemas/permit.schema';
import * as permitService from '../services/permit.service';

export async function createPermit(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createPermitSchema.parse(req.body);
    // Explicitly unwrap JSON for typeData if it's there
    const permit = await permitService.createPermit(data, req.user!.id);
    res.status(201).json(permit);
  } catch (err) {
    next(err);
  }
}

export async function updatePermit(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updatePermitSchema.parse(req.body);
    const permit = await permitService.updatePermit(req.params.id, data, req.user!.id);
    res.json(permit);
  } catch (err) {
    next(err);
  }
}

export async function getPermits(req: Request, res: Response, next: NextFunction) {
  try {
    const query = getPermitsQuerySchema.parse(req.query);
    const result = await permitService.getPermits(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getPermit(req: Request, res: Response, next: NextFunction) {
  try {
    const permit = await permitService.getPermit(req.params.id);
    if (!permit) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Permit not found' });
    }
    res.json(permit);
  } catch (err) {
    next(err);
  }
}

export async function performAction(req: Request, res: Response, next: NextFunction) {
  try {
    const { action, reason } = permitActionSchema.parse(req.body);
    const permitId = req.params.id;
    const actorId = req.user!.id;

    let result;
    switch (action) {
      case 'SUBMIT':
        result = await permitService.submitPermit(permitId, actorId);
        break;
      case 'APPROVE':
        result = await permitService.approvePermit(permitId, actorId, reason);
        break;
      case 'REJECT':
        result = await permitService.rejectPermit(permitId, actorId, reason);
        break;
      case 'ACTIVATE':
        result = await permitService.activatePermit(permitId, actorId);
        break;
      case 'SUSPEND':
        result = await permitService.suspendPermit(permitId, actorId, reason);
        break;
      case 'RESUME':
        // Resume requires re-approval technically based on state machine, but depends on logic.
        result = await permitService.resumePermit(permitId, actorId, reason);
        break;
      case 'CLOSE':
        result = await permitService.closePermit(permitId, actorId, reason);
        break;
      case 'VERIFY_CLOSURE':
        result = await permitService.verifyClosure(permitId, actorId, reason);
        break;
      case 'CANCEL':
        result = await permitService.cancelPermit(permitId, actorId, reason);
        break;
      default:
        return res.status(400).json({ error: 'INVALID_ACTION', message: 'Unknown action' });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function logWork(req: Request, res: Response, next: NextFunction) {
  try {
    const { notes, hoursLogged } = logWorkSchema.parse(req.body);
    const result = await permitService.logWork(req.params.id, req.user!.id, notes, hoursLogged);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const readiness = await permitService.checkActivationReadiness(req.params.id);
    res.json(readiness);
  } catch (err) {
    next(err);
  }
}
