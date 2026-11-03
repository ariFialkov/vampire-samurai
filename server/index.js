// Vampire Samurai backend: the only place where round results are decided.
// The game client is a presentation layer over a strictly deterministic betting engine.
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawOutcome, buildPaytable, expectedRtp, WAVE_MULTIPLIERS } from '../shared/rtp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const config = {
  rtp: Number(process.env.RTP ?? 0.96),       // Return-to-player, adjustable at runtime
  minBet: 0.1,
  maxBet: 100,
  startingBalance: 1000,
};

// In-memory player store (replace with a database + real wallet for production).
const players = new Map();
const rounds = new Map();

function getPlayer(id) {
  if (!players.has(id)) players.set(id, { id, balance: config.startingBalance, nonce: 0 });
  return players.get(id);
}

app.get('/api/config', (_req, res) => {
  const probs = buildPaytable(config.rtp);
  res.json({ rtp: config.rtp, effectiveRtp: expectedRtp(probs), minBet: config.minBet, maxBet: config.maxBet, multipliers: WAVE_MULTIPLIERS });
});

// Operators adjust RTP here (protect with auth in production).
app.post('/api/config/rtp', (req, res) => {
  const rtp = Number(req.body?.rtp);
  if (!(rtp > 0 && rtp < 1.5)) return res.status(400).json({ error: 'rtp must be in (0, 1.5)' });
  config.rtp = rtp;
  res.json({ rtp });
});

app.get('/api/player/:id', (req, res) => {
  const p = getPlayer(req.params.id);
  res.json({ id: p.id, balance: p.balance });
});

app.post('/api/round/start', (req, res) => {
  const { playerId, bet, character, clientSeed } = req.body ?? {};
  if (!playerId) return res.status(400).json({ error: 'playerId required' });
  const amount = Number(bet);
  if (!(amount >= config.minBet && amount <= config.maxBet)) return res.status(400).json({ error: 'invalid bet' });
  const player = getPlayer(playerId);
  if (player.balance < amount) return res.status(402).json({ error: 'insufficient balance' });

  player.balance -= amount;
  player.nonce += 1;
  const serverSeed = crypto.randomBytes(16).toString('hex');
  const outcome = drawOutcome({ serverSeed, clientSeed: clientSeed ?? 'none', nonce: player.nonce, rtp: config.rtp });
  const roundId = crypto.randomUUID();
  rounds.set(roundId, {
    roundId, playerId, bet: amount, character, serverSeed, clientSeed, nonce: player.nonce,
    rtp: config.rtp, outcome, settled: false, startedAt: Date.now(),
  });
  // The client receives the seed + script. The serverSeed hash is published for
  // provably-fair verification; the seed itself is revealed at settlement.
  res.json({
    roundId,
    balance: player.balance,
    serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
    nonce: player.nonce,
    script: outcome,
  });
});

app.post('/api/round/settle', (req, res) => {
  const { roundId } = req.body ?? {};
  const round = rounds.get(roundId);
  if (!round) return res.status(404).json({ error: 'unknown round' });
  if (round.settled) return res.json({ payout: round.payout, balance: getPlayer(round.playerId).balance, serverSeed: round.serverSeed });
  // Payout is decided purely by the pre-drawn outcome, never by what the client reports.
  const payout = Math.round(round.bet * round.outcome.multiplier * 100) / 100;
  const player = getPlayer(round.playerId);
  player.balance += payout;
  round.settled = true;
  round.payout = payout;
  res.json({ payout, multiplier: round.outcome.multiplier, wave: round.outcome.deathWave, balance: player.balance, serverSeed: round.serverSeed });
});

// Serve the built client when available (npm run build).
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get(/^(?!\/api\/).*/, (_req, res, next) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'), (err) => err && next());
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Vampire Samurai server listening on :${port} (RTP ${config.rtp})`));
