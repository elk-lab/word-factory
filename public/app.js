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
  touchActive: false,
  touchMoved: false,
  roundFocusToken: "",
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
  boardColumn: $("boardColumn"),
  boardWrap: $("boardWrap"),
  pathSvg: $("pathSvg"),
  board: $("board"),
  pathPreview: $("pathPreview"),
  submitPathBtn: $("submitPathBtn"),
  clearPathBtn: $("clearPathBtn"),
  startBtn: $("startBtn"),
  status: $("status"),
  playersList: $("playersList"),
  leaderboard: $("leaderboard"),
  wordsUsed: $("wordsUsed"),
  longestWords: $("longestWords"),
  ownerLabel: $("ownerLabel"),
  toastStack: $("toastStack"),
  countdownOverlay: $("countdownOverlay"),
  countdownValue: $("countdownValue"),
  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
  tabPanels: Array.from(document.querySelectorAll(".tab-panel")),
};

const params = new URLSearchParams(location.search);
if (params.get("room")) ui.roomInput.value = params.get("room").toUpperCase();

function setAuthError(msg) {
  ui.authError.textContent = msg || "";
}

function showToast(message, type = "info") {
  if (!ui.toastStack || !message) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  ui.toastStack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 180);
  }, 2400);
}

function notify(message, type = "info") {
  ui.status.textContent = message;
  showToast(message, type);
}

ui.qrImage.addEventListener("error", () => {
  state.qrFailed = true;
  ui.qrImage.alt = "QR unavailable offline. Use the invite link instead.";
  notify("Offline mode: QR could not load, but invite link still works.", "warning");
});

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

function isTouchMode() {
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

function setActiveTab(name) {
  ui.tabButtons.forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
  ui.tabPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
}

function pathWord() {
  if (!state.room?.round?.grid) return "";
  return state.selectedPath.map((cell) => state.room.round.grid[cell.r][cell.c]).join("");
}

function isMobileView() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function focusBoardForRound(force = false) {
  if (!isMobileView() || !ui.boardColumn) return;
  const phase = state.room?.round?.phase;
  if (!force && phase !== "countdown" && phase !== "active") return;

  const token = `${state.room?.match?.currentRound || 0}:${phase}`;
  if (!force && state.roundFocusToken === token) return;
  state.roundFocusToken = token;

  requestAnimationFrame(() => {
    ui.boardColumn.scrollIntoView({ behavior: force ? "auto" : "smooth", block: "center", inline: "nearest" });
    const topOffset = Math.max(24, Math.round(window.innerHeight * 0.14));
    const top = window.scrollY + ui.boardColumn.getBoundingClientRect().top - topOffset;
    window.scrollTo({ top: Math.max(0, top), behavior: force ? "auto" : "smooth" });
  });
}

function renderCountdownOverlay(round) {
  const countdownRemaining = round?.countdownRemaining || 0;
  const show = round?.phase === "countdown" && countdownRemaining > 0;
  ui.countdownOverlay.classList.toggle("visible", show);
  ui.countdownOverlay.setAttribute("aria-hidden", show ? "false" : "true");
  ui.countdownValue.textContent = show ? String(countdownRemaining) : "";
}

function renderPathPreview() {
  const text = pathWord();
  ui.pathPreview.textContent = text || "No active path";
  ui.pathPreview.classList.toggle("empty", !text);
}

function updatePathButtons(roundActive) {
  const hasPath = state.selectedPath.length > 0;
  const canSubmit = hasPath && cleanWord(pathWord()).length >= minLettersRequired() && roundActive;
  ui.submitPathBtn.disabled = !canSubmit;
  ui.clearPathBtn.disabled = !hasPath;
}

function clearPath() {
  state.selectedPath = [];
  state.pointerSubmitTap = false;
  renderPathPreview();
  renderSelectedTiles();
  renderPath();
  updatePathButtons(Boolean(state.room?.round?.phase === "active"));
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
  const boardWidth = ui.board.clientWidth;
  const boardHeight = ui.board.clientHeight;
  ui.pathSvg.setAttribute("viewBox", `0 0 ${boardWidth} ${boardHeight}`);
  ui.pathSvg.innerHTML = "";
  if (state.selectedPath.length < 2) return;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "pathArrowHead");
  marker.setAttribute("markerWidth", "8");
  marker.setAttribute("markerHeight", "8");
  marker.setAttribute("refX", "6.2");
  marker.setAttribute("refY", "4");
  marker.setAttribute("orient", "auto");
  marker.setAttribute("markerUnits", "userSpaceOnUse");
  const arrowHead = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrowHead.setAttribute("d", "M0,0 L8,4 L0,8 Z");
  arrowHead.setAttribute("fill", "#46f0cf");
  arrowHead.setAttribute("opacity", "0.96");
  marker.appendChild(arrowHead);
  defs.appendChild(marker);
  ui.pathSvg.appendChild(defs);

  for (let i = 0; i < state.selectedPath.length - 1; i += 1) {
    const a = ui.board.querySelector(`[data-r='${state.selectedPath[i].r}'][data-c='${state.selectedPath[i].c}']`);
    const b = ui.board.querySelector(`[data-r='${state.selectedPath[i + 1].r}'][data-c='${state.selectedPath[i + 1].c}']`);
    if (!a || !b) continue;
    const ax = a.offsetLeft + a.offsetWidth / 2;
    const ay = a.offsetTop + a.offsetHeight / 2;
    const bx = b.offsetLeft + b.offsetWidth / 2;
    const by = b.offsetTop + b.offsetHeight / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const distance = Math.hypot(dx, dy);
    if (!distance) continue;
    const startInset = Math.min(a.offsetWidth, a.offsetHeight) * 0.24;
    const endInset = Math.min(b.offsetWidth, b.offsetHeight) * 0.34;
    const x1 = ax + (dx / distance) * startInset;
    const y1 = ay + (dy / distance) * startInset;
    const x2 = bx - (dx / distance) * endInset;
    const y2 = by - (dy / distance) * endInset;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", "#46f0cf");
    line.setAttribute("stroke-width", "5");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("opacity", "0.9");
    line.setAttribute("marker-end", "url(#pathArrowHead)");
    ui.pathSvg.appendChild(line);
  }
}

