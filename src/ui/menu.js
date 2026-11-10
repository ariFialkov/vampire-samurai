// Title menu: character picker (left), wager & settings (right), "tap anywhere to play".
import { CHARACTERS } from '../entities/characters.js';
import { WAVE_MULTIPLIERS } from '../../shared/rtp.js';
import { icon } from './icons.js';

const STATS = [['power', '力', 'Power'], ['speed', '速', 'Speed'], ['reach', '間', 'Reach'], ['health', '体', 'Endurance']];

const $ = (id) => document.getElementById(id);

export class Menu {
  constructor(round, settings) {
    this.round = round; this.settings = settings;
    this.el = $('menu');
    this.selected = localStorage.getItem('vs.char') || 'katana';
    this.onPlay = null;
    this.renderCharacters();
    $('bet-minus').addEventListener('click', (e) => { e.stopPropagation(); this.step(-1); });
    $('bet-plus').addEventListener('click', (e) => { e.stopPropagation(); this.step(1); });
    for (const id of ['opt-quality', 'opt-shadows', 'opt-sound']) {
      const el = $(id); const key = id.slice(4);
      el.checked = settings[key];
      el.addEventListener('change', () => { settings[key] = el.checked; localStorage.setItem('vs.settings', JSON.stringify(settings)); if (key !== 'sound') this.toast?.('Graphics changes apply on next reload'); });
    }
    // Tap anywhere (outside the side panels) to play
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.side-group')) return;
      this.onPlay?.(this.selected);
    });
    this.el.style.pointerEvents = 'auto';
    this.refresh();
  }
  renderCharacters() {
    const list = $('character-list'); list.innerHTML = '';
    for (const c of CHARACTERS) {
      const card = document.createElement('div'); card.className = 'char-card' + (c.id === this.selected ? ' selected' : '');
      card.innerHTML = `<div class="char-mark" style="--accent:${c.swatch}">${icon(c.weapon)}</div>
        <div class="char-body"><div class="char-name">${c.name}</div><div class="char-desc">${c.desc}</div>
        <div class="char-stats">${STATS.map(([k, kanji, label]) => `<div class="stat" title="${label}"><b lang="ja">${kanji}</b><span><i style="width:${Math.round(c.stats[k] * 100)}%"></i></span></div>`).join('')}</div></div>`;
      card.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.selected = c.id; localStorage.setItem('vs.char', c.id); this.renderCharacters(); this.onSelect?.(c.id); });
      list.appendChild(card);
    }
  }
  /** Move the samurai selection up or down the list (controller / keyboard navigation). */
  cycleCharacter(d) {
    const i = CHARACTERS.findIndex((c) => c.id === this.selected);
    const next = CHARACTERS[(i + d + CHARACTERS.length) % CHARACTERS.length];
    this.selected = next.id; localStorage.setItem('vs.char', next.id);
    this.renderCharacters(); this.onSelect?.(next.id);
  }
  step(dir) {
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
    const cur = this.round.bet;
    let i = steps.findIndex((s) => Math.abs(s - cur) < 1e-6); if (i < 0) i = steps.findIndex((s) => s > cur) - 1;
    i = Math.max(0, Math.min(steps.length - 1, i + dir));
    this.round.setBet(steps[i]); this.refresh();
  }
  refresh() {
    $('bet-amount').textContent = this.round.bet.toFixed(2);
    $('balance').textContent = this.round.balance.toFixed(2);
    $('demo-tag').classList.toggle('hidden', this.round.online);
    const rtp = this.round.config.effectiveRtp ?? this.round.config.rtp;
    $('rtp').textContent = `${(rtp * 100).toFixed(1)}%`;
    $('best-wave').textContent = String(this.round.player.best || '—');
    const pt = $('paytable'); pt.innerHTML = '';
    for (let w = 8; w < WAVE_MULTIPLIERS.length; w += 4) { const s = document.createElement('span'); s.innerHTML = `<em>${w}</em>${WAVE_MULTIPLIERS[w]}&times;`; pt.appendChild(s); }
  }
  show() { this.el.classList.remove('hidden'); $('menu-left').classList.remove('away'); $('menu-right').classList.remove('away'); $('tap-to-play').style.display = ''; this.refresh(); }
  /** Slide the side groups off the edges, fade the prompt, then hide. */
  hide() {
    $('menu-left').classList.add('away'); $('menu-right').classList.add('away'); $('tap-to-play').style.display = 'none';
    setTimeout(() => this.el.classList.add('hidden'), 600);
  }
}
