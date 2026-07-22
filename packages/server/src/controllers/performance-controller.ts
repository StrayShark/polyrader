import type { Request, Response } from 'express';
import { PerformanceService } from '../services/performance-service';

export class PerformanceController {
  private service = new PerformanceService();

  getSummary(req: Request, res: Response): void {
    try {
      const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : 'default';
      res.json({ data: this.service.getSummary(accountId) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
}
