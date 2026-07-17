import type { SimAccount } from '@polyrader/core';
import { SimAccountRepository } from '@polyrader/infra';

export class SimAccountService {
  private repo = new SimAccountRepository();

  getDefaultAccount(): SimAccount {
    return this.repo.getDefault();
  }

  updateAccount(id: string, updates: Partial<SimAccount>): SimAccount {
    return this.repo.update(id, updates);
  }
}
