import type { PaperPolicyProfile } from '@polyrader/core';
import { DEFAULT_PAPER_POLICY } from '@polyrader/core';
import { PaperPolicyRepository, SimAccountRepository, SimBetRepository } from '@polyrader/infra';

export class PaperPolicyService {
  private repo = new PaperPolicyRepository();
  private bets = new SimBetRepository();
  private accounts = new SimAccountRepository();

  list() {
    this.repo.ensureDefault();
    return this.repo.list();
  }

  getActive(): PaperPolicyProfile {
    return this.repo.ensureDefault().policy;
  }

  getActiveRecord() {
    return this.repo.ensureDefault();
  }

  getRiskState(accountId = 'default') {
    const account =
      accountId === 'default'
        ? this.accounts.getDefault()
        : (this.accounts.getById(accountId) ?? this.accounts.getDefault());
    const policy = this.getActive();
    const exposure = this.bets.getExposureBreakdown(account.id);
    return {
      accountId: account.id,
      policyVersion: policy.policyVersion,
      exposure,
      limits: {
        maxSingleStake: Math.min(
          policy.maxSingleStake,
          account.currentBankroll * account.maxSingleRiskPct,
        ),
        maxDailyStake: Math.min(
          policy.maxDailyStake,
          account.currentBankroll * account.maxDailyRiskPct,
        ),
        maxOpenExposure: policy.maxOpenExposure,
        maxGameExposure: policy.maxGameExposure,
        maxProviderExposure: policy.maxProviderExposure,
        maxMarketKindExposure: policy.maxMarketKindExposure,
      },
    };
  }

  upsert(input: {
    id?: string;
    name: string;
    policy: Partial<PaperPolicyProfile>;
    isActive?: boolean;
  }) {
    const policy: PaperPolicyProfile = {
      ...DEFAULT_PAPER_POLICY,
      ...input.policy,
      policyVersion: input.policy.policyVersion ?? DEFAULT_PAPER_POLICY.policyVersion,
    };
    this.assertValid(policy);
    return this.repo.upsert({
      id: input.id,
      name: input.name,
      policy,
      isActive: input.isActive ?? true,
    });
  }

  activate(id: string) {
    return this.repo.activate(id);
  }

  private assertValid(policy: PaperPolicyProfile): void {
    const probabilityFields: Array<keyof PaperPolicyProfile> = [
      'minimumCompleteness',
      'minimumConfidence',
      'minimumEdge',
      'bankrollFraction',
    ];
    for (const key of probabilityFields) {
      const value = Number(policy[key]);
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`${key} must be between 0 and 1`);
      }
    }
    const nonNegativeFields: Array<keyof PaperPolicyProfile> = [
      'lowLiquidityThresholdUsd',
      'maxSingleStake',
      'maxDailyStake',
      'maxOpenExposure',
      'maxGameExposure',
      'maxProviderExposure',
      'maxMarketKindExposure',
      'fixedStake',
    ];
    for (const key of nonNegativeFields) {
      const value = Number(policy[key]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${key} must be a non-negative number`);
      }
    }
    if (!Number.isInteger(policy.maximumFreshnessSeconds) || policy.maximumFreshnessSeconds <= 0) {
      throw new Error('maximumFreshnessSeconds must be a positive integer');
    }
  }
}
