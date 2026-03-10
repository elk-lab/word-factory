const $ = (id) => document.getElementById(id);

const state = {
  roomId: "",
  playerId: "",
  token: "",
  host: false,
  room: null,
  source: null,
  qrFailed: false,
  selectedPath: [],
  boardRotation: 0,
  pointerActive: false,
  pointerMoved: false,
  pointerSubmitTap: false,
  pointerId: null,
};

const ui = {
  authCard: $("authCard"),
  gameCard: $("gameCard"),
  nameInput: $("nameInput"),
  roomInput: $("roomInput"),
  createBtn: $("createBtn"),
  joinBtn: $("joinBtn"),
  authError: $("authError"),
  roomCode: $("roomCode"),
  roundBadge: $("roundBadge"),
  playerBadge: $("playerBadge"),
  inviteLink: $("inviteLink"),
  copyLinkBtn: $("copyLinkBtn"),
  shareBtn: $("shareBtn"),
  qrImage: $("qrImage"),
  timer: $("timer"),
  timerConfig: $("timerConfig"),
  maxPlayersConfig: $("maxPlayersConfig"),
  minWordConfig: $("minWordConfig"),
  totalRoundsConfig: $("totalRoundsConfig"),
  saveSettingsBtn: $("saveSettingsBtn"),
  readyBtn: $("readyBtn"),
  rotateBtn: $("rotateBtn"),
  mechanicsBtn: $("mechanicsBtn"),
  mechanicsDialog: $("mechanicsDialog"),
  boardWrap: $("boardWrap"),
  pathSvg: $("pathSvg"),
  board: $("board"),
  pathPreview: $("pathPreview"),
  clearPathBtn: $("clearPathBtn"),
  startBtn: $("startBtn"),
  status: $("status"),
  playersList: $("playersList"),
  leaderboard: $("leaderboard"),
  wordsUsed: $("wordsUsed"),
  longestWords: $("longestWords"),
  ownerLabel: $("ownerLabel"),
  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
  tabPanels: Array.from(document.querySelectorAll(".tab-panel")),
};

const params = new URLSearchParams(location.search);
if (params.get("room")) ui.roomInput.value = params.get("room").toUpperCase();

ui.qrImage.addEventListener("error", () => {
  state.qrFailed = true;
  ui.qrImage.alt = "QR unavailable offline. Use the invite link instead.";
  ui.status.textContent = "Offline mode: QR could not load, but invite link still works.";
});

function setAuthError(msg) {
  ui.authError.textContent = msg || "";
}

function cleanWord(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
}

function currentPlayer() {
  return (state.room?.players || []).find((p) => p.id === state.playerId) || null;
}

function minLettersRequired() {
  return state.room?.settings?.minWordLength || 3;
}

function isAdjacent(a, b) {
  return Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1 && !(a.r === b.r && a.c === b.c);
}

function setActiveTab(name) {
  ui.tabButtons.forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
  ui.tabPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
}

function pathWord() {
  if (!state.room?.round?.grid) return "";
  return state.selectedPath.map((cell) => state.room.round.grid[cell.r][cell.c]).join("");
}

function renderPathPreview() {
  const text = pathWord();
  ui.pathPreview.textContent = text || "Tap or drag to build a word";
  ui.pathPreview.classList.toggle("empty", !text);
}

function clearPath() {
  state.selectedPath = [];
  renderPathPreview();
  renderSelectedTiles();
  renderPath();
}

function renderSelectedTiles() {
  const selected = new Set(state.selectedPath.map((cell) => `${cell.r},${cell.c}`));
  const next = new Set();
  const last = state.selectedPath[state.selectedPath.length - 1];

  if (last && state.room?.round?.grid) {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nr = last.r + dr;
        const nc = last.c + dc;
        if (nr < 0 || nc < 0 || nr >= state.room.round.grid.length || nc >= state.room.round.grid[0].length) continue;
        const key = `${nr},${nc}`;
        if (!selected.has(key)) next.add(key);
      }
    }
  }

  ui.board.querySelectorAll(".tile").forEach((tile) => {
    const key = `${tile.dataset.r},${tile.dataset.c}`;
    tile.classList.toggle("selected", selected.has(key));
    tile.classList.toggle("next", next.has(key));
  });
}

