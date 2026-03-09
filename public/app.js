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
  mechanicsBtn: $("mechanicsBtn"),
  mechanicsDialog: $("mechanicsDialog"),
  boardWrap: $("boardWrap"),
  pathSvg: $("pathSvg"),
  board: $("board"),
  wordForm: $("wordForm"),
  wordInput: $("wordInput"),
  clearPathBtn: $("clearPathBtn"),
  submitWordBtn: $("submitWordBtn"),
  startBtn: $("startBtn"),
  status: $("status"),
  playersList: $("playersList"),
  leaderboard: $("leaderboard"),
  wordsUsed: $("wordsUsed"),
  ownerLabel: $("ownerLabel"),
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

function currentPlayer() {
  return (state.room?.players || []).find((p) => p.id === state.playerId) || null;
}

function isAdjacent(a, b) {
  return Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1 && !(a.r === b.r && a.c === b.c);
}

function clearPath() {
  state.selectedPath = [];
  ui.wordInput.value = "";
  renderPath();
  renderSelectedTiles();
}

function pathWord() {
  if (!state.room?.round?.grid) return "";
  return state.selectedPath.map((cell) => state.room.round.grid[cell.r][cell.c]).join("");
}

function renderPath() {
  const boardRect = ui.board.getBoundingClientRect();
  ui.pathSvg.setAttribute("viewBox", `0 0 ${boardRect.width} ${boardRect.height}`);
  ui.pathSvg.innerHTML = "";
  if (state.selectedPath.length < 2) return;

  for (let i = 0; i < state.selectedPath.length - 1; i += 1) {
    const a = document.querySelector(`[data-r='${state.selectedPath[i].r}'][data-c='${state.selectedPath[i].c}']`);
    const b = document.querySelector(`[data-r='${state.selectedPath[i + 1].r}'][data-c='${state.selectedPath[i + 1].c}']`);
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

function renderSelectedTiles() {
  const selected = new Set(state.selectedPath.map((p) => `${p.r},${p.c}`));
  ui.board.querySelectorAll(".tile").forEach((tile) => {
    const key = `${tile.dataset.r},${tile.dataset.c}`;
    tile.classList.toggle("selected", selected.has(key));
  });
}

function selectTile(r, c) {
  if (!state.room?.round?.active) return;
  const next = { r, c };
  const prev = state.selectedPath[state.selectedPath.length - 1];
  const idx = state.selectedPath.findIndex((p) => p.r === r && p.c === c);

  if (idx >= 0) {
    const isLast = idx === state.selectedPath.length - 1;
    if (isLast) {
      state.selectedPath.pop();
    } else {
      return;
    }
  } else if (!prev || isAdjacent(prev, next)) {
    state.selectedPath.push(next);
  } else {
    return;
  }

  ui.wordInput.value = pathWord();
  renderSelectedTiles();
  renderPath();
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

function renderBoard(grid) {
  if (!Array.isArray(grid) || !grid.length) {
    ui.board.innerHTML = "";
    ui.pathSvg.innerHTML = "";
    return;
  }
  ui.board.innerHTML = grid
    .map((row, r) => row.map((token, c) => `<button type='button' class='tile' data-r='${r}' data-c='${c}'>${token}</button>`).join(""))
    .join("");

  ui.board.querySelectorAll(".tile").forEach((tile) => {
    tile.addEventListener("click", () => selectTile(Number(tile.dataset.r), Number(tile.dataset.c)));
  });

  renderSelectedTiles();
  renderPath();
}

function hydrateRoom(room) {
  const previousRound = state.room?.match?.currentRound;
  state.room = room;
  ui.roomCode.textContent = room.roomId;
  ui.roundBadge.textContent = `${room.match.currentRound || room.match.completedRounds}/${room.match.totalRounds}`;

  ui.ownerLabel.textContent = room.app?.attribution || "attribution: elk-lab-jzion | v1.2.0";

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
  if (roundChanged || !room.round.active) clearPath();
  renderBoard(room.round.grid);

  ui.playersList.innerHTML = room.players.length
    ? room.players
        .map((p) => `<li>${p.name}${p.isHost ? " (Host)" : ""} | ${p.ready ? "Ready" : "Not Ready"}</li>`)
        .join("")
    : "<li>No players yet</li>";

  ui.leaderboard.innerHTML = room.leaderboard.length
    ? room.leaderboard.map((p) => `<li>#${p.rank} ${p.name} <strong>${p.score}</strong></li>`).join("")
    : "<li>No players yet</li>";

  const words = room.round.usedWords || [];
  ui.wordsUsed.innerHTML = words.length
    ? words.slice().reverse().map((w) => `<li>${w}</li>`).join("")
    : "<li>No words yet this round</li>";

  const roundActive = room.round.active;
  const me = currentPlayer();
  const meReady = Boolean(me?.ready);
  const minLetters = room.settings?.minWordLength || 3;
  const matchOver = Boolean(room.match?.over);

  ui.startBtn.textContent = matchOver ? "Match Ended" : `Start Round ${room.match.completedRounds + 1}`;
  ui.startBtn.disabled =
    matchOver ||
    !state.host ||
    roundActive ||
    !room.readyGate?.membersReady ||
    room.players.length < (room.settings.minPlayers || 2);

  ui.submitWordBtn.disabled = !roundActive;
  ui.wordInput.disabled = !roundActive;
  ui.clearPathBtn.disabled = !roundActive;

  const settingsLocked = room.match.currentRound > 0 || roundActive;
  ui.timerConfig.disabled = !state.host || settingsLocked;
  ui.maxPlayersConfig.disabled = !state.host || settingsLocked;
  ui.minWordConfig.disabled = !state.host || settingsLocked;
  ui.totalRoundsConfig.disabled = !state.host || settingsLocked;
  ui.saveSettingsBtn.disabled = !state.host || settingsLocked;

  ui.readyBtn.disabled = state.host || roundActive || matchOver;
  ui.readyBtn.textContent = meReady ? "Unready" : "Ready";

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
    const data = JSON.parse(event.data);
    hydrateRoom(data);
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

async function submitWord(event) {
  event.preventDefault();
  const word = cleanWord(ui.wordInput.value);
  if (!word) return;
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

function cleanWord(v) {
  return String(v || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
}

ui.createBtn.addEventListener("click", () => createRoom().catch((err) => setAuthError(err.message)));
ui.joinBtn.addEventListener("click", () => joinRoom().catch((err) => setAuthError(err.message)));

ui.saveSettingsBtn.addEventListener("click", () => {
  saveSettings().catch((err) => {
    ui.status.textContent = err.message;
  });
});

ui.readyBtn.addEventListener("click", () => {
  const me = currentPlayer();
  const next = !Boolean(me?.ready);
  setReady(next).catch((err) => {
    ui.status.textContent = err.message;
  });
});

ui.startBtn.addEventListener("click", () => {
  startRound().catch((err) => {
    ui.status.textContent = err.message;
  });
});

ui.wordForm.addEventListener("submit", submitWord);
ui.clearPathBtn.addEventListener("click", clearPath);
ui.mechanicsBtn.addEventListener("click", () => ui.mechanicsDialog.showModal());

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