function startPath(r, c) {
  state.selectedPath = [{ r, c }];
  renderPathPreview();
  renderSelectedTiles();
  renderPath();
  updatePathButtons(Boolean(state.room?.round?.phase === "active"));
}

function trimPathTo(index) {
  if (index <= 0) {
    clearPath();
    return true;
  }
  state.selectedPath = state.selectedPath.slice(0, index + 1);
  renderPathPreview();
  renderSelectedTiles();
  renderPath();
  updatePathButtons(Boolean(state.room?.round?.phase === "active"));
  return true;
}

function addToPath(r, c) {
  const next = { r, c };
  const last = state.selectedPath[state.selectedPath.length - 1];
  if (!last) {
    startPath(r, c);
    return true;
  }
  const existingIndex = state.selectedPath.findIndex((cell) => cell.r === r && cell.c === c);
  if (existingIndex === state.selectedPath.length - 1) return false;
  if (existingIndex >= 0) return trimPathTo(existingIndex);
  if (!isAdjacent(last, next)) return false;
  state.selectedPath.push(next);
  renderPathPreview();
  renderSelectedTiles();
  renderPath();
  updatePathButtons(Boolean(state.room?.round?.phase === "active"));
  return true;
}

function humanizeSubmitError(message) {
  if (message === "Word already found this round") return { text: "Word already found", type: "warning" };
  if (message === "Invalid word" || message === "Not a valid US English word") return { text: "Invalid word", type: "error" };
  return { text: message, type: "error" };
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
    notify(`+${res.points} points for ${word}`, "success");
  } catch (err) {
    const alert = humanizeSubmitError(err.message);
    notify(alert.text, alert.type);
  }
}

async function api(path, payload) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    cache: "no-store",
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function applyTileSelection(tile, allowTapSubmit = true) {
  if (!tile || state.room?.round?.phase !== "active") return false;
  const r = Number(tile.dataset.r);
  const c = Number(tile.dataset.c);
  const last = state.selectedPath[state.selectedPath.length - 1];
  const currentWord = cleanWord(pathWord());

  if (allowTapSubmit && last && last.r === r && last.c === c && currentWord.length >= minLettersRequired()) {
    state.pointerSubmitTap = true;
    return true;
  }

  if (!last) {
    startPath(r, c);
    return true;
  }

  const existingIndex = state.selectedPath.findIndex((cell) => cell.r === r && cell.c === c);
  if (existingIndex === 0) {
    clearPath();
    return true;
  }
  if (existingIndex >= 0) {
    return trimPathTo(existingIndex);
  }
  if (!isAdjacent(last, { r, c })) {
    return false;
  }
  return addToPath(r, c);
}

function getTileFromPoint(clientX, clientY) {
  for (const tile of ui.board.querySelectorAll(".tile")) {
    const rect = tile.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return tile;
    }
  }
  return null;
}