function renderPath() {
  const boardRect = ui.board.getBoundingClientRect();
  ui.pathSvg.setAttribute("viewBox", `0 0 ${boardRect.width} ${boardRect.height}`);
  ui.pathSvg.innerHTML = "";
  if (state.selectedPath.length < 2) return;

  for (let i = 0; i < state.selectedPath.length - 1; i += 1) {
    const a = ui.board.querySelector(`[data-r='${state.selectedPath[i].r}'][data-c='${state.selectedPath[i].c}']`);
    const b = ui.board.querySelector(`[data-r='${state.selectedPath[i + 1].r}'][data-c='${state.selectedPath[i + 1].c}']`);
    if (!a || !b) continue;
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const x1 = ar.left + ar.width / 2 - boardRect.left;
    const y1 = ar.top + ar.height / 2 - boardRect.top;
    const x2 = br.left + br.width / 2 - boardRect.left;
    const y2 = br.top + br.height / 2 - boardRect.top;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", "#46f0cf");
    line.setAttribute("stroke-width", "6");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("opacity", "0.9");
    ui.pathSvg.appendChild(line);
  }
}

function startPath(r, c) {
  state.selectedPath = [{ r, c }];
  renderPathPreview();
  renderSelectedTiles();
  renderPath();
}

function addToPath(r, c) {
  const next = { r, c };
  const last = state.selectedPath[state.selectedPath.length - 1];
  if (!last) {
    startPath(r, c);
    return true;
  }
  if (last.r === r && last.c === c) return false;
  if (state.selectedPath.some((cell) => cell.r === r && cell.c === c)) return false;
  if (!isAdjacent(last, next)) return false;
  state.selectedPath.push(next);
  renderPathPreview();
  renderSelectedTiles();
  renderPath();
  return true;
}

async function submitCurrentWord() {
  const word = cleanWord(pathWord());
  if (!word || word.length < minLettersRequired()) return;
  try {
    const res = await api("/api/submit-word", {
      roomId: state.roomId,
      playerId: state.playerId,
      token: state.token,
      word,
    });
    clearPath();
    ui.status.textContent = `+${res.points} points for ${word}`;
  } catch (err) {
    ui.status.textContent = err.message;
  }
}

async function api(path, payload) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function handleTilePointerDown(event, tile) {
  if (!state.room?.round?.active) return;
  event.preventDefault();
  state.pointerActive = true;
  state.pointerMoved = false;
  state.pointerSubmitTap = false;
  state.pointerId = event.pointerId;
  ui.boardWrap.setPointerCapture(event.pointerId);

  const r = Number(tile.dataset.r);
  const c = Number(tile.dataset.c);
  const last = state.selectedPath[state.selectedPath.length - 1];
  const currentWord = cleanWord(pathWord());

  if (last && last.r === r && last.c === c && currentWord.length >= minLettersRequired()) {
    state.pointerSubmitTap = true;
    return;
  }

  if (!last) {
    startPath(r, c);
    return;
  }

  if (state.selectedPath.some((cell) => cell.r === r && cell.c === c)) {
    return;
  }

  if (!isAdjacent(last, { r, c })) {
    startPath(r, c);
    return;
  }

  addToPath(r, c);
}

function renderBoard(grid) {
  if (!Array.isArray(grid) || !grid.length) {
    ui.board.innerHTML = "";
    ui.pathSvg.innerHTML = "";
    return;
  }

  ui.board.innerHTML = grid
    .map((row, r) => row.map((token, c) => `<button type="button" class="tile" data-r="${r}" data-c="${c}">${token}</button>`).join(""))
    .join("");

  ui.board.querySelectorAll(".tile").forEach((tile) => {
    tile.addEventListener("pointerdown", (event) => handleTilePointerDown(event, tile));
  });

  renderPathPreview();
  renderSelectedTiles();
  renderPath();
}

function renderPlayers(players) {
  ui.playersList.innerHTML = players.length
    ? players.map((player) => `<li>${player.name}${player.isHost ? " (Host)" : ""} | ${player.ready ? "Ready" : "Not Ready"}</li>`).join("")
    : "<li>No players yet</li>";
}

function renderLeaderboard(leaderboard) {
  ui.leaderboard.innerHTML = leaderboard.length
    ? leaderboard.map((player) => `<li>#${player.rank} ${player.name} <strong>${player.score}</strong></li>`).join("")
    : "<li>No players yet</li>";
}

function renderRoundWords(words) {
  ui.wordsUsed.innerHTML = words.length
    ? words.slice().reverse().map((word) => `<li>${word}</li>`).join("")
    : "<li>No words yet this round</li>";
}

