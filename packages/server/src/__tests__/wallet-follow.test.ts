import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { runMigrations, closeDb, MarketRepository, WalletFollowRepository } from '@polyrader/infra';
import { WalletFollowService } from '../services/wallet-follow-service';

const testDbPath = path.join(process.cwd(), 'data', 'wallet-follow-test.db');

describe('WalletFollowService', () => {
  beforeEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    process.env.DATABASE_URL = testDbPath;
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.DATABASE_URL;
  });

  it('rejects live mode when credentials are missing', () => {
    const service = new WalletFollowService();
    expect(() => service.updateConfig({ mode: 'live', enabled: true })).toThrow();
    const config = service.getConfig();
    expect(config.mode).toBe('paper');
  });

  it('follows and lists a wallet address', () => {
    const service = new WalletFollowService();
    const address = '0x1234567890123456789012345678901234567890';
    service.follow({ address, alertsEnabled: true });
    const list = service.listFollowed();
    expect(list.some((w) => w.address === address.toLowerCase())).toBe(true);
  });

  it('updates followed wallet alert and auto-copy toggles', () => {
    const service = new WalletFollowService();
    const address = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    service.follow({ address, alertsEnabled: true, autoCopyEnabled: false });
    const updated = service.updateFollow(address, { alertsEnabled: false, autoCopyEnabled: true });
    expect(updated.alertsEnabled).toBe(false);
    expect(updated.autoCopyEnabled).toBe(true);
  });

  it('settles filled paper copy trades against resolved markets', async () => {
    const service = new WalletFollowService();
    const marketRepo = new MarketRepository();
    const repo = new WalletFollowRepository();

    marketRepo.upsert({
      conditionId: 'cond-settle-1',
      slug: 'spirit-vs-g2-settle',
      question: 'Counter-Strike: Spirit vs G2 (BO3)',
      description: '',
      outcomes: ['Yes', 'No'],
      outcomePrices: ['0.6', '0.4'],
      clobTokenIds: ['token-yes', 'token-no'],
      volume: 100000,
      volume24h: 50000,
      liquidity: 10000,
      endDate: '2026-12-01',
      startDate: '2026-06-01',
      status: 'resolved',
      tags: ['cs2'],
      resolvedOutcome: 'Yes',
      resolvedPrice: 1,
    });

    service.updateConfig({
      enabled: true,
      requireUserConfirm: false,
      minLeaderSamples: 0,
      minLeaderWinRate: 0,
      minLeaderRoi: 0,
    });
    const signal = repo.insertSignal({
      leaderAddress: '0xleader',
      leaderTxHash: `0x${randomUUID().replace(/-/g, '')}`,
      tokenId: 'token-yes',
      conditionId: 'cond-settle-1',
      marketQuestion: 'Counter-Strike: Spirit vs G2 (BO3)',
      outcome: 'Yes',
      side: 'buy',
      leaderAmount: 5000,
      leaderPrice: 0.6,
      suggestedAmount: 100,
      leaderWinRate: 0.65,
      leaderSettledBets: 20,
      status: 'pending',
    });
    expect(signal).not.toBeNull();

    await service.executeSignal(signal!.id);
    const result = service.settleCopyTrades();
    expect(result.settled).toBe(1);

    const summary = service.getCopyTradeSummary();
    expect(summary.settled).toBe(1);
    expect(summary.wins).toBe(1);
    expect(summary.totalPnl).toBeGreaterThan(0);
  });
});
