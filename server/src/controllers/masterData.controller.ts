import { Request, Response, NextFunction } from 'express';
import * as masterDataService from '../services/masterData.service';

export async function getPlants(req: Request, res: Response, next: NextFunction) {
  try {
    const plants = await masterDataService.getPlants();
    res.json(plants);
  } catch (err) {
    next(err);
  }
}

export async function createPlant(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, code } = req.body;
    const plant = await masterDataService.createPlant({ name, code });
    res.status(201).json(plant);
  } catch (err) {
    next(err);
  }
}

export async function getAreas(req: Request, res: Response, next: NextFunction) {
  try {
    const plantId = req.query.plantId as string | undefined;
    const areas = await masterDataService.getAreas(plantId);
    res.json(areas);
  } catch (err) {
    next(err);
  }
}

export async function createArea(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, plantId } = req.body;
    const area = await masterDataService.createArea({ name, plantId });
    res.status(201).json(area);
  } catch (err) {
    next(err);
  }
}

export async function assignAreaOwner(req: Request, res: Response, next: NextFunction) {
  try {
    const areaId = req.params.id;
    const { userId } = req.body;
    const assignment = await masterDataService.assignAreaOwner(areaId, userId);
    res.status(201).json(assignment);
  } catch (err) {
    next(err);
  }
}

export async function getEquipment(req: Request, res: Response, next: NextFunction) {
  try {
    const areaId = req.query.areaId as string | undefined;
    const equipment = await masterDataService.getEquipment(areaId);
    res.json(equipment);
  } catch (err) {
    next(err);
  }
}

export async function createEquipment(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, tag, areaId } = req.body;
    const equipment = await masterDataService.createEquipment({ name, tag, areaId });
    res.status(201).json(equipment);
  } catch (err) {
    next(err);
  }
}

export async function getUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await masterDataService.getUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}
