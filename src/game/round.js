// Betting round client. Talks to the backend; falls back to a local deterministic engine
// (same shared code) when offline so the PWA still works, with a local demo balance.
import { drawOutcome, buildPaytable, expectedRtp, WAVE_MULTIPLIERS } from '../../shared/rtp.js';

const LS = 'vs.player';
function localPlayer() {
  try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; }
}
function saveLocal(p) { try { localStorage.setItem(LS, JSON.stringify(p)); } catch { /* ignore */ } }

export class RoundClient {
  constructor() {
    const lp = localPlayer() || { id: 'guest-' + Math.random().toString(36).slice(2, 10), balance: 1000, nonce: 0, best: 0 };
    this.player = lp; saveLocal(lp);
    this.online = false;
    this.config = { rtp: 0.96, minBet: 0.1, maxBet: 100, multipliers: WAVE_MULTIPLIERS };
    this.bet = 1;
    this.round = null;
  }
  async init() {
    try {
      const r = await fetch('/api/config', { signal: AbortSignal.timeout(2500) });
      if (r.ok) {
        this.config = await r.json(); this.online = true;
        const p = await fetch(`/api/player/${this.player.id}`); if (p.ok) { const j = await p.json(); this.player.balance = j.balance; saveLocal(this.player); }
      }
    } catch { this.online = false; }
    this.config.effectiveRtp = this.config.effectiveRtp ?? expectedRtp(buildPaytable(this.config.rtp));
    return this;
  }
  get balance() { return this.player.balance; }
  setBet(b) { this.bet = Math.min(this.config.maxBet, Math.max(this.config.minBet, Math.round(b * 100) / 100)); return this.bet; }

  async start(characterId) {
    const clientSeed = Math.random().toString(36).slice(2);
    if (this.online) {
      try {
        const r = await fetch('/api/round/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerId: this.player.id, bet: this.bet, character: characterId, clientSeed }) });
        if (r.ok) { const j = await r.json(); this.player.balance = j.balance; saveLocal(this.player); this.round = { id: j.roundId, script: j.script, hash: j.serverSeedHash, nonce: j.nonce, bet: this.bet, online: true }; return this.round; }
        const err = await r.json().catch(() => ({})); throw new Error(err.error || 'round refused');
      } catch (e) { if (String(e.message).includes('insufficient')) throw e; this.online = false; }
    }
    if (this.player.balance < this.bet) throw new Error('insufficient balance');
    this.player.balance -= this.bet; this.player.nonce += 1; saveLocal(this.player);
    const serverSeed = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const script = drawOutcome({ serverSeed, clientSeed, nonce: this.player.nonce, rtp: this.config.rtp });
    this.round = { id: 'local-' + this.player.nonce, script, hash: 'offline', nonce: this.player.nonce, bet: this.bet, online: false, serverSeed };
    return this.round;
  }
  async settle(waveReached) {
    const r = this.round; if (!r) return null;
    let res;
    if (r.online) {
      try { const q = await fetch('/api/round/settle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roundId: r.id }) }); res = await q.json(); this.player.balance = res.balance; }
      catch { res = null; }
    }
    if (!res) {
      const payout = Math.round(r.bet * r.script.multiplier * 100) / 100;
      this.player.balance += payout;
      res = { payout, multiplier: r.script.multiplier, wave: r.script.deathWave, balance: this.player.balance, serverSeed: r.serverSeed };
    }
    this.player.best = Math.max(this.player.best || 0, waveReached);
    saveLocal(this.player);
    this.round = null;
    return res;
  }
}
