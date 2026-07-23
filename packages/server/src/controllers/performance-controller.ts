import type { Request, Response } from 'express';
import type { PerformanceFilters } from '@polyrader/core';
import { PerformanceService } from '../services/performance-service';

export class PerformanceController {
  private service = new PerformanceService();

  getSummary(req: Request, res: Response): void {
    try {
      const query = req.query as PerformanceFilters & { accountId?: string };
      const { accountId = 'default', ...filters } = query;
      res.json({ data: this.service.getSummary(accountId, filters) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
}
