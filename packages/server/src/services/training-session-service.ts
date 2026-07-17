import {
  TrainingSessionRepository,
  SimBetRepository,
  SimAccountRepository,
} from '@polyrader/infra';
import type {
  TrainingSession,
  CreateTrainingSessionInput,
  UpdateTrainingSessionInput,
  TrainingGoalTarget,
} from '@polyrader/core';

export class TrainingSessionService {
  private sessionRepo = new TrainingSessionRepository();
  private betRepo = new SimBetRepository();
  private accountRepo = new SimAccountRepository();

  listSessions(accountId = 'default'): TrainingSession[] {
    return this.sessionRepo.list(accountId);
  }

  getSession(id: string): TrainingSession | undefined {
    return this.sessionRepo.getById(id);
  }

  createSession(accountId = 'default', input: CreateTrainingSessionInput): TrainingSession {
    const session = this.sessionRepo.create(accountId, input);
    return this.computeProgress(session);
  }

  updateSession(id: string, input: UpdateTrainingSessionInput): TrainingSession {
    const session = this.sessionRepo.update(id, input);
    return this.computeProgress(session);
  }

  deleteSession(id: string): void {
    this.sessionRepo.delete(id);
  }

  refreshProgress(id: string): TrainingSession {
    const session = this.sessionRepo.getById(id);
    if (!session) throw new Error(`TrainingSession ${id} not found`);
    const updated = this.computeProgress(session);
    if (updated.progress !== session.progress || updated.status !== session.status) {
      return this.sessionRepo.update(id, {
        progress: updated.progress,
        status: updated.status,
      });
    }
    return updated;
  }

  private computeProgress(session: TrainingSession): TrainingSession {
    const account = this.accountRepo.getById(session.accountId) ?? this.accountRepo.getDefault();
    const bets = this.betRepo.getByAccount(session.accountId)
      .filter((b) => new Date(b.placedAt) >= new Date(session.startAt))
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());

    let progress = 0;

    switch (session.type) {
      case 'consecutive_reasoning':
        progress = this.computeConsecutiveReasoning(bets, session.target);
        break;
      case 'single_risk_limit':
        progress = this.computeSingleRiskLimit(bets, session.target, account.currentBankroll);
        break;
      case 'high_confidence_bets':
        progress = this.computeHighConfidence(bets, session.target);
        break;
    }

    const clamped = Math.min(1, Math.max(0, progress));
    const status = clamped >= 1 ? 'completed' : session.status === 'completed' ? 'completed' : session.status;

    return { ...session, progress: clamped, status };
  }

  private computeConsecutiveReasoning(
    bets: { placedAt: string; reasoning?: string }[],
    target: TrainingGoalTarget,
  ): number {
    const targetCount = target.count ?? 1;
    let consecutive = 0;
    for (const bet of bets) {
      if (bet.reasoning && bet.reasoning.trim().length > 0) {
        consecutive++;
      } else {
        break;
      }
    }
    return consecutive / targetCount;
  }

  private computeSingleRiskLimit(
    bets: { placedAt: string; stake: number }[],
    target: TrainingGoalTarget,
    bankroll: number,
  ): number {
    const maxRiskPct = target.maxRiskPct ?? 0.02;
    if (bankroll <= 0) return 0;
    if (bets.length === 0) return 0;
    const compliant = bets.filter((b) => b.stake / bankroll <= maxRiskPct).length;
    return compliant / bets.length;
  }

  private computeHighConfidence(
    bets: { placedAt: string; edge?: number }[],
    target: TrainingGoalTarget,
  ): number {
    const targetCount = target.count ?? 1;
    const minEdge = target.minEdge ?? 0.05;
    const matched = bets.filter((b) => (b.edge ?? 0) >= minEdge).length;
    return matched / targetCount;
  }
}
