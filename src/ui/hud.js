// In-game HUD: health, wave, the five item slots, banners and toasts.
import { ITEMS } from '../entities/collectibles.js';
import { WEAPONS, RUBS } from '../entities/weapons.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = $('hud');
    this.slotsEl = $('slots');
    this.slotEls = [];
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('div'); s.className = 'slot';
      s.innerHTML = `<span class="key">${i + 1}</span><span class="icon"></span><span class="count"></span><span class="tag"></span>`;
      s.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onSlotTap?.(i); });
      this.slotsEl.appendChild(s); this.slotEls.push(s);
    }
    this.toastTimer = 0;
    this.player = null;
    this.slotSig = '';
    for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
    this.statusEl = document.getElementById('wave-sub');
    this.hurtEl = document.createElement('div'); this.hurtEl.className = 'hurt-flash'; document.body.appendChild(this.hurtEl);
    const vig = document.createElement('div'); vig.className = 'vignette'; document.body.appendChild(vig);
    this.hurt = 0;
  }
  bind(player) { this.player = player; this.slotSig = ''; this.selKey = ''; this.refreshSlots(); }

  /** Signature of everything the slot bar shows, so it redraws the moment anything changes. */
  signature(p) {
    return p.selected + '|' + p.rub + '|' + p.flamingTekko + '|' + p.slots.map((s) => (s ? `${s.id}:${s.count}` : '-')).join(',');
  }
  show() { this.el.classList.remove('hidden'); requestAnimationFrame(() => this.el.classList.add('visible')); }
  hide() { this.el.classList.remove('visible'); setTimeout(() => this.el.classList.add('hidden'), 600); }

  refreshSlots(showName = true) {
    const p = this.player; if (!p) return;
    const sig = this.signature(p);
    const selKey = `${p.selected}:${p.current?.id}`;
    const changedSelection = selKey !== this.selKey;
    this.selKey = selKey;
    this.slotSig = sig;
    p.slots.forEach((s, i) => {
      const el = this.slotEls[i];
      el.classList.toggle('active', i === p.selected);
      const icon = el.querySelector('.icon'), count = el.querySelector('.count'), tag = el.querySelector('.tag');
      if (!s) { if (icon.dataset.id) { icon.innerHTML = ''; icon.dataset.id = ''; } count.textContent = ''; tag.textContent = ''; el.title = 'Empty'; return; }
      const def = s.weapon && WEAPONS[s.weapon] ? WEAPONS[s.weapon] : ITEMS[s.id];
      const iconId = s.weapon === 'tekkokagi' && p.flamingTekko ? 'flaming_tekko' : (s.weapon ?? s.id);
      if (icon.dataset.id !== iconId) { icon.innerHTML = this.iconSvg(iconId); icon.dataset.id = iconId; }
      count.textContent = s.count > 1 ? `×${s.count}` : '';
      tag.textContent = s.primary && p.rub ? RUBS[p.rub].label : (s.weapon === 'tekkokagi' && p.flamingTekko ? 'Flaming' : '');
      el.title = def.name;
    });
    if (!showName || !changedSelection) return;
    const cur = p.current;
    const name = cur ? (cur.weapon ? WEAPONS[cur.weapon].name : ITEMS[cur.id].name) : '';
    const el = $('item-name'); el.textContent = name; el.classList.add('show');
    clearTimeout(this.nameT); this.nameT = setTimeout(() => el.classList.remove('show'), 1800);
  }
  iconSvg(id) { return icon(id); }
  setWave(n) { $('wave-label').textContent = `Wave ${n}`; }
  setStats(bet, win, kills) { $('hud-bet').textContent = bet.toFixed(2); $('hud-win').textContent = win.toFixed(2); $('hud-kills').textContent = String(kills); }
  banner(title, sub) {
    const b = $('wave-banner');
    b.innerHTML = sub ? `${title}<small>${sub}</small>` : title;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  }
  toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('show'), 2200); }
  setEquipAvailable(on) { const b = $('btn-equip'); if (b) b.classList.toggle('disabled', !on); }
  flashHurt(a) { this.hurt = Math.max(this.hurt, a); }
  update(dt) {
    const p = this.player; if (!p) return;
    const frac = Math.max(0, p.health / p.maxHealth);
    $('health-fill').style.width = `${frac * 100}%`;
    $('health-text').textContent = `${Math.ceil(p.health)} / ${p.maxHealth}`;
    this.hurt = Math.max(0, this.hurt - dt * 2);
    this.hurtEl.style.opacity = String(this.hurt);
    // live slot bar: redraw whenever an item is used, stacked, swapped or runs out
    if (this.signature(p) !== this.slotSig) this.refreshSlots();
    // active effects with their remaining time
    const keys = [['headshots', 'headshots'], ['ecto', 'ecto_goggles'], ['speedy', 'speedy'], ['lucky', 'lucky'], ['holy', 'holy_water']];
    let html = '', sig = '';
    for (const [k, ic] of keys) if (p.status[k] > 0) { const sec = Math.ceil(p.status[k]); sig += k + sec; html += `<span class="status">${icon(ic)}<b>${sec}</b></span>`; }
    if (sig !== this.statusSig) { this.statusSig = sig; this.statusEl.innerHTML = html; }
  }
}
