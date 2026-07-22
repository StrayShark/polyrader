import type { PaperPolicyProfile } from '@polyrader/core';
import { DEFAULT_PAPER_POLICY } from '@polyrader/core';
import { PaperPolicyRepository } from '@polyrader/infra';

export class PaperPolicyService {
  private repo = new PaperPolicyRepository();

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
}
