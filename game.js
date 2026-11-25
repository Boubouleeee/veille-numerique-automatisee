(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const home = $("#home");
  const gameScreen = $("#game-screen");
  const canvas = $("#arena");
  const ctx = canvas.getContext("2d");
  const status = $("#home-status");
  const roomInput = $("#room-code");
  const CONFIG = window.GAME_CONFIG;
  const evolutions = [{ id: "basic", name: "Canon simple", branch: "versatile", level: 1, parents: [], cannons: [{ angle: 0, offset: 0 }], modifiers: {}, pros: "Canon équilibré.", cons: "Aucun bonus spécialisé." }, ...CONFIG.evolutions];
  const evolutionById = new Map(evolutions.map((item) => [item.id, item]));
  const statByKey = new Map(CONFIG.stats.map((item) => [item.key, item]));
  const branchLabels = { offense: "Attaque", defense: "Défense", mobility: "Mobilité", versatile: "Polyvalence" };
  const modifierLabels = { speed: "Vitesse", maxHp: "Vie max.", damage: "Dégâts", fireRate: "Cadence", bulletSpeed: "Vitesse des tirs", range: "Portée", bulletSize: "Taille des tirs" };
  const colors = ["#a4ffb2", "#ffcb70", "#8bd8ff", "#ff90ab", "#c5a4ff", "#ffe67b", "#78e4d1", "#ffac74"];
  const WORLD = 1800;
  const MAX_FOOD = CONFIG.balance.resources.maxCount;
  let game = null;
  let animationId = 0;
  let previousTime = 0;
  let inputState = { x: 0, y: 0, aim: 0 };
  let aimPointer = { x: 0, y: 0 };
  let keys = new Set();
  let copyTimer = 0;

  const randomCode = () => {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (n) => (n % 36).toString(36)).join("").toUpperCase();
  };
  const peerId = (code) => `bouboule-${code.toLowerCase()}`;
  const announce = (text, isError = false) => {
    status.textContent = text;
    status.style.color = isError ? "#ff9ba7" : "";
  };
  const showGame = () => {
    home.hidden = true;
    gameScreen.hidden = false;
    document.body.classList.add("in-game");
    resizeCanvas();
    canvas.focus?.();
  };
  const showHome = () => {
    gameScreen.hidden = true;
    home.hidden = false;
    document.body.classList.remove("in-game");
    $("#upgrade-dialog").hidden = true;
    $("#gameover-dialog").hidden = true;
    $("#home-status").textContent = "";
    if (game?.peer) game.peer.destroy();
    if (game) game.closed = true;
    game = null;
    history.replaceState(null, "", location.pathname);
    keys.clear();
    if (animationId) cancelAnimationFrame(animationId);
    animationId = 0;
  };
  const makePlayer = (id, name, color) => {
    const player = {
      id, name, color, x: WORLD / 2 + (Math.random() - .5) * 90, y: WORLD / 2 + (Math.random() - .5) * 90,
      angle: 0, hp: CONFIG.balance.player.maxHp, maxHp: CONFIG.balance.player.maxHp,
      speed: CONFIG.balance.player.speed, damage: CONFIG.balance.player.damage,
      fireRate: CONFIG.balance.player.fireRate, fireLeft: .1,
      xp: 0, level: 1, kills: 0, cannons: 1, evolution: "basic",
      stats: Object.fromEntries(CONFIG.stats.map((stat) => [stat.key, 0])), unspentPoints: 0,
      abilityCooldowns: {}, effects: {}, alive: true, invulnerable: 0,
      waitingUpgrade: false, pendingLevels: 0, pendingEvolution: false, connected: true
    };
    recalculateStats(player);
    return player;
  };
  const createGame = ({ mode, code = "", host = false, peer = null }) => {
    game = {
      mode, code, isHost: host, peer, selfId: host || mode === "solo" ? "host" : "",
      players: new Map(), enemies: [], bullets: [], foods: [], objects: [], objectId: 0,
      lastFoodSpawn: 0, lastObjectSpawn: 0, foodId: 0, lastSpawn: 0, elapsed: 0, spawnId: 0,
      snapshotTimer: 0, lastInputSend: 0, connections: new Map(), closed: false, hostPeerId: peerId(code),
      joining: false, gameOver: false, localInput: inputState
    };
    for (let i = 0; i < CONFIG.balance.resources.initialCount; i++) game.foods.push(makeFood());
    for (let i = 0; i < CONFIG.balance.objects.initialCount; i++) game.objects.push(makeObject());
    if (host || mode === "solo") game.players.set("host", makePlayer("host", "Hôte", colors[0]));
    updateRoomLabel();
    $("#gameover-dialog").hidden = true;
    $("#upgrade-dialog").hidden = true;
    showGame();
    if (animationId) cancelAnimationFrame(animationId);
    previousTime = performance.now();
    animationId = requestAnimationFrame(frame);
  };
  const updateRoomLabel = () => {
    if (!game) return;
    $("#room-label").textContent = game.code ? `Salle ${game.code} · ${game.isHost ? "Hôte" : "Connecté"}` : "Partie solo";
    $("#connection-dot").style.background = game.mode === "solo" ? "#8f9aae" : "#a4ffb2";
    $("#copy-link").hidden = !game.code;
  };
  const startSolo = () => createGame({ mode: "solo", host: true });

  async function createRoom() {
    if (!window.Peer) {
      announce("Le service de connexion n'est pas chargé. Vérifiez votre accès à Internet puis réessayez.", true);
      return;
    }
    $("#create-button").disabled = true;
    announce("Ouverture de la salle…");
    let peer = null;
    let code = "";
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        code = randomCode();
        try {
          peer = await openPeer(peerId(code));
          break;
        } catch (error) {
          if (attempt === 3) throw error;
        }
      }
      createGame({ mode: "host", host: true, code, peer });
      peer.on("connection", (conn) => acceptConnection(conn));
      history.replaceState(null, "", `${location.pathname}?room=${code}`);
      setMessage(`Partagez le code ${code} avec vos amis. La partie commence dès maintenant.`);
    } catch (error) {
      announce(error.message || "Impossible d'ouvrir la salle. Réessayez dans quelques secondes.", true);
    } finally {
      $("#create-button").disabled = false;
    }
  }
  function openPeer(id) {
    return new Promise((resolve, reject) => {
      let peer;
      try { peer = new Peer(id); }
      catch { reject(new Error("Impossible de démarrer la connexion pair-à-pair.")); return; }
      const timeout = setTimeout(() => {
        peer.destroy();
        reject(new Error("Le service de connexion ne répond pas. Réessayez."));
      }, 12000);
      peer.on("open", () => { clearTimeout(timeout); resolve(peer); });
      peer.on("error", (error) => {
        if (error.type === "unavailable-id" || error.type === "server-error" || error.type === "network") {
          clearTimeout(timeout);
          peer.destroy();
          reject(new Error(error.type === "unavailable-id" ? "Code de salle déjà utilisé, nouvelle tentative…" : "Connexion au service de salles impossible."));
        }
      });
    });
  }
  async function joinRoom(rawCode) {
    const code = rawCode.trim().replace(/^bouboule-/i, "").toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(code)) {
      announce("Entrez un code de salle valide (4 à 6 caractères).", true);
      return;
    }
    if (!window.Peer) {
      announce("Le service de connexion n'est pas chargé. Vérifiez votre accès à Internet puis réessayez.", true);
      return;
    }
    $("#join-form button").disabled = true;
    announce(`Connexion à la salle ${code}…`);
    try {
      const peer = await openPeer();
      const candidate = {
        peer, code, isHost: false, mode: "client", selfId: peer.id, players: new Map(), enemies: [],
        bullets: [], connections: new Map(), closed: false, joining: true, gameOver: false,
        hostPeerId: peerId(code), retryTimer: 0, joinTimeout: 0, connecting: false, touchMove: null, touchAim: null
      };
      game = candidate;
      peer.on("error", (error) => {
        if (game !== candidate || candidate.closed) return;
        if (error.type === "disconnected") {
          setMessage("Signalisation interrompue ; tentative de reconnexion…");
          try { peer.reconnect(); } catch { /* PeerJS may already be reconnecting. */ }
        } else if (error.type !== "peer-unavailable") {
          setMessage(`Connexion interrompue (${error.type}).`);
        }
      });
      peer.on("open", () => {
        if (game === candidate && !candidate.joining && !candidate.connections.get(candidate.hostPeerId)?.open) {
          connectToHost(candidate);
        }
      });
      candidate.joinTimeout = setTimeout(() => {
        if (game === candidate && candidate.joining) {
          showHome();
          announce("Salle introuvable ou hôte hors ligne. Vérifiez le code et réessayez.", true);
        }
      }, 16000);
      connectToHost(candidate);
    } catch (error) {
      game = null;
      announce(error.message || "Impossible de rejoindre cette salle.", true);
    } finally {
      $("#join-form button").disabled = false;
    }
  }
  function connectToHost(candidate) {
    if (candidate.closed || !candidate.peer?.open || candidate.connecting ||
        candidate.connections.get(candidate.hostPeerId)?.open) return;
    let conn;
    candidate.connecting = true;
    try { conn = candidate.peer.connect(candidate.hostPeerId, { reliable: true, serialization: "json" }); }
    catch { candidate.connecting = false; scheduleReconnect(candidate); return; }
    candidate.connections.set(candidate.hostPeerId, conn);
    conn.on("open", () => {
      candidate.connecting = false;
      conn.send({ type: "hello", name: "Survivant" });
      clearTimeout(candidate.retryTimer);
    });
    conn.on("data", (message) => receiveHostMessage(candidate, message));
    conn.on("close", () => {
      candidate.connecting = false;
      candidate.connections.delete(candidate.hostPeerId);
      if (game === candidate && !candidate.closed && !candidate.joining) {
        setMessage("Connexion perdue. Reconnexion à la salle…");
        scheduleReconnect(candidate);
      }
    });
    conn.on("error", () => {
      candidate.connecting = false;
      if (candidate.joining) setMessage("La salle ne répond pas, nouvelle tentative…");
    });
  }
  function scheduleReconnect(candidate) {
    if (candidate.retryTimer || candidate.closed) return;
    candidate.retryTimer = setTimeout(() => {
      candidate.retryTimer = 0;
      if (!candidate.peer.open) {
        try { candidate.peer.reconnect(); } catch { /* It may already be connected. */ }
      }
      setTimeout(() => connectToHost(candidate), 900);
    }, 1800);
  }
  function acceptConnection(conn) {
    if (!game?.isHost || game.closed) { conn.close(); return; }
    conn.on("data", (message) => {
      if (message?.type === "hello") {
        const existing = game.players.get(conn.peer);
        const activeCount = [...game.players.values()].filter((p) => p.connected || game.elapsed - (p.disconnectedAt || 0) < 12).length;
        if (!existing && activeCount >= 16) {
          conn.send({ type: "full" });
          conn.close();
          return;
        }
        const player = existing || makePlayer(conn.peer, "Invité", colors[(game.players.size + 1) % colors.length]);
        player.connected = true;
        player.disconnectedAt = 0;
        game.players.set(conn.peer, player);
        game.connections.set(conn.peer, conn);
        conn.send({ type: "welcome", id: conn.peer, state: snapshot() });
        setMessage(`${activeCount + (existing ? 0 : 1)} survivant(s) dans l'arène.`);
      } else if (message?.type === "input") {
        const player = game.players.get(conn.peer);
        if (player?.connected && player.alive && !player.waitingUpgrade) {
          player.inputX = clamp(Number(message.x) || 0, -1, 1);
          player.inputY = clamp(Number(message.y) || 0, -1, 1);
          player.angle = Number.isFinite(message.aim) ? message.aim : player.angle;
        }
      } else if (message?.type === "upgrade") {
        const player = game.players.get(conn.peer);
        if (player?.waitingUpgrade) applyProgressionChoice(player, message.action, message.key);
      } else if (message?.type === "ability") {
        const player = game.players.get(conn.peer);
        if (player?.connected) activateAbility(player, message.id);
      }
    });
    conn.on("close", () => removeConnection(conn.peer));
    conn.on("error", () => removeConnection(conn.peer));
  }
  function removeConnection(id) {
    if (!game?.isHost) return;
    const conn = game.connections.get(id);
    if (conn && conn.open) conn.close();
    game.connections.delete(id);
    const player = game.players.get(id);
    if (player?.connected) {
      player.connected = false;
      player.disconnectedAt = game.elapsed;
      player.inputX = 0;
      player.inputY = 0;
    }
  }
  function receiveHostMessage(candidate, message) {
    if (game !== candidate || candidate.closed) return;
    if (message?.type === "full") {
      clearTimeout(candidate.joinTimeout);
      candidate.joining = false;
      showHome();
      announce("Cette salle est complète (16 joueurs maximum).", true);
    } else if (message?.type === "welcome") {
      clearTimeout(candidate.joinTimeout);
      candidate.joining = false;
      candidate.selfId = message.id;
      mergeSnapshot(message.state);
      createGameFromCandidate(candidate);
    } else if (message?.type === "state" && !candidate.joining) {
      mergeSnapshot(message.state);
    }
  }
  function createGameFromCandidate(candidate) {
    if (game !== candidate || candidate.closed) return;
    candidate.mode = "client";
    candidate.isHost = false;
    candidate.localInput = inputState;
    updateRoomLabel();
    showGame();
    history.replaceState(null, "", `${location.pathname}?room=${candidate.code}`);
    previousTime = performance.now();
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(frame);
  }
  function snapshot() {
    return {
      elapsed: game.elapsed,
      players: [...game.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, angle: p.angle, hp: p.hp, maxHp: p.maxHp,
        xp: p.xp, level: p.level, kills: p.kills, alive: p.alive, waitingUpgrade: p.waitingUpgrade,
        pendingLevels: p.pendingLevels, connected: p.connected, cannons: p.cannons,
        evolution: p.evolution, stats: p.stats, unspentPoints: p.unspentPoints,
        pendingEvolution: p.pendingEvolution, abilityCooldowns: p.abilityCooldowns,
        effects: p.effects, range: p.range, resistance: p.resistance, penetration: p.penetration,
        regeneration: p.regeneration, bulletSize: p.bulletSize
      })),
      enemies: game.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, radius: e.radius })),
      bullets: game.bullets.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, color: b.color, enemy: b.enemy, radius: b.radius })),
      foods: game.foods.map((food) => ({ id: food.id, x: food.x, y: food.y, value: food.value })),
      objects: game.objects.map((object) => ({ id: object.id, x: object.x, y: object.y, hp: object.hp, maxHp: object.maxHp, radius: object.radius })),
      spawnId: game.spawnId
    };
  }
  function mergeSnapshot(state) {
    if (!state || !Array.isArray(state.players)) return;
    game.elapsed = state.elapsed || game.elapsed || 0;
    const previousSelf = game.players.get(game.selfId);
    for (const p of state.players) game.players.set(p.id, { ...p });
    for (const id of [...game.players.keys()]) if (!state.players.some((p) => p.id === id)) game.players.delete(id);
    game.enemies = Array.isArray(state.enemies) ? state.enemies : [];
    game.bullets = Array.isArray(state.bullets) ? state.bullets : [];
    game.foods = Array.isArray(state.foods) ? state.foods : [];
    game.objects = Array.isArray(state.objects) ? state.objects : [];
    game.spawnId = state.spawnId || 0;
    const self = game.players.get(game.selfId);
    if (self) {
      if (previousSelf && (self.level > previousSelf.level || self.evolution !== previousSelf.evolution)) flashLevelUp();
      if (!self.alive) {
        if (state.players.every((p) => !p.alive)) showGameOver(self);
        else $("#game-message").textContent = "Vous êtes éliminé · observez vos coéquipiers.";
      }
      else if (self.waitingUpgrade) showUpgradeOptions();
      else $("#upgrade-dialog").hidden = true;
      renderHud(self);
    }
    $("#player-count").textContent = `${state.players.filter((p) => p.connected).length}`;
  }
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function setMessage(text) {
    const node = $("#game-message");
    node.textContent = text;
    clearTimeout(setMessage.timer);
    setMessage.timer = setTimeout(() => { if (node.textContent === text) node.textContent = ""; }, 4500);
  }
  function flashLevelUp() {
    gameScreen.classList.remove("level-up-flash");
    void gameScreen.offsetWidth;
    gameScreen.classList.add("level-up-flash");
  }
  function updateInput() {
    let x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    let y = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
    const player = game?.players.get(game.selfId);
    if (game?.touchMove) { x += game.touchMove.x; y += game.touchMove.y; }
    const aimPoint = game?.touchAim || aimPointer;
    const angle = Math.atan2(aimPoint.y - canvas.clientHeight / 2, aimPoint.x - canvas.clientWidth / 2);
    inputState = { x, y, aim: Number.isFinite(angle) ? angle : player?.angle || 0 };
    if (!game) return;
    game.localInput = inputState;
    if (game.isHost) {
      const self = game.players.get("host");
      if (self) { self.inputX = x; self.inputY = y; self.angle = inputState.aim; }
    }
  }
  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function frame(now) {
    if (!game || game.closed || gameScreen.hidden) return;
    const dt = Math.min((now - previousTime) / 1000, .05);
    previousTime = now;
    updateInput();
    if (game.isHost && !game.gameOver) simulate(dt);
    if (game.mode !== "client" || !game.joining) render();
    if (game.isHost && game.mode !== "solo") {
      game.snapshotTimer += dt;
      if (game.snapshotTimer >= .09) {
        game.snapshotTimer = 0;
        const state = snapshot();
        for (const conn of game.connections.values()) {
          if (conn.open) {
            try { conn.send({ type: "state", state }); } catch { removeConnection(conn.peer); }
          }
        }
      }
    } else if (game.mode === "client" && !game.joining) {
      game.lastInputSend += dt;
      if (game.lastInputSend > .055) {
        game.lastInputSend = 0;
        const conn = game.connections.get(game.hostPeerId);
        if (conn?.open) {
          try { conn.send({ type: "input", ...inputState }); } catch { /* Reconnection handler owns recovery. */ }
        }
      }
    }
    animationId = requestAnimationFrame(frame);
  }
  function simulate(dt) {
    game.elapsed += dt;
    game.lastFoodSpawn += dt;
    if (game.lastFoodSpawn >= CONFIG.balance.resources.respawnSeconds && game.foods.length < MAX_FOOD) {
      game.lastFoodSpawn = 0;
      game.foods.push(makeFood());
    }
    game.lastObjectSpawn += dt;
    if (game.lastObjectSpawn >= CONFIG.balance.objects.respawnSeconds && game.objects.length < CONFIG.balance.objects.maxCount) {
      game.lastObjectSpawn = 0;
      game.objects.push(makeObject());
    }
    for (const p of [...game.players.values()]) {
      if (!p.connected && p.id !== "host" && game.elapsed - p.disconnectedAt > 12) {
        game.players.delete(p.id);
        continue;
      }
      updateAbilityEffects(p);
      if (p.alive) {
        p.hp = Math.min(p.maxHp, p.hp + p.regeneration * dt);
        if (p.effects.healUntil > game.elapsed) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .12 * dt);
      }
      if (!p.alive || p.waitingUpgrade) continue;
      p.invulnerable = Math.max(0, p.invulnerable - dt);
      const ix = p.inputX || 0, iy = p.inputY || 0;
      const magnitude = Math.hypot(ix, iy) || 1;
      const moveSpeed = p.speed * (p.effects.dashUntil > game.elapsed ? 1.8 : 1) *
        (p.effects.propulsionUntil > game.elapsed ? 1.25 : 1);
      p.x = clamp(p.x + ix / magnitude * moveSpeed * dt, 28, WORLD - 28);
      p.y = clamp(p.y + iy / magnitude * moveSpeed * dt, 28, WORLD - 28);
      collectFood(p);
      p.fireLeft -= dt;
      if (p.fireLeft <= 0) {
        spawnBullet(p, p.angle);
        p.fireLeft = p.fireRate;
      }
    }
    const spawnInterval = Math.max(.38, 1.15 - game.elapsed / 240);
    game.lastSpawn += dt;
    if (game.lastSpawn > spawnInterval && game.enemies.length < 65) {
      game.lastSpawn = 0;
      spawnEnemy();
    }
    updateBullets(dt);
    updateEnemies(dt);
    const self = game.players.get("host");
    if (self) renderHud(self);
    $("#player-count").textContent = `${[...game.players.values()].filter((p) => p.connected).length}`;
  }
  function spawnBullet(p, angle) {
    for (const cannon of cannonLayout(p)) {
      const direction = angle + cannon.angle;
      if (p.evolution === "propulsion" && Math.cos(cannon.angle) < -.5) p.effects.propulsionUntil = game.elapsed + .5;
      const x = p.x + Math.cos(direction) * 21 - Math.sin(direction) * cannon.offset;
      const y = p.y + Math.sin(direction) * 21 + Math.cos(direction) * cannon.offset;
      game.bullets.push({
        x, y, vx: Math.cos(direction) * p.bulletSpeed, vy: Math.sin(direction) * p.bulletSpeed,
        damage: p.damage, owner: p.id, color: p.color, radius: p.bulletSize, enemy: false,
        life: p.range / p.bulletSpeed, remainingPierce: p.penetration, hitIds: [],
        explosive: p.effects?.explosiveUntil > game.elapsed || Boolean(evolutionById.get(p.evolution)?.modifiers.explosive)
      });
    }
  }
  function cannonLayout(player) {
    const evolution = evolutionById.get(player.evolution) || evolutionById.get("basic");
    if (evolution.radial) return Array.from({ length: evolution.radial }, (_, i) => ({ angle: i * Math.PI * 2 / evolution.radial, offset: 0 }));
    if (evolution.rotating) return Array.from({ length: evolution.rotating }, (_, i) => ({
      angle: game.elapsed * 1.5 + i * Math.PI * 2 / evolution.rotating, offset: 0
    }));
    return evolution.cannons || evolutionById.get("basic").cannons;
  }
  function makeFood() {
    return { id: ++game.foodId, x: 35 + Math.random() * (WORLD - 70), y: 35 + Math.random() * (WORLD - 70), value: CONFIG.progression.resourceXp };
  }
  function makeObject() {
    return {
      id: ++game.objectId, x: 60 + Math.random() * (WORLD - 120), y: 60 + Math.random() * (WORLD - 120),
      hp: CONFIG.balance.objects.hp, maxHp: CONFIG.balance.objects.hp, radius: CONFIG.balance.objects.radius
    };
  }
  function collectFood(player) {
    for (let i = game.foods.length - 1; i >= 0; i--) {
      const food = game.foods[i];
      if (Math.hypot(player.x - food.x, player.y - food.y) < CONFIG.balance.resources.pickupRadius) {
        game.foods.splice(i, 1);
        addXp(player, food.value);
      }
    }
  }
  function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const target = game.players.get("host");
    const cx = target?.x || WORLD / 2, cy = target?.y || WORLD / 2;
    const balance = CONFIG.balance.enemies;
    const x = clamp(cx + Math.cos(angle) * balance.spawnDistanceX, 25, WORLD - 25);
    const y = clamp(cy + Math.sin(angle) * balance.spawnDistanceY, 25, WORLD - 25);
    const hp = balance.hp + Math.min(game.elapsed * balance.hpPerSecond, balance.maxBonusHp);
    game.enemies.push({
      id: ++game.spawnId, x, y, hp, maxHp: hp, radius: CONFIG.rewards.enemyRadius,
      speed: balance.speed + Math.random() * balance.randomSpeed + Math.min(game.elapsed * balance.speedPerSecond, balance.maxSpeedBonus),
      hitLeft: 0
    });
  }
  function updateBullets(dt) {
    for (let i = game.bullets.length - 1; i >= 0; i--) {
      const b = game.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < 0 || b.x > WORLD || b.y < 0 || b.y > WORLD || b.life <= 0) { game.bullets.splice(i, 1); continue; }
      if (!b.enemy) {
        const target = game.enemies.find((e) => !(b.hitIds || []).includes(`enemy-${e.id}`) && Math.hypot(e.x - b.x, e.y - b.y) < e.radius + b.radius);
        if (target) {
          target.hp -= b.damage || 16;
          const targetX = target.x, targetY = target.y;
          if (target.hp <= 0) {
            game.enemies.splice(game.enemies.indexOf(target), 1);
            const owner = game.players.get(b.owner);
            if (owner) { owner.kills++; addXp(owner, CONFIG.progression.enemyXp); }
          }
          if (b.explosive) {
            explodeAt(targetX, targetY, b.damage, b.owner);
            game.bullets.splice(i, 1);
          } else if (b.remainingPierce > 0) {
            b.remainingPierce--;
            b.hitIds.push(`enemy-${target.id}`);
          } else game.bullets.splice(i, 1);
          continue;
        }
        const object = game.objects.find((item) => !(b.hitIds || []).includes(`object-${item.id}`) &&
          Math.hypot(item.x - b.x, item.y - b.y) < item.radius + b.radius);
        if (object) {
          object.hp -= b.damage;
          if (object.hp <= 0) {
            game.objects.splice(game.objects.indexOf(object), 1);
            const owner = game.players.get(b.owner);
            if (owner) addXp(owner, CONFIG.progression.objectXp);
          }
          if (b.explosive) {
            explodeAt(object.x, object.y, b.damage, b.owner);
            game.bullets.splice(i, 1);
          } else if (b.remainingPierce > 0) { b.remainingPierce--; b.hitIds.push(`object-${object.id}`); }
          else game.bullets.splice(i, 1);
          continue;
        }
        const opponent = [...game.players.values()].find((p) => p.alive && p.id !== b.owner &&
          !(b.hitIds || []).includes(p.id) && Math.hypot(p.x - b.x, p.y - b.y) < CONFIG.balance.combat.bulletPlayerRadius + b.radius);
        if (opponent) {
          damagePlayer(opponent, b.damage, game.players.get(b.owner));
          if (b.remainingPierce > 0) { b.remainingPierce--; b.hitIds.push(opponent.id); }
          else game.bullets.splice(i, 1);
          continue;
        }
      } else {
        const target = [...game.players.values()].find((p) => p.alive && Math.hypot(p.x - b.x, p.y - b.y) < 15);
        if (target) {
          damagePlayer(target, CONFIG.balance.combat.enemyBulletDamage);
          game.bullets.splice(i, 1);
        }
      }
    }
  }
  function explodeAt(x, y, damage, ownerId) {
    const owner = game.players.get(ownerId);
    const combat = CONFIG.balance.combat;
    for (const enemy of [...game.enemies]) {
      if (Math.hypot(enemy.x - x, enemy.y - y) > combat.enemyRadius) continue;
      enemy.hp -= damage * combat.explosionDamage;
      if (enemy.hp <= 0) {
        game.enemies.splice(game.enemies.indexOf(enemy), 1);
        if (owner) { owner.kills++; addXp(owner, CONFIG.progression.enemyXp); }
      }
    }
    for (const player of game.players.values()) {
      if (player.id !== ownerId && player.alive && Math.hypot(player.x - x, player.y - y) < combat.enemyRadius) damagePlayer(player, damage * combat.splashPlayerDamage, owner);
    }
    for (const object of [...game.objects]) {
      if (Math.hypot(object.x - x, object.y - y) > combat.enemyRadius) continue;
      object.hp -= damage * combat.explosionDamage;
      if (object.hp <= 0) {
        game.objects.splice(game.objects.indexOf(object), 1);
        if (owner) addXp(owner, CONFIG.progression.objectXp);
      }
    }
  }
  function updateEnemies(dt) {
    for (const enemy of game.enemies) {
      enemy.hitLeft = Math.max(0, enemy.hitLeft - dt);
      const targets = [...game.players.values()].filter((p) => p.alive && (p.connected || p.id === "host") &&
        !(p.effects.invisibleUntil > game.elapsed));
      if (!targets.length) continue;
      let target = targets[0], min = Infinity;
      for (const p of targets) { const d = (p.x - enemy.x) ** 2 + (p.y - enemy.y) ** 2; if (d < min) { min = d; target = p; } }
      const dx = target.x - enemy.x, dy = target.y - enemy.y, dist = Math.hypot(dx, dy) || 1;
      const balance = CONFIG.balance.enemies;
      if (dist > balance.contactRadius) { enemy.x += dx / dist * enemy.speed * dt; enemy.y += dy / dist * enemy.speed * dt; }
      else if (enemy.hitLeft <= 0) { damagePlayer(target, balance.contactDamage); enemy.hitLeft = balance.contactCooldown; }
    }
  }
  function damagePlayer(player, damage, attacker) {
    player.effects ||= {};
    if (player.invulnerable > 0 || player.effects.shieldUntil > game.elapsed ||
        player.effects.invulnerableUntil > game.elapsed) return;
    const reducedDamage = damage * (1 - Math.min(.5, player.resistance));
    player.hp = Math.max(0, player.hp - reducedDamage);
    player.invulnerable = CONFIG.balance.combat.playerInvulnerabilitySeconds;
    if (player.hp <= 0) {
      player.alive = false;
      if (attacker && attacker.id !== player.id) {
        attacker.kills++;
        addXp(attacker, CONFIG.progression.killXp);
      }
      if (player.id === game.selfId) setMessage("Vous êtes éliminé. Vos coéquipiers continuent le combat.");
    }
  }
  function updateAbilityEffects(player) {
    for (const [id, until] of Object.entries(player.abilityCooldowns || {})) {
      if (until <= game.elapsed) delete player.abilityCooldowns[id];
    }
    for (const [id, until] of Object.entries(player.effects || {})) {
      if (until <= game.elapsed) delete player.effects[id];
    }
  }
  function activateAbility(player, id) {
    const ability = CONFIG.abilities.find((item) => item.id === id);
    if (!ability || !player.alive || player.abilityCooldowns[id] > game.elapsed) return false;
    if (!game.isHost) {
      const connection = game.connections.get(game.hostPeerId);
      if (!connection?.open) return false;
      connection.send({ type: "ability", id });
      return true;
    }
    player.effects ||= {};
    player.abilityCooldowns[id] = game.elapsed + ability.cooldown;
    const until = game.elapsed + ability.duration;
    if (id === "shield") player.effects.shieldUntil = until;
    else if (id === "dash") player.effects.dashUntil = until;
    else if (id === "heal") { player.effects.healUntil = until; player.hp = Math.min(player.maxHp, player.hp + 35); }
    else if (id === "invisible") player.effects.invisibleUntil = until;
    else if (id === "explosive") player.effects.explosiveUntil = until;
    else if (id === "invulnerable") player.effects.invulnerableUntil = until;
    else if (id === "volley") {
      for (let i = 0; i < 16; i++) spawnBullet(player, i * Math.PI * 2 / 16);
    } else if (id === "repel") {
      for (const target of [...game.enemies, ...[...game.players.values()].filter((item) => item.id !== player.id && item.alive)]) {
        const dx = target.x - player.x, dy = target.y - player.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 220 && distance > 0) {
          target.x = clamp(player.x + dx / distance * 240, 20, WORLD - 20);
          target.y = clamp(player.y + dy / distance * 240, 20, WORLD - 20);
        }
      }
    }
    showToast(`${ability.name} activé`);
    return true;
  }
  function addXp(player, amount) {
    player.xp += amount;
    while (player.level < CONFIG.progression.maxLevel && player.xp >= xpForNextLevel(player) && !player.waitingUpgrade) {
      const threshold = xpForNextLevel(player);
      player.xp -= threshold;
      player.level++;
      player.unspentPoints++;
      player.pendingLevels++;
      player.pendingEvolution = CONFIG.progression.evolutionLevels.includes(player.level);
      player.waitingUpgrade = true;
      recalculateStats(player);
      if (player.id === game.selfId) {
        flashLevelUp();
        showUpgradeOptions();
      }
    }
  }
  function xpForNextLevel(player) {
    const progression = CONFIG.progression;
    return Math.round(progression.firstLevelXp + player.level * progression.perLevelXp +
      player.level * player.level * progression.quadraticXp);
  }
  function recalculateStats(player) {
    const points = player.stats || {};
    const evolution = evolutionById.get(player.evolution) || evolutionById.get("basic");
    const modifiers = evolution.modifiers || {};
    const multiplier = (key) => modifiers[key] || 1;
    const base = CONFIG.balance.player;
    const growth = CONFIG.balance.growth;
    const previousMax = player.maxHp || base.maxHp;
    player.speed = base.speed * (1 + (points.speed || 0) * growth.speed) * multiplier("speed");
    player.maxHp = Math.round(base.maxHp * (1 + (points.maxHp || 0) * growth.maxHp) * multiplier("maxHp"));
    player.hp = Math.min(player.maxHp, player.hp + Math.max(0, player.maxHp - previousMax));
    player.regeneration = ((points.regeneration || 0) * growth.regeneration + (points.maxHp || 0) * growth.maxHpRegeneration) * multiplier("regeneration");
    player.damage = base.damage * (1 + (points.damage || 0) * growth.damage) * multiplier("damage");
    player.bulletSpeed = base.bulletSpeed * (1 + (points.bulletSpeed || 0) * growth.bulletSpeed) * multiplier("bulletSpeed");
    player.fireRate = base.fireRate / ((1 + (points.fireRate || 0) * growth.fireRate) * multiplier("fireRate"));
    player.resistance = Math.min(base.maxResistance, (points.resistance || 0) * growth.resistance + (1 - multiplier("resistance")));
    player.penetration = Math.floor((points.penetration || 0) / growth.penetrationPerPoint);
    player.range = base.range * (1 + (points.range || 0) * growth.range) * multiplier("range");
    player.bulletSize = base.bulletSize * multiplier("bulletSize");
    player.cannons = evolution.radial || evolution.rotating || evolution.cannons?.length || 1;
  }
  function availableEvolutions(player) {
    return CONFIG.evolutions.filter((item) => item.level === player.level && item.parents.includes(player.evolution));
  }
  function evolutionStats(item) {
    const stats = Object.entries(item.modifiers || {}).filter(([key]) => modifierLabels[key])
      .map(([key, value]) => `${modifierLabels[key]} ×${Number(value).toFixed(2)}`);
    if (item.modifiers?.resistance < 1) stats.push(`Résistance +${Math.round((1 - item.modifiers.resistance) * 100)} %`);
    if (item.modifiers?.explosive) stats.push("Impacts explosifs");
    return stats.length ? stats.join(" · ") : "Statistiques équilibrées";
  }
  function applyProgressionChoice(player, action, key) {
    if (!player.waitingUpgrade) return;
    if (action === "stat") {
      const definition = statByKey.get(key);
      if (!definition || player.unspentPoints <= 0 || (player.stats[key] || 0) >= definition.max) return;
      player.stats[key] = (player.stats[key] || 0) + 1;
      player.unspentPoints--;
      player.pendingLevels = Math.max(0, player.pendingLevels - 1);
      recalculateStats(player);
    } else if (action === "evolution") {
      if (!player.pendingEvolution || !availableEvolutions(player).some((item) => item.id === key)) return;
      player.evolution = key;
      player.pendingEvolution = false;
      recalculateStats(player);
    } else return;
    player.waitingUpgrade = player.unspentPoints > 0 || player.pendingEvolution;
    if (player.id === game.selfId) {
      if (player.waitingUpgrade) showUpgradeOptions();
      else $("#upgrade-dialog").hidden = true;
    }
    if (game.isHost && !player.waitingUpgrade && player.xp >= xpForNextLevel(player)) addXp(player, 0);
  }
  function showUpgradeOptions() {
    const dialog = $("#upgrade-dialog");
    const player = game?.players.get(game?.selfId);
    if (!player?.waitingUpgrade) { dialog.hidden = true; return; }
    const menuKey = `${player.level}:${player.unspentPoints}:${player.pendingEvolution}:${player.evolution}:${JSON.stringify(player.stats)}`;
    if (!dialog.hidden && game.progressionMenuKey === menuKey) return;
    game.progressionMenuKey = menuKey;
    dialog.hidden = false;
    const tier = player.level;
    const heading = $("#upgrade-tier");
    const title = $("#upgrade-title");
    const description = $("#upgrade-description");
    const area = $("#upgrade-options");
    area.replaceChildren();
    if (player.unspentPoints > 0) {
      heading.textContent = `POINT DE COMPÉTENCE · NIVEAU ${tier} · ${player.unspentPoints} RESTANT(S)`;
      title.textContent = "Améliore une caractéristique";
      description.textContent = "Chaque caractéristique est plafonnée à 10 points.";
      for (const stat of CONFIG.stats) {
        const value = player.stats?.[stat.key] || 0;
        if (value >= stat.max) continue;
        const button = document.createElement("button");
          button.className = "upgrade-choice stat-choice";
        button.dataset.choice = `stat:${stat.key}`;
        button.innerHTML = `<strong>${stat.name} <span>${value}/${stat.max}</span></strong><span>${stat.description}</span><span class="stat-pips">${Array.from({ length: stat.max }, (_, i) => `<i class="${i < value ? "filled" : ""}"></i>`).join("")}</span>`;
        area.append(button);
      }
    } else if (player.pendingEvolution) {
      heading.textContent = `ÉVOLUTION · NIVEAU ${tier}`;
      title.textContent = "Choisis ta branche";
      description.textContent = "Ton évolution dépend de la classe précédente. Chaque canon a ses forces et ses compromis.";
      for (const item of availableEvolutions(player)) {
        const button = document.createElement("button");
        button.className = "upgrade-choice evolution-choice";
        button.dataset.choice = `evolution:${item.id}`;
        button.innerHTML = `<span class="evolution-glyph" aria-hidden="true">${item.radial ? "✺" : item.rotating ? "⟳" : item.cannons.length > 2 ? "✣" : "⌁"}</span><strong>${item.name}</strong><span class="evolution-branch">${branchLabels[item.branch] || item.branch} · palier ${item.level}</span><span class="class-stats">${evolutionStats(item)}</span><span>+ ${item.pros}</span><span>− ${item.cons}</span>`;
        area.append(button);
      }
    }
    area.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => {
      const [action, key] = button.dataset.choice.split(":");
      if (game.isHost) applyProgressionChoice(player, action, key);
      else {
        const connection = game.connections.get(game.hostPeerId);
        if (connection?.open) connection.send({ type: "upgrade", action, key });
      }
    }));
    area.querySelector("button")?.focus();
  }
  function renderHud(player) {
    $("#level-value").textContent = player.level;
    const threshold = xpForNextLevel(player);
    $("#xp-bar").style.width = `${player.level >= CONFIG.progression.maxLevel ? 100 : Math.min(100, player.xp / threshold * 100)}%`;
    $("#xp-text").textContent = player.level >= CONFIG.progression.maxLevel ? "NIVEAU MAX" : `${player.xp} / ${threshold} XP`;
    $("#kill-count").textContent = player.kills;
    $("#gun-count").textContent = player.cannons || 1;
    $("#class-value").textContent = evolutionById.get(player.evolution)?.name || "Canon simple";
    $("#health-bar").style.width = `${Math.max(0, player.hp / player.maxHp * 100)}%`;
    $("#health-text").textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    for (const ability of CONFIG.abilities) {
      const button = $(`[data-ability="${ability.id}"]`);
      if (!button) continue;
      const remaining = Math.max(0, Math.ceil((player.abilityCooldowns?.[ability.id] || 0) - game.elapsed));
      button.disabled = remaining > 0;
      button.querySelector(".ability-cooldown").textContent = remaining ? `${remaining}s` : ability.key;
    }
  }
  function showGameOver(player) {
    if (game?.gameOver) return;
    game.gameOver = true;
    $("#final-score").textContent = `Niveau ${player.level} · ${player.kills} élimination(s)`;
    $("#gameover-dialog").hidden = false;
    $("#upgrade-dialog").hidden = true;
    $("#restart-button").focus();
  }
  function render() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const self = game.players.get(game.selfId) || game.players.get("host");
    if (!self) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#101522"; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#dce4ef"; ctx.textAlign = "center"; ctx.font = "14px Manrope";
      ctx.fillText("Connexion à l'arène…", width / 2, height / 2);
      return;
    }
    const scale = Math.min(1.2, Math.max(.55, Math.min(width / 900, height / 650)));
    const centerX = width / 2, centerY = height / 2;
    const spectator = self.alive ? self : [...game.players.values()].find((p) => p.alive);
    const cameraX = (spectator || self).x, cameraY = (spectator || self).y;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#101522"; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.translate(centerX - cameraX * scale, centerY - cameraY * scale); ctx.scale(scale, scale);
    ctx.fillStyle = "#141b29"; ctx.fillRect(0, 0, WORLD, WORLD);
    ctx.strokeStyle = "#ffffff0b"; ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD); ctx.stroke(); }
    for (let y = 0; y <= WORLD; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD, y); ctx.stroke(); }
    ctx.strokeStyle = "#a4ffb21f"; ctx.lineWidth = 4; ctx.strokeRect(0, 0, WORLD, WORLD);
    for (const food of game.foods) drawFood(food);
    for (const object of game.objects) drawObject(object);
    for (const e of game.enemies) drawEnemy(e);
    for (const b of game.bullets) {
      ctx.beginPath(); ctx.fillStyle = b.color || "#ff7180"; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
      ctx.arc(b.x, b.y, b.radius || 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    for (const p of game.players.values()) if (p.alive) drawPlayer(p);
    ctx.restore();
    const alive = [...game.players.values()].filter((p) => p.alive).length;
    if (!alive && !game.gameOver) showGameOver(self);
  }
  function drawFood(food) {
    ctx.save();
    ctx.translate(food.x, food.y);
    ctx.fillStyle = "#d3ff6a";
    ctx.shadowColor = "#d3ff6a";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, CONFIG.balance.resources.visualRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff8c8";
    ctx.beginPath();
    ctx.arc(-1.5, -1.5, CONFIG.balance.resources.visualRadius / 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawObject(object) {
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.fillStyle = "#b983ff";
    ctx.shadowColor = "#9c6cff";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(-object.radius, -object.radius, object.radius * 2, object.radius * 2, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#efe4ff";
    ctx.fillRect(-3, -3, 6, 6);
    ctx.fillStyle = "#252033";
    ctx.fillRect(-object.radius, -object.radius - 6, object.radius * 2, 3);
    ctx.fillStyle = "#c8a9ff";
    ctx.fillRect(-object.radius, -object.radius - 6, object.radius * 2 * Math.max(0, object.hp / object.maxHp), 3);
    ctx.restore();
  }
  function drawEnemy(e) {
    ctx.beginPath(); ctx.fillStyle = "#ff7584"; ctx.shadowColor = "#ff536b"; ctx.shadowBlur = 14;
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.fillStyle = "#45212d"; ctx.arc(e.x, e.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#45212d"; ctx.fillRect(e.x - e.radius, e.y - e.radius - 8, e.radius * 2, 3);
    ctx.fillStyle = "#ff9aa4"; ctx.fillRect(e.x - e.radius, e.y - e.radius - 8, e.radius * 2 * Math.max(0, e.hp / e.maxHp), 3);
  }
  function drawPlayer(p) {
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.effects?.invisibleUntil > game.elapsed) ctx.globalAlpha = .22;
    ctx.beginPath(); ctx.fillStyle = p.invulnerable > 0 && Math.floor(game.elapsed * 16) % 2 ? "#ffffff" : p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = p.id === game.selfId ? 22 : 10;
    ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.rotate(p.angle); ctx.fillStyle = "#f4f4ed";
    const evolution = evolutionById.get(p.evolution) || evolutionById.get("basic");
    const layouts = evolution.rotating
      ? Array.from({ length: 4 }, (_, i) => ({ angle: game.elapsed * 1.5 + i * Math.PI / 2, offset: 0 }))
      : evolution.radial
        ? Array.from({ length: evolution.radial }, (_, i) => ({ angle: i * Math.PI * 2 / evolution.radial, offset: 0 }))
        : cannonLayout(p);
    for (const cannon of layouts) {
      ctx.save();
      ctx.translate(0, cannon.offset || 0);
      ctx.rotate(cannon.angle || 0);
      ctx.beginPath(); ctx.roundRect(2, -2.5, 21, 5, 2); ctx.fill();
      ctx.fillStyle = "#bdf7ff";
      ctx.fillRect(20, -1.5, 4, 3);
      ctx.fillStyle = "#f4f4ed";
      ctx.restore();
    }
    ctx.restore();
    ctx.font = "10px Manrope"; ctx.textAlign = "center"; ctx.fillStyle = p.id === game.selfId ? "#eaffeb" : "#d4dbea";
    ctx.fillText(p.id === "host" ? "Hôte" : (p.id === game.selfId ? "Vous" : p.name || "Invité"), p.x, p.y - 22);
    ctx.fillStyle = "#303849"; ctx.fillRect(p.x - 13, p.y + 17, 26, 3);
    ctx.fillStyle = p.color; ctx.fillRect(p.x - 13, p.y + 17, 26 * Math.max(0, p.hp / p.maxHp), 3);
  }

  for (const ability of CONFIG.abilities) {
    const button = document.createElement("button");
    button.className = "ability-button";
    button.type = "button";
    button.dataset.ability = ability.id;
    button.title = `${ability.name} — ${ability.description} (touche ${ability.key})`;
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `<span class="ability-key">${ability.key}</span><span>${ability.name}</span><span class="ability-cooldown">${ability.key}</span>`;
    button.addEventListener("click", () => {
      const player = game?.players.get(game.selfId);
      if (player) activateAbility(player, ability.id);
    });
    $("#ability-bar").append(button);
  }

  $("#solo-button").addEventListener("click", startSolo);
  $("#create-button").addEventListener("click", createRoom);
  $("#join-form").addEventListener("submit", (event) => {
    event.preventDefault();
    joinRoom(roomInput.value);
  });
  $("#leave-button").addEventListener("click", showHome);
  $("#restart-button").addEventListener("click", showHome);
  $("#copy-link").addEventListener("click", async () => {
    if (!game?.code) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${game.code}`);
      $("#copy-link").textContent = "Copié !";
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { $("#copy-link").textContent = "Copier"; }, 1600);
    } catch { setMessage(`Code de salle : ${game.code}`); }
  });
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const movementKey = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key);
    if (/^[1-8]$/.test(key) && game && !gameScreen.hidden && $("#upgrade-dialog").hidden) {
      const player = game.players.get(game.selfId);
      if (player) activateAbility(player, CONFIG.abilities[Number(key) - 1].id);
      event.preventDefault();
      return;
    }
    if (game && !gameScreen.hidden && movementKey) {
      if (key.startsWith("arrow")) event.preventDefault();
      keys.add(key);
      return;
    }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key) && gameScreen.contains(document.activeElement)) event.preventDefault();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (event.pointerType === "touch") {
      if (game?.touchMove?.id === event.pointerId) {
        const dx = point.x - game.touchMove.originX, dy = point.y - game.touchMove.originY;
        const length = Math.max(1, Math.hypot(dx, dy));
        const strength = Math.min(1, length / 36);
        game.touchMove.x = dx / length * strength;
        game.touchMove.y = dy / length * strength;
      } else if (game?.touchAim?.id === event.pointerId) game.touchAim = { ...point, id: event.pointerId };
    } else aimPointer = point;
  });
  canvas.addEventListener("pointerdown", (event) => {
    canvas.focus();
    if (event.pointerType !== "touch" || !game) return;
    const rect = canvas.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (point.x < rect.width / 2 && !game.touchMove) game.touchMove = { id: event.pointerId, originX: point.x, originY: point.y, x: 0, y: 0 };
    else if (!game.touchAim) game.touchAim = { ...point, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  const endTouch = (event) => {
    if (!game || event.pointerType !== "touch") return;
    if (game.touchMove?.id === event.pointerId) game.touchMove = null;
    if (game.touchAim?.id === event.pointerId) game.touchAim = null;
  };
  canvas.addEventListener("pointerup", endTouch);
  canvas.addEventListener("pointercancel", endTouch);
  window.addEventListener("resize", resizeCanvas);
  const params = new URLSearchParams(location.search);
  if (params.has("room")) {
    roomInput.value = params.get("room") || "";
    setTimeout(() => joinRoom(roomInput.value), 0);
  }
})();
