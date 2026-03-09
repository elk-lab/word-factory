const $ = (id) => document.getElementById(id);

const state = {
  roomId: "",
  playerId: "",
  token: "",
  host: false,
  room: null,
  source: null,
  qrFailed: false,
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
  inviteLink: $("inviteLink"),
  copyLinkBtn: $("copyLinkBtn"),
  shareBtn: $("shareBtn"),
  qrImage: $("qrImage"),
  timer: $("timer"),
  timerConfig: $("timerConfig"),
  maxPlayersConfig: $("maxPlayersConfig"),
  minWordConfig: $("minWordConfig"),
  saveSettingsBtn: $("saveSettingsBtn"),
  readyBtn: $("readyBtn"),
  board: $("board"),
  wordForm: $("wordForm"),
  wordInput: $("wordInput"),
  submitWordBtn: $("submitWordBtn"),
  startBtn: $("startBtn"),
  status: $("status"),
  playersList: $("playersList"),
  leaderboard: $("leaderboard"),
  wordsUsed: $("wordsUsed"),
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
    return;
  }
  ui.board.innerHTML = grid
    .flat()
    .map((ch) => `<div class="tile">${ch}</div>`)
    .join("");
}

function hydrateRoom(room) {
  state.room = room;
  ui.roomCode.textContent = room.roomId;

  const link = `${location.origin}?room=${encodeURIComponent(room.roomId)}`;
  ui.inviteLink.value = link;
  if (!state.qrFailed) {
    ui.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;
  }

  ui.timerConfig.value = room.settings?.roundSeconds || 60;
  ui.maxPlayersConfig.value = room.settings?.maxPlayers || 8;
  ui.minWordConfig.value = room.settings?.minWordLength || 3;

  ui.timer.textContent = String(room.round.remaining || room.settings.roundSeconds || 0).padStart(2, "0");
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
    : "<li>No words yet</li>";

  const roundActive = room.round.active;
  const me = currentPlayer();
  const meReady = Boolean(me?.ready);
  const minLetters = room.settings?.minWordLength || 3;

  ui.startBtn.textContent = `Start ${room.settings.roundSeconds}s Round`;
  ui.startBtn.disabled =
    !state.host ||
    roundActive ||
    !room.readyGate?.membersReady ||
    room.players.length < (room.settings.minPlayers || 2);

  ui.submitWordBtn.disabled = !roundActive;
  ui.wordInput.disabled = !roundActive;

  ui.timerConfig.disabled = !state.host || roundActive;
  ui.maxPlayersConfig.disabled = !state.host || roundActive;
  ui.minWordConfig.disabled = !state.host || roundActive;
  ui.saveSettingsBtn.disabled = !state.host || roundActive;

  ui.readyBtn.disabled = state.host || roundActive;
  ui.readyBtn.textContent = meReady ? "Unready" : "Ready";

  if (roundActive) {
    ui.status.textContent = `Round live. Use adjacent tiles only. Min word length: ${minLetters}.`;
  } else if (state.host) {
    const ready = room.readyGate?.membersReady;
    const needPlayers = room.players.length < (room.settings.minPlayers || 2);
    if (needPlayers) {
      ui.status.textContent = `Need at least ${room.settings.minPlayers} players before starting.`;
    } else if (!ready) {
      ui.status.textContent = "Waiting for all non-host players to click Ready.";
    } else {
      ui.status.textContent = `All players ready. You can start (min ${minLetters} letters).`;
    }
  } else {
    ui.status.textContent = meReady
      ? `You are ready. Waiting for host to start (min ${minLetters} letters).`
      : `Click Ready when you are ready (min ${minLetters} letters).`;
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
  await api("/api/start-round", {
    roomId: state.roomId,
    playerId: state.playerId,
    token: state.token,
  });
}

async function submitWord(event) {
  event.preventDefault();
  const word = ui.wordInput.value.trim();
  if (!word) return;
  try {
    const res = await api("/api/submit-word", {
      roomId: state.roomId,
      playerId: state.playerId,
      token: state.token,
      word,
    });
    ui.wordInput.value = "";
    ui.status.textContent = `+${res.points} points for ${word.toUpperCase()}`;
  } catch (err) {
    ui.status.textContent = err.message;
  }
}

ui.createBtn.addEventListener("click", () => {
  createRoom().catch((err) => setAuthError(err.message));
});

ui.joinBtn.addEventListener("click", () => {
  joinRoom().catch((err) => setAuthError(err.message));
});

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