function handleTilePointerDown(event, tile) {
  if (isTouchMode() || state.room?.round?.phase !== "active") return;
  event.preventDefault();
  state.pointerActive = true;
  state.pointerMoved = false;
  state.pointerSubmitTap = false;
  state.pointerId = event.pointerId;
  if (ui.boardWrap.setPointerCapture) ui.boardWrap.setPointerCapture(event.pointerId);
  applyTileSelection(tile, true);
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
  updatePathButtons(Boolean(state.room?.round?.phase === "active"));
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
  const previousPhase = state.room?.round?.phase;
  state.room = room;

  const me = currentPlayer();
  const matchOver = Boolean(room.match?.over);
  const roundPhase = room.round.phase || (room.round.active ? "active" : "idle");
  const roundLive = roundPhase === "active";
  const roundStaging = roundPhase === "active" || roundPhase === "countdown";
  const minLetters = room.settings?.minWordLength || 3;
  const meReady = Boolean(me?.ready);

  document.body.classList.toggle("round-active", roundLive);
  document.body.classList.toggle("round-staging", roundStaging);

  ui.roomCode.textContent = room.roomId;
  ui.playerBadge.textContent = me?.name || "Player";
  ui.roundBadge.textContent = `${room.match.currentRound || room.match.completedRounds}/${room.match.totalRounds}`;
  ui.ownerLabel.textContent = room.app?.attribution || "attribution: elk-lab-jzion | v1.4.4";

  const link = `${location.origin}?room=${encodeURIComponent(room.roomId)}`;
  ui.inviteLink.value = link;
  if (!state.qrFailed) {
    ui.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;
  }

  ui.timerConfig.value = room.settings?.roundSeconds || 60;
  ui.maxPlayersConfig.value = room.settings?.maxPlayers || 8;
  ui.minWordConfig.value = room.settings?.minWordLength || 3;
  ui.totalRoundsConfig.value = room.settings?.totalRounds || 3;

  const timerValue = roundPhase === "countdown"
    ? room.round.countdownRemaining || 0
    : room.round.remaining || room.settings.roundSeconds || 0;
  ui.timer.textContent = String(timerValue).padStart(2, "0");

  const roundChanged = previousRound !== undefined && previousRound !== room.match.currentRound;
  const phaseChanged = previousPhase && previousPhase !== roundPhase;
  if (roundChanged || !roundStaging) clearPath();

  renderBoard(room.round.grid);
  renderPlayers(room.players);
  renderLeaderboard(room.leaderboard);
  renderRoundWords(room.round.usedWords || []);
  renderLongestWords(room.longestWords || []);
  renderCountdownOverlay(room.round);

  ui.startBtn.textContent = matchOver
    ? "Match Ended"
    : roundPhase === "countdown"
      ? "Starting..."
      : `Start Round ${room.match.completedRounds + 1}`;
  ui.startBtn.disabled =
    matchOver ||
    !state.host ||
    roundStaging ||
    !room.readyGate?.membersReady ||
    room.players.length < (room.settings.minPlayers || 2);

  const settingsLocked = room.match.currentRound > 0 || roundStaging;
  ui.timerConfig.disabled = !state.host || settingsLocked;
  ui.maxPlayersConfig.disabled = !state.host || settingsLocked;
  ui.minWordConfig.disabled = !state.host || settingsLocked;
  ui.totalRoundsConfig.disabled = !state.host || settingsLocked;
  ui.saveSettingsBtn.disabled = !state.host || settingsLocked;

  ui.readyBtn.disabled = state.host || roundStaging || matchOver;
  ui.readyBtn.textContent = meReady ? "Unready" : "Ready";
  updatePathButtons(roundLive);

  if (matchOver) {
    ui.status.textContent = "Match over. Final leaderboard is locked.";
  } else if (roundPhase === "countdown") {
    ui.status.textContent = `Round starts in ${room.round.countdownRemaining || 0}. Get ready.`;
  } else if (roundLive) {
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

  if ((roundChanged && roundStaging) || (phaseChanged && roundStaging)) {
    focusBoardForRound();
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
  notify("Settings saved.", "success");
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
  const shouldAutoSubmit = cleanWord(pathWord()).length >= minLettersRequired() && (state.pointerMoved || state.pointerSubmitTap);
  state.pointerActive = false;
  state.pointerMoved = false;
  state.pointerSubmitTap = false;
  state.pointerId = null;
  if (shouldAutoSubmit) {
    await submitCurrentWord();
    return;
  }
  clearPath();
}

function handlePointerMove(event) {
  if (isTouchMode() || !state.pointerActive || event.pointerId !== state.pointerId || state.room?.round?.phase !== "active") return;
  const tile = getTileFromPoint(event.clientX, event.clientY);
  if (!tile) return;
  const changed = applyTileSelection(tile, true);
  if (changed) state.pointerMoved = true;
}

function handlePointerRelease(event) {
  if (isTouchMode() || state.pointerId === null || event.pointerId !== state.pointerId) return;
  if (ui.boardWrap.hasPointerCapture?.(event.pointerId)) {
    ui.boardWrap.releasePointerCapture(event.pointerId);
  }
  finishPointerTrace().catch((err) => {
    notify(err.message, "error");
  });
}

function handlePointerCancel(event) {
  if (isTouchMode()) return;
  if (state.pointerId !== null && event.pointerId !== state.pointerId) return;
  state.pointerActive = false;
  state.pointerMoved = false;
  state.pointerSubmitTap = false;
  state.pointerId = null;
  clearPath();
}

function handleTouchStart(event) {
  if (!isTouchMode() || state.room?.round?.phase !== "active") return;
  const touch = event.touches[0] || event.changedTouches[0];
  if (!touch) return;
  const tile = getTileFromPoint(touch.clientX, touch.clientY);
  if (!tile) return;
  event.preventDefault();
  state.touchActive = true;
  state.touchMoved = false;
  state.pointerSubmitTap = false;
  applyTileSelection(tile, false);
}

function handleTouchMove(event) {
  if (!isTouchMode() || !state.touchActive || state.room?.round?.phase !== "active") return;
  const touch = event.touches[0];
  if (!touch) return;
  event.preventDefault();
  const tile = getTileFromPoint(touch.clientX, touch.clientY);
  if (!tile) return;
  const changed = applyTileSelection(tile, false);
  if (changed) state.touchMoved = true;
}

function handleTouchEnd(event) {
  if (!isTouchMode() || !state.touchActive) return;
  event.preventDefault();
  const shouldAutoSubmit = cleanWord(pathWord()).length >= minLettersRequired() && (state.touchMoved || state.pointerSubmitTap);
  state.touchActive = false;
  state.touchMoved = false;
  state.pointerSubmitTap = false;
  if (shouldAutoSubmit) {
    submitCurrentWord().catch((err) => {
      notify(err.message, "error");
    });
    return;
  }
  clearPath();
}

function handleTouchCancel() {
  if (!isTouchMode()) return;
  state.touchActive = false;
  state.touchMoved = false;
  state.pointerSubmitTap = false;
  clearPath();
}

ui.boardWrap.addEventListener("pointermove", handlePointerMove, { passive: false });
ui.boardWrap.addEventListener("pointerup", handlePointerRelease);
ui.boardWrap.addEventListener("lostpointercapture", handlePointerRelease);
ui.boardWrap.addEventListener("touchstart", handleTouchStart, { passive: false });
window.addEventListener("touchmove", handleTouchMove, { passive: false });
window.addEventListener("touchend", handleTouchEnd, { passive: false, capture: true });
window.addEventListener("touchcancel", handleTouchCancel, { passive: false, capture: true });
window.addEventListener("pointermove", handlePointerMove, { passive: false });
window.addEventListener("pointerup", handlePointerRelease, true);
window.addEventListener("pointercancel", handlePointerCancel, true);

ui.createBtn.addEventListener("click", () => createRoom().catch((err) => setAuthError(err.message)));
ui.joinBtn.addEventListener("click", () => joinRoom().catch((err) => setAuthError(err.message)));
ui.saveSettingsBtn.addEventListener("click", () => saveSettings().catch((err) => { notify(err.message, "error"); }));
ui.readyBtn.addEventListener("click", () => setReady(!Boolean(currentPlayer()?.ready)).catch((err) => { notify(err.message, "error"); }));
ui.startBtn.addEventListener("click", () => startRound().catch((err) => { notify(err.message, "error"); }));
ui.submitPathBtn.addEventListener("click", () => submitCurrentWord().catch((err) => { notify(err.message, "error"); }));
ui.clearPathBtn.addEventListener("click", clearPath);
ui.rotateBtn.addEventListener("click", () => {
  state.boardRotation = (state.boardRotation + 1) % 4;
  ui.boardWrap.className = `board-wrap rotate-${state.boardRotation}`;
  requestAnimationFrame(renderPath);
});
ui.mechanicsBtn.addEventListener("click", () => ui.mechanicsDialog.showModal());
ui.tabButtons.forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.tab)));

window.addEventListener("resize", () => {
  renderPath();
  if (state.room?.round?.phase === "countdown" || state.room?.round?.phase === "active") {
    focusBoardForRound(true);
  }
});

ui.copyLinkBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(ui.inviteLink.value);
    notify("Invite link copied", "success");
  } catch {
    notify("Copy failed", "error");
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
    notify("Invite sent", "success");
  } catch {
    notify("Share cancelled", "warning");
  }
});
