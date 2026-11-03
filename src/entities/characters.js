// The six samurai, each named after their weapon. Proportions and stats fit the weapon:
// the Ōdachi and Kanabō need bulk, the Yumi archer is small and quick, the Katana is balanced.
export const CHARACTERS = [
  { id: 'katana', name: 'Katana', weapon: 'katana', desc: 'Balanced wanderer. Fast cuts, clean footwork.', health: 100, speed: 6.2,
    look: { scale: 1.0, bulk: 1.0, legLen: 0.8, armLen: 0.62, skin: 0xe3bd94, top: 0x34436a, bottom: 0x2a2b33, obi: 0x8a1c1c, hair: 0x1a1410, hat: 'kasa', topknot: true }, swatch: '#3b4a6b',
    stats: { power: 0.55, speed: 0.6, reach: 0.5, health: 0.5 } },
  { id: 'yumi', name: 'Yumi', weapon: 'yumi', desc: 'Small, light and quick. Loose, move, loose again.', health: 85, speed: 7.0,
    look: { scale: 0.9, bulk: 0.85, legLen: 0.78, armLen: 0.6, skin: 0xeccaa6, top: 0x5f8a52, bottom: 0x3a3226, obi: 0xd4a84b, hair: 0x2b1b10, hat: 'none', topknot: true }, swatch: '#6b8e5a',
    stats: { power: 0.4, speed: 0.85, reach: 1.0, health: 0.35 } },
  { id: 'odachi', name: 'Ōdachi', weapon: 'odachi', desc: 'A giant with a giant blade. Slow, wide, devastating.', health: 130, speed: 5.2,
    look: { scale: 1.16, bulk: 1.3, legLen: 0.86, armLen: 0.7, skin: 0xd9ad84, top: 0x5a2a2a, bottom: 0x1e1e24, obi: 0x2a2a2a, hair: 0x14100c, hat: 'helmet', armor: { plate: 0x2a2a30, lace: 0x8a1c1c, trim: 0xd4a84b } }, swatch: '#5a2a2a',
    stats: { power: 0.9, speed: 0.3, reach: 0.65, health: 0.7 } },
  { id: 'naginata', name: 'Naginata', weapon: 'naginata', desc: 'Tall and lean. Keeps monsters at the end of a pole.', health: 100, speed: 5.8,
    look: { scale: 1.08, bulk: 0.95, legLen: 0.9, armLen: 0.68, skin: 0xe8c39e, top: 0xd8cdb0, bottom: 0x3a2f4a, obi: 0x4f8a6a, hair: 0x1a1410, hat: 'kasa', collar: 0x4f8a6a }, swatch: '#cfc4a4',
    stats: { power: 0.6, speed: 0.5, reach: 0.8, health: 0.5 } },
  { id: 'kanabo', name: 'Kanabō', weapon: 'kanabo', desc: 'The mountain. Crushes crowds, shrugs off blows.', health: 150, speed: 4.7,
    look: { scale: 1.22, bulk: 1.45, legLen: 0.84, armLen: 0.74, skin: 0xcf9f78, top: 0x2f3b2f, bottom: 0x1a1a1a, obi: 0x8a6a2a, hair: 0x0f0c0a, hat: 'none', topknot: true, armor: { plate: 0x4a3626, lace: 0x2f5a3a, trim: 0x9a8a6a } }, swatch: '#2f3b2f',
    stats: { power: 1.0, speed: 0.2, reach: 0.55, health: 0.9 } },
  { id: 'kusarigama', name: 'Kusarigama', weapon: 'kusarigama', desc: 'Lithe trickster. Chain and sickle from mid range.', health: 90, speed: 6.5,
    look: { scale: 0.96, bulk: 0.9, legLen: 0.8, armLen: 0.64, skin: 0xe6c3a2, top: 0x2b2b35, bottom: 0x4a2a3a, obi: 0xb23a2a, hair: 0x1a1410, hat: 'none', topknot: true, collar: 0xb23a2a }, swatch: '#4a2a3a',
    stats: { power: 0.5, speed: 0.7, reach: 0.75, health: 0.4 } },
];
export const CHARACTER_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
