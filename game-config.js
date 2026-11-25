(() => {
  "use strict";

  window.GAME_CONFIG = Object.freeze({
    progression: {
      firstLevelXp: 35,
      perLevelXp: 9,
      quadraticXp: 1.8,
      evolutionLevels: [5, 10, 15, 20, 25, 30],
      killXp: 18,
      enemyXp: 12,
      objectXp: 10,
      resourceXp: 8,
      maxLevel: 30
    },
    stats: [
      { key: "speed", name: "Vitesse", short: "VIT", max: 10, description: "+5 % de vitesse par point." },
      { key: "maxHp", name: "Vie max.", short: "VIE", max: 10, description: "+8 % de vie max. par point." },
      { key: "regeneration", name: "Régénération", short: "REG", max: 10, description: "+0,7 vie/s par point." },
      { key: "damage", name: "Dégâts", short: "DÉG", max: 10, description: "+7 % de dégâts par point." },
      { key: "bulletSpeed", name: "Vitesse projectile", short: "PRO", max: 10, description: "+6 % de vitesse des projectiles par point." },
      { key: "fireRate", name: "Cadence", short: "CAD", max: 10, description: "+6 % de cadence par point." },
      { key: "resistance", name: "Résistance", short: "RÉS", max: 10, description: "−4 % de dégâts reçus par point." },
      { key: "penetration", name: "Pénétration", short: "PÉN", max: 10, description: "+1 cible traversée par 3 points." },
      { key: "range", name: "Portée", short: "POR", max: 10, description: "+8 % de portée par point." }
    ],
    evolutions: [
      { id: "double", name: "Double canon", branch: "offense", level: 5, parents: ["basic"], cannons: [{ angle: 0, offset: -8 }, { angle: 0, offset: 8 }], modifiers: {}, pros: "Deux tirs parallèles.", cons: "Aucun malus." },
      { id: "inverted", name: "Canon inversé", branch: "versatile", level: 5, parents: ["basic"], cannons: [{ angle: 0, offset: 0 }, { angle: Math.PI, offset: 0 }], modifiers: {}, pros: "Couvre l'avant et l'arrière.", cons: "Moins de tirs concentrés vers l'avant." },
      { id: "sniper", name: "Canon sniper", branch: "offense", level: 5, parents: ["basic"], cannons: [{ angle: 0, offset: 0 }], modifiers: { damage: 1.65, fireRate: 0.65, bulletSpeed: 1.35, range: 1.5 }, pros: "Portée, vitesse et dégâts accrus.", cons: "Cadence réduite." },
      { id: "machinegun", name: "Mitrailleuse", branch: "offense", level: 5, parents: ["basic"], cannons: [{ angle: 0, offset: 0 }], modifiers: { damage: 0.7, fireRate: 1.7 }, pros: "Cadence très élevée.", cons: "Dégâts par projectile réduits." },
      { id: "triple", name: "Triple canon", branch: "offense", level: 10, parents: ["double"], cannons: [{ angle: -0.22, offset: 0 }, { angle: 0, offset: 0 }, { angle: 0.22, offset: 0 }], modifiers: {}, pros: "Trois tirs couvrent un large éventail.", cons: "Aucun malus." },
      { id: "quad", name: "Canon quadruple", branch: "versatile", level: 10, parents: ["double", "inverted", "machinegun"], cannons: [{ angle: 0, offset: -10 }, { angle: 0, offset: 10 }, { angle: Math.PI, offset: -10 }, { angle: Math.PI, offset: 10 }], modifiers: { damage: 0.9 }, pros: "Feu à l'avant et à l'arrière.", cons: "Légère baisse de dégâts." },
      { id: "propulsion", name: "Canon à propulsion", branch: "mobility", level: 10, parents: ["inverted"], cannons: [{ angle: 0, offset: 0 }, { angle: Math.PI, offset: 0 }], modifiers: { speed: 1.12 }, pros: "Le canon arrière donne un bonus de vitesse.", cons: "Dégâts réduits." },
      { id: "octuple", name: "Canon octuple", branch: "versatile", level: 15, parents: ["triple", "quad", "propulsion", "rotating", "heavy", "explosive"], radial: 8, modifiers: { fireRate: 0.85 }, pros: "Huit tirs dans toutes les directions.", cons: "Cadence réduite." },
      { id: "heavy", name: "Canon lourd", branch: "offense", level: 10, parents: ["sniper"], cannons: [{ angle: 0, offset: 0 }], modifiers: { damage: 2, bulletSpeed: 0.85, speed: 0.82, bulletSize: 1.8 }, pros: "Projectiles énormes et très puissants.", cons: "Déplacement ralenti." },
      { id: "explosive", name: "Canon explosif", branch: "offense", level: 10, parents: ["sniper"], cannons: [{ angle: 0, offset: 0 }], modifiers: { damage: 1.25, fireRate: 0.8, explosive: true }, pros: "Les impacts infligent des dégâts de zone.", cons: "Cadence réduite." },
      { id: "rotating", name: "Canon rotatif", branch: "versatile", level: 10, parents: ["machinegun"], rotating: 4, modifiers: { fireRate: 1.1 }, pros: "Quatre canons tournent automatiquement.", cons: "Aucun tir visé précis." },
      { id: "fortress", name: "Forteresse", branch: "defense", level: 15, parents: ["quad", "propulsion", "octuple"], radial: 8, modifiers: { maxHp: 1.35, resistance: 0.75, speed: 0.85 }, pros: "Très résistant et couvert à 360°.", cons: "Déplacement ralenti." },
      { id: "siege", name: "Siège explosif", branch: "offense", level: 20, parents: ["heavy", "explosive", "fortress", "octuple"], cannons: [{ angle: 0, offset: -9 }, { angle: 0, offset: 9 }], modifiers: { damage: 1.5, range: 1.3, fireRate: 0.75, explosive: true }, pros: "Double tir explosif longue portée.", cons: "Cadence et mobilité réduites." },
      { id: "apex", name: "Apex rotatif", branch: "versatile", level: 25, parents: ["siege", "octuple", "fortress"], radial: 8, modifiers: { damage: 1.35, fireRate: 1.2, maxHp: 1.2 }, pros: "Arsenal rotatif ultime, robuste et puissant.", cons: "Aucun malus." },
      { id: "transcendent", name: "Canon transcendant", branch: "versatile", level: 30, parents: ["apex"], radial: 12, modifiers: { damage: 1.4, fireRate: 1.15, maxHp: 1.25 }, pros: "Douze tirs, dégâts et vie augmentés.", cons: "Aucun malus." }
    ],
    abilities: [
      { id: "shield", name: "Bouclier", key: "1", cooldown: 18, duration: 4, description: "Bloque les dégâts 4 s." },
      { id: "dash", name: "Accélération", key: "2", cooldown: 12, duration: 3, description: "Vitesse doublée 3 s." },
      { id: "heal", name: "Régénération", key: "3", cooldown: 22, duration: 5, description: "Régénère rapidement pendant 5 s." },
      { id: "invisible", name: "Invisibilité", key: "4", cooldown: 24, duration: 4, description: "Les ennemis t'ignorent 4 s." },
      { id: "explosive", name: "Tir explosif", key: "5", cooldown: 16, duration: 6, description: "Les tirs explosent pendant 6 s." },
      { id: "volley", name: "Rafale 360°", key: "6", cooldown: 14, duration: 0, description: "Tire une salve dans toutes les directions." },
      { id: "repel", name: "Repoussement", key: "7", cooldown: 18, duration: 0, description: "Repousse les ennemis proches." },
      { id: "invulnerable", name: "Invulnérabilité", key: "8", cooldown: 32, duration: 2, description: "Invulnérable pendant 2 s." }
    ],
    balance: {
      player: { speed: 220, maxHp: 100, damage: 16, bulletSpeed: 610, fireRate: 0.36, range: 610, bulletSize: 5, maxResistance: 0.5 },
      growth: { speed: 0.05, maxHp: 0.08, regeneration: 0.7, maxHpRegeneration: 0.15, damage: 0.07, bulletSpeed: 0.06, fireRate: 0.06, resistance: 0.04, penetrationPerPoint: 3, range: 0.08 },
      resources: { initialCount: 140, maxCount: 140, respawnSeconds: 1.5, pickupRadius: 23, visualRadius: 6 },
      objects: { initialCount: 22, maxCount: 22, hp: 36, radius: 17, respawnSeconds: 3 },
      enemies: { hp: 25, hpPerSecond: 0.22, maxBonusHp: 70, speed: 47, randomSpeed: 19, speedPerSecond: 0.025, maxSpeedBonus: 35, spawnDistanceX: 590, spawnDistanceY: 460, contactRadius: 21, contactDamage: 9, contactCooldown: 0.8 },
      combat: { playerInvulnerabilitySeconds: 0.45, enemyRadius: 68, explosionDamage: 0.65, splashPlayerDamage: 0.5, bulletPlayerRadius: 14, enemyBulletDamage: 10 }
    },
    rewards: { resourceRadius: 13, enemyRadius: 17, killRadius: 30 }
  });
})();
