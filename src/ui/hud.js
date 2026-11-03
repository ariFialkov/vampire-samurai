// In-game HUD: health, wave, the five item slots, banners and toasts.
import { ITEMS } from '../entities/collectibles.js';
import { WEAPONS, RUBS } from '../entities/weapons.js';

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
    this.hurtEl = document.createElement('div'); this.hurtEl.className = 'hurt-flash'; document.body.appendChild(this.hurtEl);
    const vig = document.createElement('div'); vig.className = 'vignette'; document.body.appendChild(vig);
    this.hurt = 0;
  }
  bind(player) { this.player = player; this.refreshSlots(); }
  show() { this.el.classList.remove('hidden'); requestAnimationFrame(() => this.el.classList.add('visible')); }
  hide() { this.el.classList.remove('visible'); setTimeout(() => this.el.classList.add('hidden'), 600); }

  refreshSlots() {
    const p = this.player; if (!p) return;
    p.slots.forEach((s, i) => {
      const el = this.slotEls[i];
      el.classList.toggle('active', i === p.selected);
      const icon = el.querySelector('.icon'), count = el.querySelector('.count'), tag = el.querySelector('.tag');
      if (!s) { icon.textContent = ''; count.textContent = ''; tag.textContent = ''; el.title = 'Empty'; return; }
      const def = s.weapon && WEAPONS[s.weapon] ? WEAPONS[s.weapon] : ITEMS[s.id];
      icon.textContent = def.icon;
      count.textContent = s.count > 1 ? `×${s.count}` : '';
      tag.textContent = s.primary && p.rub ? RUBS[p.rub].label : (s.weapon === 'tekkokagi' && p.flamingTekko ? 'Flaming' : '');
      el.title = def.name;
    });
    const cur = p.current;
    const name = cur ? (cur.weapon ? WEAPONS[cur.weapon].name : ITEMS[cur.id].name) : '';
    const el = $('item-name'); el.textContent = name; el.classList.add('show');
    clearTimeout(this.nameT); this.nameT = setTimeout(() => el.classList.remove('show'), 1800);
  }
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
    const statuses = [];
    if (p.status.headshots > 0) statuses.push(`🎯 ${Math.ceil(p.status.headshots)}s`);
    if (p.status.ecto > 0) statuses.push(`🥽 ${Math.ceil(p.status.ecto)}s`);
    if (p.status.speedy > 0) statuses.push(`💨 ${Math.ceil(p.status.speedy)}s`);
    if (p.status.lucky > 0) statuses.push(`🍀 ${Math.ceil(p.status.lucky)}s`);
    if (p.status.holy > 0) statuses.push(`💧 ${Math.ceil(p.status.holy)}s`);
    $('wave-sub').textContent = statuses.join('  ');
  }
}
