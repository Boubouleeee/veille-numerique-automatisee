(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const home = $("#home");
  const gameScreen = $("#game-screen");
  const canvas = $("#arena");
  const ctx = canvas.getContext("2d");
  const status = $("#home-status");
  const roomInput = $("#room-code");
  const upgrades = [
    { key: "rate", minLevel: 1, title: "Cadence éclair", text: "Tir 22 % plus rapide." },
    { key: "damage", minLevel: 1, title: "Munitions lourdes", text: "Inflige 30 % de dégâts en plus." },
    { key: "speed", minLevel: 1, title: "Pas vif", text: "Déplacement 16 % plus rapide." },
    { key: "vitality", minLevel: 1, title: "Cœur solide", text: "+30 vie max. et récupère 30 vie." },
    { key: "doubleCannons", minLevel: 4, title: "Double canons", text: "Tire deux boulettes à chaque salve." },
    { key: "rate2", minLevel: 4, title: "Surcadence", text: "Tir 30 % plus rapide." },
    { key: "damage2", minLevel: 4, title: "Boulettes renforcées", text: "Inflige 45 % de dégâts en plus." },
    { key: "speed2", minLevel: 4, title: "Turbo", text: "Déplacement 24 % plus rapide." },
    { key: "vitality2", minLevel: 4, title: "Réserve renforcée", text: "+50 vie max. et récupère 50 vie." },
    { key: "tripleCannons", minLevel: 8, title: "Triple canons", text: "Ajoute un troisième canon." },
    { key: "rate3", minLevel: 8, title: "Cadence extrême", text: "Tir 38 % plus rapide." },
    { key: "damage3", minLevel: 8, title: "Boulettes surpuissantes", text: "Inflige 60 % de dégâts en plus." },
    { key: "speed3", minLevel: 8, title: "Vitesse supersonique", text: "Déplacement 32 % plus rapide." },
    { key: "vitality3", minLevel: 8, title: "Cœur colossal", text: "+80 vie max. et récupère 80 vie." }
  ];
  const colors = ["#a4ffb2", "#ffcb70", "#8bd8ff", "#ff90ab", "#c5a4ff", "#ffe67b", "#78e4d1", "#ffac74"];
  const WORLD = 1800;
  const MAX_FOOD = 140;
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
    resizeCanvas();
    canvas.focus?.();
  };
  const showHome = () => {
    gameScreen.hidden = true;
    home.hidden = false;
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
  const makePlayer = (id, name, color) => ({
    id, name, color, x: WORLD / 2 + (Math.random() - .5) * 90, y: WORLD / 2 + (Math.random() - .5) * 90,
    angle: 0, hp: 100, maxHp: 100, speed: 220, damage: 16, fireRate: .36, fireLeft: .1,
    xp: 0, level: 1, kills: 0, cannons: 1, alive: true, invulnerable: 0, waitingUpgrade: false, pendingLevels: 0, connected: true
  });
  const createGame = ({ mode, code = "", host = false, peer = null }) => {
    game = {
      mode, code, isHost: host, peer, selfId: host || mode === "solo" ? "host" : "",
      players: new Map(), enemies: [], bullets: [], foods: [], lastFoodSpawn: 0, foodId: 0, lastSpawn: 0, elapsed: 0, spawnId: 0,
      snapshotTimer: 0, lastInputSend: 0, connections: new Map(), closed: false, hostPeerId: peerId(code),
      joining: false, gameOver: false, localInput: inputState
    };
    for (let i = 0; i < MAX_FOOD; i++) game.foods.push(makeFood());
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
        if (player?.waitingUpgrade) applyUpgrade(player, message.key);
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
        pendingLevels: p.pendingLevels, connected: p.connected, cannons: p.cannons
      })),
      enemies: game.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, radius: e.radius })),
      bullets: game.bullets.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, color: b.color, enemy: b.enemy, radius: b.radius })),
      foods: game.foods.map((food) => ({ id: food.id, x: food.x, y: food.y, value: food.value })),
      spawnId: game.spawnId
    };
  }
  function mergeSnapshot(state) {
    if (!state || !Array.isArray(state.players)) return;
    game.elapsed = state.elapsed || game.elapsed || 0;
    for (const p of state.players) game.players.set(p.id, { ...p });
    for (const id of [...game.players.keys()]) if (!state.players.some((p) => p.id === id)) game.players.delete(id);
    game.enemies = Array.isArray(state.enemies) ? state.enemies : [];
    game.bullets = Array.isArray(state.bullets) ? state.bullets : [];
    game.foods = Array.isArray(state.foods) ? state.foods : [];
    game.spawnId = state.spawnId || 0;
    const self = game.players.get(game.selfId);
    if (self) {
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
    if (game.lastFoodSpawn >= 1.5 && game.foods.length < MAX_FOOD) {
      game.lastFoodSpawn = 0;
      game.foods.push(makeFood());
    }
    for (const p of [...game.players.values()]) {
      if (!p.connected && p.id !== "host" && game.elapsed - p.disconnectedAt > 12) {
        game.players.delete(p.id);
        continue;
      }
      if (!p.alive || p.waitingUpgrade) continue;
      p.invulnerable = Math.max(0, p.invulnerable - dt);
      const ix = p.inputX || 0, iy = p.inputY || 0;
      const magnitude = Math.hypot(ix, iy) || 1;
      p.x = clamp(p.x + ix / magnitude * p.speed * dt, 28, WORLD - 28);
      p.y = clamp(p.y + iy / magnitude * p.speed * dt, 28, WORLD - 28);
      collectFood(p);
      p.fireLeft -= dt;
      if (p.fireLeft <= 0) {
        const target = nearestEnemy(p);
        if (target) {
          const angle = p.id === "host" || p.inputX !== undefined ? p.angle : Math.atan2(target.y - p.y, target.x - p.x);
          spawnBullet(p, angle);
          p.fireLeft = p.fireRate;
        } else p.fireLeft = Math.min(p.fireLeft, .08);
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
  function nearestEnemy(p) {
    let found = null, distance = Infinity;
    for (const e of game.enemies) {
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < distance) { found = e; distance = d; }
    }
    return found;
  }
  function spawnBullet(p, angle) {
    const speed = 610;
    const count = Math.max(1, Math.min(3, p.cannons || 1));
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * 9;
      const x = p.x + Math.cos(angle) * 20 - Math.sin(angle) * offset;
      const y = p.y + Math.sin(angle) * 20 + Math.cos(angle) * offset;
      game.bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        damage: p.damage, owner: p.id, color: p.color, radius: 5, enemy: false });
    }
  }
  function makeFood() {
    return { id: ++game.foodId, x: 35 + Math.random() * (WORLD - 70), y: 35 + Math.random() * (WORLD - 70), value: 3 };
  }
  function collectFood(player) {
    for (let i = game.foods.length - 1; i >= 0; i--) {
      const food = game.foods[i];
      if (Math.hypot(player.x - food.x, player.y - food.y) < 23) {
        game.foods.splice(i, 1);
        addXp(player, food.value);
      }
    }
  }
  function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const target = game.players.get("host");
    const cx = target?.x || WORLD / 2, cy = target?.y || WORLD / 2;
    const x = clamp(cx + Math.cos(angle) * 590, 25, WORLD - 25);
    const y = clamp(cy + Math.sin(angle) * 460, 25, WORLD - 25);
    const hp = 25 + Math.min(game.elapsed * .22, 70);
    game.enemies.push({ id: ++game.spawnId, x, y, hp, maxHp: hp, radius: 12 + Math.random() * 5, speed: 47 + Math.random() * 19 + Math.min(game.elapsed / 40, 35), hitLeft: 0 });
  }
  function updateBullets(dt) {
    for (let i = game.bullets.length - 1; i >= 0; i--) {
      const b = game.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0 || b.x > WORLD || b.y < 0 || b.y > WORLD) { game.bullets.splice(i, 1); continue; }
      if (!b.enemy) {
        const target = game.enemies.find((e) => Math.hypot(e.x - b.x, e.y - b.y) < e.radius + b.radius);
        if (target) {
          target.hp -= b.damage || 16;
          game.bullets.splice(i, 1);
          if (target.hp <= 0) {
            game.enemies.splice(game.enemies.indexOf(target), 1);
            const owner = game.players.get(b.owner);
            if (owner) { owner.kills++; addXp(owner, 1); }
          }
        }
      } else {
        const target = [...game.players.values()].find((p) => p.alive && Math.hypot(p.x - b.x, p.y - b.y) < 15);
        if (target) {
          hurtPlayer(target, 10);
          game.bullets.splice(i, 1);
        }
      }
    }
  }
  function updateEnemies(dt) {
    for (const enemy of game.enemies) {
      enemy.hitLeft = Math.max(0, enemy.hitLeft - dt);
      const targets = [...game.players.values()].filter((p) => p.alive && (p.connected || p.id === "host"));
      if (!targets.length) continue;
      let target = targets[0], min = Infinity;
      for (const p of targets) { const d = (p.x - enemy.x) ** 2 + (p.y - enemy.y) ** 2; if (d < min) { min = d; target = p; } }
      const dx = target.x - enemy.x, dy = target.y - enemy.y, dist = Math.hypot(dx, dy) || 1;
      if (dist > 21) { enemy.x += dx / dist * enemy.speed * dt; enemy.y += dy / dist * enemy.speed * dt; }
      else if (enemy.hitLeft <= 0) { hurtPlayer(target, 9); enemy.hitLeft = .8; }
    }
  }
  function hurtPlayer(player, damage) {
    if (player.invulnerable > 0) return;
    player.hp = Math.max(0, player.hp - damage);
    player.invulnerable = .45;
    if (player.hp <= 0) {
      player.alive = false;
      if (player.id === "host") setMessage("Vous êtes éliminé. Vos coéquipiers continuent le combat.");
    }
  }
  function addXp(player, amount) {
    player.xp += amount;
    const threshold = xpForNextLevel(player);
    if (player.xp >= threshold && !player.waitingUpgrade) {
      player.xp -= threshold;
      player.level++;
      player.pendingLevels++;
      player.waitingUpgrade = true;
      if (player.id === "host") showUpgradeOptions();
    }
  }
  function xpForNextLevel(player) {
    return player.level * 8;
  }
  function upgradeTier(level) {
    return level >= 8 ? 3 : level >= 4 ? 2 : 1;
  }
  function availableUpgrades(player) {
    return upgrades.filter((upgrade) => upgrade.minLevel <= player.level &&
      !(upgrade.key === "doubleCannons" && player.cannons >= 2) &&
      !(upgrade.key === "tripleCannons" && (player.cannons < 2 || player.cannons >= 3)));
  }
  function upgradeChoices(player) {
    const tier = upgradeTier(player.level);
    const tierLevel = [0, 1, 4, 8][tier];
    const choices = availableUpgrades(player).filter((upgrade) => upgrade.minLevel === tierLevel);
    if (tier > 1 && player.cannons < 2) {
      choices.push(upgrades.find((upgrade) => upgrade.key === "doubleCannons"));
    } else if (tier === 3 && player.cannons === 2) {
      choices.push(upgrades.find((upgrade) => upgrade.key === "tripleCannons"));
    }
    const featuredKey = tier === 2 || (tier === 3 && player.cannons < 3)
      ? player.cannons < 2 ? "doubleCannons" : "tripleCannons"
      : null;
    const featured = choices.find((upgrade) => upgrade.key === featuredKey);
    const others = choices.filter((upgrade) => upgrade !== featured).sort(() => Math.random() - .5);
    return featured ? [featured, ...others.slice(0, 2)] : others.slice(0, 3);
  }
  function applyUpgrade(player, key) {
    if (!player.waitingUpgrade || !availableUpgrades(player).some((upgrade) => upgrade.key === key)) return;
    if (key === "rate") player.fireRate = Math.max(.12, player.fireRate * .78);
    if (key === "rate2") player.fireRate = Math.max(.1, player.fireRate * .7);
    if (key === "rate3") player.fireRate = Math.max(.08, player.fireRate * .62);
    if (key === "damage") player.damage *= 1.3;
    if (key === "damage2") player.damage *= 1.45;
    if (key === "damage3") player.damage *= 1.6;
    if (key === "speed") player.speed *= 1.16;
    if (key === "speed2") player.speed *= 1.24;
    if (key === "speed3") player.speed *= 1.32;
    if (key === "vitality") { player.maxHp += 30; player.hp = Math.min(player.maxHp, player.hp + 30); }
    if (key === "vitality2") { player.maxHp += 50; player.hp = Math.min(player.maxHp, player.hp + 50); }
    if (key === "vitality3") { player.maxHp += 80; player.hp = Math.min(player.maxHp, player.hp + 80); }
    if (key === "doubleCannons") player.cannons = 2;
    if (key === "tripleCannons") player.cannons = 3;
    player.pendingLevels = Math.max(0, player.pendingLevels - 1);
    player.waitingUpgrade = player.pendingLevels > 0;
    if (player.id === "host") {
      if (player.waitingUpgrade) showUpgradeOptions();
      else $("#upgrade-dialog").hidden = true;
      if (!player.waitingUpgrade && player.xp >= xpForNextLevel(player)) addXp(player, 0);
    } else {
      const conn = game.connections.get(game.hostPeerId);
      if (conn?.open) conn.send({ type: "upgrade", key });
      $("#upgrade-dialog").hidden = true;
    }
  }
  function showUpgradeOptions() {
    const dialog = $("#upgrade-dialog");
    const player = game?.players.get(game?.selfId);
    if (!player?.waitingUpgrade) { dialog.hidden = true; return; }
    if (!dialog.hidden && $("#upgrade-options").childElementCount) return;
    dialog.hidden = false;
    const tier = upgradeTier(player.level);
    $(".dialog-card .eyebrow").textContent = `PALIER ${["", "I", "II", "III"][tier]} · NIVEAU ${player.level}`;
    $("#upgrade-title").textContent = `Amélioration de palier ${["", "I", "II", "III"][tier]}`;
    const area = $("#upgrade-options");
    area.replaceChildren();
    const choices = upgradeChoices(player);
    for (const item of choices) {
      const button = document.createElement("button");
      button.className = "upgrade-choice";
      button.innerHTML = `<strong>${item.title}</strong><span>${item.text}</span>`;
      button.addEventListener("click", () => {
        const player = game?.players.get(game.selfId);
        if (!player?.waitingUpgrade) return;
        if (game.isHost) applyUpgrade(player, item.key);
        else applyUpgrade(player, item.key);
      });
      area.append(button);
    }
    area.querySelector("button")?.focus();
  }
  function renderHud(player) {
    $("#level-value").textContent = player.level;
    const threshold = xpForNextLevel(player);
    $("#xp-bar").style.width = `${Math.min(100, player.xp / threshold * 100)}%`;
    $("#xp-text").textContent = `${player.xp} / ${threshold} XP`;
    $("#kill-count").textContent = player.kills;
    $("#gun-count").textContent = player.cannons || 1;
    $("#health-bar").style.width = `${Math.max(0, player.hp / player.maxHp * 100)}%`;
    $("#health-text").textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
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
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff8c8";
    ctx.beginPath();
    ctx.arc(-1.5, -1.5, 2, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.beginPath(); ctx.fillStyle = p.invulnerable > 0 && Math.floor(game.elapsed * 16) % 2 ? "#ffffff" : p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = p.id === game.selfId ? 22 : 10;
    ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.rotate(p.angle); ctx.fillStyle = "#f4f4ed";
    const cannons = Math.max(1, Math.min(3, p.cannons || 1));
    for (let i = 0; i < cannons; i++) {
      const offset = (i - (cannons - 1) / 2) * 7;
      ctx.beginPath(); ctx.roundRect(2, offset - 2, 19, 4, 2); ctx.fill();
    }
    ctx.restore();
    ctx.font = "10px Manrope"; ctx.textAlign = "center"; ctx.fillStyle = p.id === game.selfId ? "#eaffeb" : "#d4dbea";
    ctx.fillText(p.id === "host" ? "Hôte" : (p.id === game.selfId ? "Vous" : p.name || "Invité"), p.x, p.y - 22);
    ctx.fillStyle = "#303849"; ctx.fillRect(p.x - 13, p.y + 17, 26, 3);
    ctx.fillStyle = p.color; ctx.fillRect(p.x - 13, p.y + 17, 26 * Math.max(0, p.hp / p.maxHp), 3);
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
