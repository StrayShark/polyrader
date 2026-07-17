import {
  StrategyProfileRepository,
  SignalRepository,
  SimAccountRepository,
} from '@polyrader/infra';
import type {
  StrategyProfile,
  CreateStrategyProfileInput,
  UpdateStrategyProfileInput,
} from '@polyrader/core';

export class StrategyProfileService {
  private profileRepo = new StrategyProfileRepository();
  private signalRepo = new SignalRepository();
  private accountRepo = new SimAccountRepository();

  listProfiles(accountId = 'default'): StrategyProfile[] {
    return this.profileRepo.list(accountId);
  }

  getProfile(id: string): StrategyProfile | undefined {
    return this.profileRepo.getById(id);
  }

  createProfile(accountId = 'default', input: CreateStrategyProfileInput): StrategyProfile {
    return this.profileRepo.create(accountId, input);
  }

  updateProfile(id: string, input: UpdateStrategyProfileInput): StrategyProfile {
    return this.profileRepo.update(id, input);
  }

  deleteProfile(id: string): void {
    this.profileRepo.delete(id);
  }

  activateProfile(id: string, accountId = 'default'): StrategyProfile {
    const profile = this.profileRepo.getById(id);
    if (!profile) throw new Error(`StrategyProfile ${id} not found`);
    if (profile.accountId !== accountId) {
      throw new Error('Profile does not belong to this account');
    }

    // Apply weights/thresholds to the active signal tuning config.
    this.signalRepo.updateTuningConfig({
      sourceWeights: profile.sourceWeights,
      behaviorWeights: profile.behaviorWeights,
      recommendation: profile.recommendation,
    });

    // Optionally apply capital params to the practice account.
    if (profile.capitalParams) {
      const updates: Partial<{
        initialBankroll: number;
        maxSingleRiskPct: number;
        maxDailyRiskPct: number;
      }> = {};
      if (profile.capitalParams.initialBankroll !== undefined) {
        updates.initialBankroll = profile.capitalParams.initialBankroll;
      }
      if (profile.capitalParams.maxSingleRiskPct !== undefined) {
        updates.maxSingleRiskPct = profile.capitalParams.maxSingleRiskPct;
      }
      if (profile.capitalParams.maxDailyRiskPct !== undefined) {
        updates.maxDailyRiskPct = profile.capitalParams.maxDailyRiskPct;
      }
      if (Object.keys(updates).length > 0) {
        this.accountRepo.update(accountId, updates);
      }
    }

    return this.profileRepo.setActive(id, accountId);
  }
}