function renderLongestWords(longestWords) {
  ui.longestWords.innerHTML = longestWords.length
    ? longestWords
        .map((entry) => `<li><strong>${entry.word}</strong><span class="list-sub"><em>${entry.playerName}</em> | round ${entry.round}</span></li>`)
        .join("")
    : "<li>No longest words recorded yet</li>";
}

function hydrateRoom(room) {
  const previousRound = state.room?.match?.currentRound;
  state.room = room;

  const me = currentPlayer();
  const matchOver = Boolean(room.match?.over);
  const roundActive = room.round.active;
  const minLetters = room.settings?.minWordLength || 3;
  const meReady = Boolean(me?.ready);

  ui.roomCode.textContent = room.roomId;
  ui.playerBadge.textContent = me?.name || "Player";
  ui.roundBadge.textContent = `${room.match.currentRound || room.match.completedRounds}/${room.match.totalRounds}`;
  ui.ownerLabel.textContent = room.app?.attribution || "attribution: elk-lab-jzion | v1.3.0";

  const link = `${location.origin}?room=${encodeURIComponent(room.roomId)}`;
  ui.inviteLink.value = link;
  if (!state.qrFailed) {
    ui.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;
  }

  ui.timerConfig.value = room.settings?.roundSeconds || 60;
  ui.maxPlayersConfig.value = room.settings?.maxPlayers || 8;
  ui.minWordConfig.value = room.settings?.minWordLength || 3;
  ui.totalRoundsConfig.value = room.settings?.totalRounds || 3;
  ui.timer.textContent = String(room.round.remaining || room.settings.roundSeconds || 0).padStart(2, "0");

  const roundChanged = previousRound !== undefined && previousRound !== room.match.currentRound;
  if (roundChanged || !roundActive) clearPath();

  renderBoard(room.round.grid);
  renderPlayers(room.players);
  renderLeaderboard(room.leaderboard);
  renderRoundWords(room.round.usedWords || []);
  renderLongestWords(room.longestWords || []);

  ui.startBtn.textContent = matchOver ? "Match Ended" : `Start Round ${room.match.completedRounds + 1}`;
  ui.startBtn.disabled =
    matchOver ||
    !state.host ||
    roundActive ||
    !room.readyGate?.membersReady ||
    room.players.length < (room.settings.minPlayers || 2);

  const settingsLocked = room.match.currentRound > 0 || roundActive;
  ui.timerConfig.disabled = !state.host || settingsLocked;
  ui.maxPlayersConfig.disabled = !state.host || settingsLocked;
  ui.minWordConfig.disabled = !state.host || settingsLocked;
  ui.totalRoundsConfig.disabled = !state.host || settingsLocked;
  ui.saveSettingsBtn.disabled = !state.host || settingsLocked;

  ui.readyBtn.disabled = state.host || roundActive || matchOver;
  ui.readyBtn.textContent = meReady ? "Unready" : "Ready";
  ui.clearPathBtn.disabled = !roundActive && state.selectedPath.length === 0;

  if (matchOver) {
    ui.status.textContent = "Match over. Final leaderboard is locked.";
  } else if (roundActive) {
    ui.status.textContent = `Round live. Adjacent path only. Min ${minLetters} letters.`;
  } else if (state.host) {
    const ready = room.readyGate?.membersReady;
    const needPlayers = room.players.length < (room.settings.minPlayers || 2);
    if (needPlayers) {
      ui.status.textContent = `Need at least ${room.settings.minPlayers} players before starting.`;
    } else if (!ready) {
      ui.status.textContent = "Waiting for all non-host players to click Ready.";
    } else {
      ui.status.textContent = `All ready. Start round ${room.match.completedRounds + 1}/${room.settings.totalRounds}.`;
    }
  } else {
    ui.status.textContent = meReady
      ? `You are ready. Waiting for host (round ${room.match.completedRounds + 1}/${room.settings.totalRounds}).`
      : `Click Ready (round ${room.match.completedRounds + 1}/${room.settings.totalRounds}).`;
  }
}

function openGame() {
  ui.authCard.classList.add("hidden");
  ui.gameCard.classList.remove("hidden");
}

function connectEvents() {
  if (state.source) state.source.close();
  state.source = new EventSource(`/api/events?roomId=${encodeURIComponent(state.roomId)}`);
  state.source.addEventListener("state", (event) => {
    hydrateRoom(JSON.parse(event.data));
  });
}

