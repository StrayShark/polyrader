import type { Request, Response } from 'express';
import { PaperPolicyService } from '../services/paper-policy-service';
import { AnalysisRunRepository } from '@polyrader/infra';

export class PaperPolicyController {
  private service = new PaperPolicyService();
  private runs = new AnalysisRunRepository();

  list(_req: Request, res: Response): void {
    try {
      res.json({ data: this.service.list() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  getActive(_req: Request, res: Response): void {
    try {
      res.json({ data: this.service.getActiveRecord() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  upsert(req: Request, res: Response): void {
    try {
      const record = this.service.upsert({
        id: typeof req.body.id === 'string' ? req.body.id : undefined,
        name: String(req.body.name ?? 'custom'),
        policy: req.body.policy ?? {},
        isActive: req.body.isActive !== false,
      });
      res.status(201).json({ data: record });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  activate(req: Request, res: Response): void {
    try {
      const record = this.service.activate(String(req.params.id));
      res.json({ data: record });
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
    }
  }

  /** Decision trace for paper orders / pass / rejected linked to analysis runs. */
  listDecisions(req: Request, res: Response): void {
    try {
      const limit = Number(req.query.limit ?? 50);
      const action = typeof req.query.action === 'string' ? req.query.action : undefined;
      const rows = this.runs.listPaperDecisions(Number.isFinite(limit) ? limit : 50, action);
      res.json({ data: rows });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
}
