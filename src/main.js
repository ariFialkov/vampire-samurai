import { Game } from './game/game.js';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

const game = new Game(document.getElementById('game'));
game.init().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  l.innerHTML = `<div>Something went wrong raising the temple.</div><div style="font-size:11px;opacity:.6;margin-top:8px">${String(e.message || e)}</div>`;
});
window.__game = game;
