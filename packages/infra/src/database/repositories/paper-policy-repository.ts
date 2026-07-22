import { randomUUID } from 'crypto';
import type { PaperPolicyProfile } from '@polyrader/core';
import { DEFAULT_PAPER_POLICY } from '@polyrader/core';
import { query, queryOne, transaction } from '../connection';

export interface PaperPolicyProfileRecord {
  id: string;
  name: string;
  policyVersion: string;
  policy: PaperPolicyProfile;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export class PaperPolicyRepository {
  list(): PaperPolicyProfileRecord[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM paper_policy_profiles ORDER BY is_active DESC, updated_at DESC`,
    ).map(mapRow);
  }

  getActive(): PaperPolicyProfileRecord | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM paper_policy_profiles WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1`,
    );
    return row ? mapRow(row) : undefined;
  }

  getById(id: string): PaperPolicyProfileRecord | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM paper_policy_profiles WHERE id = ?`,
      id,
    );
    return row ? mapRow(row) : undefined;
  }

  ensureDefault(): PaperPolicyProfileRecord {
    const existing = this.getActive() ?? this.list()[0];
    if (existing) return existing;
    return this.upsert({
      name: 'balanced-v1',
      policy: DEFAULT_PAPER_POLICY,
      isActive: true,
    });
  }

  upsert(input: {
    id?: string;
    name: string;
    policy: PaperPolicyProfile;
    isActive?: boolean;
  }): PaperPolicyProfileRecord {
    const id = input.id ?? `pp-${randomUUID()}`;
    const now = new Date().toISOString();
    transaction(() => {
      if (input.isActive) {
        query(`UPDATE paper_policy_profiles SET is_active = 0`);
      }
      query(
        `INSERT INTO paper_policy_profiles (
          id, name, policy_version, policy_json, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          policy_version = excluded.policy_version,
          policy_json = excluded.policy_json,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at`,
        id,
        input.name,
        input.policy.policyVersion,
        JSON.stringify(input.policy),
        input.isActive ? 1 : 0,
        now,
        now,
      );
    });
    return this.getById(id)!;
  }

  activate(id: string): PaperPolicyProfileRecord {
    const current = this.getById(id);
    if (!current) throw new Error(`Paper policy ${id} not found`);
    transaction(() => {
      query(`UPDATE paper_policy_profiles SET is_active = 0`);
      query(
        `UPDATE paper_policy_profiles SET is_active = 1, updated_at = ? WHERE id = ?`,
        new Date().toISOString(),
        id,
      );
    });
    return this.getById(id)!;
  }
}

function mapRow(row: Record<string, unknown>): PaperPolicyProfileRecord {
  const storedPolicy = JSON.parse(String(row.policy_json)) as Partial<PaperPolicyProfile>;
  const policy: PaperPolicyProfile = {
    ...DEFAULT_PAPER_POLICY,
    ...storedPolicy,
    policyVersion:
      storedPolicy.maximumFreshnessSeconds == null
        ? DEFAULT_PAPER_POLICY.policyVersion
        : (storedPolicy.policyVersion ?? DEFAULT_PAPER_POLICY.policyVersion),
  };
  return {
    id: String(row.id),
    name: String(row.name),
    policyVersion: policy.policyVersion,
    policy,
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
