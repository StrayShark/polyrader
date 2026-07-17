import type { Request, Response } from 'express';
import { SimAccountService } from '../services/sim-account-service';
import { SimBetService } from '../services/sim-bet-service';
import { BankrollService } from '../services/bankroll-service';
import { ReviewService } from '../services/review-service';
import { StrategyProfileService } from '../services/strategy-profile-service';
import { TrainingSessionService } from '../services/training-session-service';

export class SimController {
  private accountService = new SimAccountService();
  private betService = new SimBetService();
  private bankrollService = new BankrollService();
  private reviewService = new ReviewService();
  private profileService = new StrategyProfileService();
  private trainingService = new TrainingSessionService();

  // Account
  getAccount(_req: Request, res: Response): void {
    try {
      const account = this.accountService.getDefaultAccount();
      res.json({ data: account });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  updateAccount(req: Request, res: Response): void {
    try {
      const { id = 'default' } = req.params;
      const account = this.accountService.updateAccount(id, req.body);
      res.json({ data: account });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  // Bankroll
  getBankroll(req: Request, res: Response): void {
    try {
      const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : 'default';
      const granularity = (typeof req.query.granularity === 'string' ? req.query.granularity : 'day') as 'day' | 'week' | 'month' | 'all';
      const summary = this.bankrollService.getSummary(accountId, granularity);
      res.json({ data: summary });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  // Bets
  listBets(req: Request, res: Response): void {
    try {
      const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : 'default';
      const status = req.query.status as 'open' | 'settled' | 'voided' | undefined;
      const bets = this.betService.listBets(accountId, status);
      res.json({ data: bets });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  getBet(req: Request, res: Response): void {
    try {
      const result = this.betService.getBet(req.params.id);
      if (!result) {
        res.status(404).json({ error: 'Bet not found' });
        return;
      }
      res.json({ data: result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  placeBet(req: Request, res: Response): void {
    try {
      const placed = this.betService.placeBet(req.body);
      res.status(201).json({ data: placed });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  settleBet(req: Request, res: Response): void {
    try {
      const { result, pnl } = req.body as { result: 'won' | 'lost' | 'push'; pnl?: number };
      const bet = this.betService.settleBet(req.params.id, result, pnl);
      res.json({ data: bet });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  // Reviews
  listReviews(req: Request, res: Response): void {
    try {
      const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : 'default';
      const reviews = this.reviewService.listSettledForReview(accountId);
      res.json({ data: reviews });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  getReview(req: Request, res: Response): void {
    try {
      const detail = this.reviewService.getReviewDetail(req.params.id);
      if (!detail) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }
      res.json({ data: detail });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  createOrUpdateReview(req: Request, res: Response): void {
    try {
      const review = this.reviewService.createOrUpdate({ betId: req.params.id, ...req.body });
      res.json({ data: review });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  getSnapshotsForBet(req: Request, res: Response): void {
    try {
      const snapshots = this.reviewService.getSnapshotsForBet(req.params.id);
      res.json({ data: snapshots });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  // Strategy Profiles
  listProfiles(_req: Request, res: Response): void {
    try {
      const profiles = this.profileService.listProfiles('default');
      res.json({ data: profiles });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  createProfile(req: Request, res: Response): void {
    try {
      const profile = this.profileService.createProfile('default', req.body);
      res.status(201).json({ data: profile });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  getProfile(req: Request, res: Response): void {
    try {
      const profile = this.profileService.getProfile(req.params.id);
      if (!profile) {
        res.status(404).json({ error: 'Strategy profile not found' });
        return;
      }
      res.json({ data: profile });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  updateProfile(req: Request, res: Response): void {
    try {
      const profile = this.profileService.updateProfile(req.params.id, req.body);
      res.json({ data: profile });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  deleteProfile(req: Request, res: Response): void {
    try {
      this.profileService.deleteProfile(req.params.id);
      res.json({ data: { ok: true } });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  activateProfile(req: Request, res: Response): void {
    try {
      const profile = this.profileService.activateProfile(req.params.id, 'default');
      res.json({ data: profile });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  // Training Sessions
  listTrainingSessions(_req: Request, res: Response): void {
    try {
      const sessions = this.trainingService.listSessions('default');
      res.json({ data: sessions });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  createTrainingSession(req: Request, res: Response): void {
    try {
      const session = this.trainingService.createSession('default', req.body);
      res.status(201).json({ data: session });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  getTrainingSession(req: Request, res: Response): void {
    try {
      const session = this.trainingService.getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Training session not found' });
        return;
      }
      res.json({ data: session });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  updateTrainingSession(req: Request, res: Response): void {
    try {
      const session = this.trainingService.updateSession(req.params.id, req.body);
      res.json({ data: session });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  deleteTrainingSession(req: Request, res: Response): void {
    try {
      this.trainingService.deleteSession(req.params.id);
      res.json({ data: { ok: true } });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  refreshTrainingSessionProgress(req: Request, res: Response): void {
    try {
      const session = this.trainingService.refreshProgress(req.params.id);
      res.json({ data: session });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
}