async function createRoom() {
  const name = ui.nameInput.value.trim();
  if (!name) return setAuthError("Please enter your name");
  setAuthError("");
  const res = await api("/api/create-room", { name });
  state.roomId = res.roomId;
  state.playerId = res.playerId;
  state.token = res.token;
  state.host = true;
  openGame();
  hydrateRoom(res.state);
  connectEvents();
}

async function joinRoom() {
  const name = ui.nameInput.value.trim();
  const roomId = ui.roomInput.value.trim().toUpperCase();
  if (!name || !roomId) return setAuthError("Name and room code are required");
  setAuthError("");
  const res = await api("/api/join-room", { name, roomId });
  state.roomId = res.roomId;
  state.playerId = res.playerId;
  state.token = res.token;
  state.host = false;
  openGame();
  hydrateRoom(res.state);
  connectEvents();
}

async function saveSettings() {
  await api("/api/update-settings", {
    roomId: state.roomId,
    playerId: state.playerId,
    token: state.token,
    roundSeconds: ui.timerConfig.value,
    maxPlayers: ui.maxPlayersConfig.value,
    minWordLength: ui.minWordConfig.value,
    totalRounds: ui.totalRoundsConfig.value,
  });
  ui.status.textContent = "Settings saved.";
}

async function setReady(ready) {
  await api("/api/set-ready", {
    roomId: state.roomId,
    playerId: state.playerId,
    token: state.token,
    ready,
  });
}

async function startRound() {
  clearPath();
  await api("/api/start-round", {
    roomId: state.roomId,
    playerId: state.playerId,
    token: state.token,
  });
}

async function finishPointerTrace() {
  if (!state.pointerActive) return;
  const shouldAutoSubmit =
    (state.pointerMoved || state.pointerSubmitTap) && cleanWord(pathWord()).length >= minLettersRequired();
  state.pointerActive = false;
  state.pointerMoved = false;
  state.pointerSubmitTap = false;
  state.pointerId = null;
  if (shouldAutoSubmit) await submitCurrentWord();
}

ui.boardWrap.addEventListener("pointermove", (event) => {
  if (!state.pointerActive || event.pointerId !== state.pointerId || !state.room?.round?.active) return;
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const tile = target?.closest?.(".tile");
  if (!tile || !ui.board.contains(tile)) return;
  const changed = addToPath(Number(tile.dataset.r), Number(tile.dataset.c));
  if (changed) state.pointerMoved = true;
});

ui.boardWrap.addEventListener("pointerup", (event) => {
  if (state.pointerId !== null && ui.boardWrap.hasPointerCapture?.(event.pointerId)) {
    ui.boardWrap.releasePointerCapture(event.pointerId);
  }
  finishPointerTrace().catch((err) => {
    ui.status.textContent = err.message;
  });
});

ui.boardWrap.addEventListener("pointercancel", () => {
  state.pointerActive = false;
  state.pointerMoved = false;
  state.pointerSubmitTap = false;
  state.pointerId = null;
});

ui.createBtn.addEventListener("click", () => createRoom().catch((err) => setAuthError(err.message)));
ui.joinBtn.addEventListener("click", () => joinRoom().catch((err) => setAuthError(err.message)));
ui.saveSettingsBtn.addEventListener("click", () => saveSettings().catch((err) => { ui.status.textContent = err.message; }));
ui.readyBtn.addEventListener("click", () => setReady(!Boolean(currentPlayer()?.ready)).catch((err) => { ui.status.textContent = err.message; }));
ui.startBtn.addEventListener("click", () => startRound().catch((err) => { ui.status.textContent = err.message; }));
ui.clearPathBtn.addEventListener("click", clearPath);
ui.rotateBtn.addEventListener("click", () => {
  state.boardRotation = (state.boardRotation + 1) % 4;
  ui.boardWrap.className = `board-wrap rotate-${state.boardRotation}`;
  requestAnimationFrame(renderPath);
});
ui.mechanicsBtn.addEventListener("click", () => ui.mechanicsDialog.showModal());
ui.tabButtons.forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.tab)));

window.addEventListener("resize", () => renderPath());

ui.copyLinkBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(ui.inviteLink.value);
    ui.status.textContent = "Invite link copied";
  } catch {
    ui.status.textContent = "Copy failed";
  }
});

ui.shareBtn.addEventListener("click", async () => {
  const url = ui.inviteLink.value;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Join my Word Factory room", url });
    } else {
      await navigator.clipboard.writeText(url);
    }
    ui.status.textContent = "Invite sent";
  } catch {
    ui.status.textContent = "Share cancelled";
  }
});
