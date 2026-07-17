import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { runMigrations, closeDb } from '@polyrader/infra';
import { SimController } from '../controllers/sim-controller';
import { validate } from '../validation';
import {
  placeSimBetBodySchema,
  settleSimBetBodySchema,
  createSimReviewBodySchema,
} from '../validation/schemas';

const testDbPath = path.join(process.cwd(), 'data', 'sim-api-test.db');

function createSimApp() {
  const app = express();
  app.use(express.json());

  const simCtrl = new SimController();

  app.get('/api/sim/account', (req, res) => simCtrl.getAccount(req, res));
  app.put('/api/sim/account/:id', (req, res) => simCtrl.updateAccount(req, res));
  app.get('/api/sim/bankroll', (req, res) => simCtrl.getBankroll(req, res));
  app.get('/api/sim/bets', (req, res) => simCtrl.listBets(req, res));
  app.post('/api/sim/bets', validate(placeSimBetBodySchema), (req, res) => simCtrl.placeBet(req, res));
  app.get('/api/sim/bets/:id', (req, res) => simCtrl.getBet(req, res));
  app.patch('/api/sim/bets/:id/settle', validate(settleSimBetBodySchema), (req, res) => simCtrl.settleBet(req, res));
  app.get('/api/sim/reviews', (req, res) => simCtrl.listReviews(req, res));
  app.get('/api/sim/bets/:id/review', (req, res) => simCtrl.getReview(req, res));
  app.post('/api/sim/bets/:id/review', validate(createSimReviewBodySchema), (req, res) => simCtrl.createOrUpdateReview(req, res));
  app.get('/api/sim/bets/:id/snapshots', (req, res) => simCtrl.getSnapshotsForBet(req, res));

  return app;
}

describe('/api/sim/* integration', () => {
  let app: ReturnType<typeof createSimApp>;

  beforeEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    process.env.DATABASE_URL = testDbPath;
    runMigrations();
    app = createSimApp();
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.DATABASE_URL;
  });

  it('GET /api/sim/account returns default practice account', async () => {
    const res = await request(app).get('/api/sim/account').expect(200);
    expect(res.body.data.id).toBe('default');
    expect(res.body.data.currentBankroll).toBe(10000);
  });

  it('PUT /api/sim/account/:id updates risk params', async () => {
    const res = await request(app)
      .put('/api/sim/account/default')
      .send({ maxSingleRiskPct: 0.05, maxDailyRiskPct: 0.15 })
      .expect(200);

    expect(res.body.data.maxSingleRiskPct).toBe(0.05);
    expect(res.body.data.maxDailyRiskPct).toBe(0.15);
  });

  it('GET /api/sim/bankroll returns summary and equity curve', async () => {
    const res = await request(app).get('/api/sim/bankroll').expect(200);
    expect(res.body.data.account.currentBankroll).toBe(10000);
    expect(res.body.data.openExposure).toBe(0);
    expect(Array.isArray(res.body.data.equityCurve)).toBe(true);
  });

  it('POST /api/sim/bets places a single practice bet', async () => {
    const res = await request(app)
      .post('/api/sim/bets')
      .send({
        betType: 'single',
        stake: 100,
        legs: [{ selection: 'Team A', odds: 2.0, matchId: 'match-1', marketId: 'market-1' }],
        userProbability: 0.6,
        reasoning: 'Practice bet via API',
      })
      .expect(201);

    expect(res.body.data.bet.status).toBe('open');
    expect(res.body.data.bet.userProbability).toBe(0.6);
    expect(res.body.data.legs).toHaveLength(1);
  });

  it('POST /api/sim/bets rejects bets exceeding risk limits', async () => {
    const res = await request(app)
      .post('/api/sim/bets')
      .send({
        betType: 'single',
        stake: 500,
        legs: [{ selection: 'Team A', odds: 2.0 }],
      })
      .expect(400);

    expect(res.body.error).toMatch(/exceeds max single risk/);
  });

  it('GET /api/sim/bets lists open bets', async () => {
    await request(app)
      .post('/api/sim/bets')
      .send({
        betType: 'single',
        stake: 100,
        legs: [{ selection: 'Team A', odds: 2.0 }],
      })
      .expect(201);

    const res = await request(app).get('/api/sim/bets?status=open').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('open');
  });

  it('PATCH /api/sim/bets/:id/settle settles a bet', async () => {
    const placed = await request(app)
      .post('/api/sim/bets')
      .send({
        betType: 'single',
        stake: 100,
        legs: [{ selection: 'Team A', odds: 2.0 }],
      })
      .expect(201);

    const betId = placed.body.data.bet.id;

    const settled = await request(app)
      .patch(`/api/sim/bets/${betId}/settle`)
      .send({ result: 'won' })
      .expect(200);

    expect(settled.body.data.status).toBe('settled');
    expect(settled.body.data.pnl).toBe(100);
  });

  it('POST /api/sim/bets/:id/review creates a review', async () => {
    const placed = await request(app)
      .post('/api/sim/bets')
      .send({
        betType: 'single',
        stake: 100,
        legs: [{ selection: 'Team A', odds: 2.0 }],
      })
      .expect(201);

    const betId = placed.body.data.bet.id;

    await request(app)
      .patch(`/api/sim/bets/${betId}/settle`)
      .send({ result: 'lost' })
      .expect(200);

    const review = await request(app)
      .post(`/api/sim/bets/${betId}/review`)
      .send({
        errorTags: ['overestimated_favorite'],
        note: 'Review note',
        closingOdds: 1.9,
      })
      .expect(200);

    expect(review.body.data.errorTags).toEqual(['overestimated_favorite']);
    expect(review.body.data.note).toBe('Review note');
  });

  it('GET /api/sim/bets/:id/snapshots returns captured odds snapshots', async () => {
    const placed = await request(app)
      .post('/api/sim/bets')
      .send({
        betType: 'single',
        stake: 100,
        legs: [{ selection: 'Team A', odds: 2.0, matchId: 'match-1', marketId: 'market-1' }],
      })
      .expect(201);

    const betId = placed.body.data.bet.id;

    const res = await request(app).get(`/api/sim/bets/${betId}/snapshots`).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].selection).toBe('Team A');
  });
});
