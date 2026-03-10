const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, ".env"));

const APP_VERSION = "1.4.0";
const APP_ATTRIBUTION = `attribution: elk-lab-jzion | v${APP_VERSION}`;
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DICT_FILE = path.join(__dirname, "data", "words_en_us.txt");
const GRID_SIZE = 5;
const DEFAULT_ROUND_SECONDS = 60;
const DEFAULT_MAX_PLAYERS = 8;
const DEFAULT_MIN_WORD_LENGTH = 3;
const DEFAULT_TOTAL_ROUNDS = 3;
const MIN_PLAYERS = 2;
const MIN_ROUND_SECONDS = 15;
const MAX_ROUND_SECONDS = 300;
const MIN_MAX_PLAYERS = 2;
const MAX_MAX_PLAYERS = 20;
const MIN_MIN_WORD_LENGTH = 2;
const MAX_MIN_WORD_LENGTH = 10;
const MIN_TOTAL_ROUNDS = 1;
const MAX_TOTAL_ROUNDS = 20;
const LETTER_BAG = "EEEEEEEEEEEEAAAAAAAIIIIIIIOOOOOONNNNNNRRRRRRTTTTTLLLLSSSSUUUUDDDDGGGBBCCMMPPFFHHVVWWYYKJXZ";
const WEBSTER_API_KEY = process.env.WEBSTER_API_KEY || "";
const WEBSTER_TIMEOUT_MS = 1500;

const rooms = new Map();
const clients = new Map();
const dictionary = loadDictionary(DICT_FILE);
const websterCache = new Map();
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 240;

function loadDictionary(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const words = text
      .split(/\r?\n/)
      .map((line) => line.trim().toUpperCase())
      .filter((line) => line && !line.startsWith("#"));
    return new Set(words);
  } catch {
    return new Set();
  }
}

function id(size = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < size; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function playerId() {
  return `p_${crypto.randomBytes(6).toString("hex")}`;
}

function sessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

function randomLetter() {
  return LETTER_BAG[Math.floor(Math.random() * LETTER_BAG.length)];
}

function randomTile() {
  return Math.random() < 0.045 ? "QU" : randomLetter();
}

function createGrid(size = GRID_SIZE) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => randomTile()));
}

function cleanWord(word) {
  return String(word || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function normalizeRoomId(roomId) {
  return String(roomId || "").toUpperCase().trim();
}

function clampInt(value, min, max, fallback) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function canTraceWordOnGrid(word, grid) {
  if (!Array.isArray(grid) || grid.length !== GRID_SIZE || !word) return false;
  const visited = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));

  function dfs(r, c, idx) {
    const tile = grid[r][c];
    if (!word.startsWith(tile, idx)) return false;
    const nextIdx = idx + tile.length;
    if (nextIdx === word.length) return true;

    visited[r][c] = true;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= GRID_SIZE || nc >= GRID_SIZE) continue;
        if (visited[nr][nc]) continue;
        if (dfs(nr, nc, nextIdx)) {
          visited[r][c] = false;
          return true;
        }
      }
    }
    visited[r][c] = false;
    return false;
  }

  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (dfs(r, c, 0)) return true;
    }
  }
  return false;
}

function scoreWord(word) {
  const len = word.length;
  if (len < 3) return 0;
  if (len <= 4) return 1;
  if (len === 5) return 2;
  if (len === 6) return 3;
  if (len === 7) return 5;
  return 11;
}

async function isValidUsEnglishWord(word) {
  if (dictionary.size > 0 && dictionary.has(word)) return true;
  if (!WEBSTER_API_KEY) return false;
  if (websterCache.has(word)) return websterCache.get(word);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBSTER_TIMEOUT_MS);

  try {
    const endpoint = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(
      word.toLowerCase()
    )}?key=${WEBSTER_API_KEY}`;
    const res = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      websterCache.set(word, false);
      return false;
    }

    const data = await res.json();
    const valid =
      Array.isArray(data) &&
      data.some((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const metaId = typeof entry?.meta?.id === "string" ? entry.meta.id.split(":")[0].toUpperCase() : "";
        return metaId === word;
      });

    websterCache.set(word, valid);
    return valid;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function nonHostPlayers(room) {
  return room.players.filter((p) => p.id !== room.hostId);
}

function allMembersReady(room) {
  const members = nonHostPlayers(room);
  return members.length > 0 && members.every((p) => p.ready);
}

function roomSnapshot(room) {
  const now = Date.now();
  const remaining = room.round.active ? Math.max(0, Math.ceil((room.round.endsAt - now) / 1000)) : 0;
  return {
    app: { version: APP_VERSION, attribution: APP_ATTRIBUTION },
    roomId: room.id,
    hostId: room.hostId,
    settings: {
      roundSeconds: room.settings.roundSeconds,
      maxPlayers: room.settings.maxPlayers,
      minWordLength: room.settings.minWordLength,
      totalRounds: room.settings.totalRounds,
      minPlayers: MIN_PLAYERS,
    },
    match: {
      currentRound: room.match.currentRound,
      completedRounds: room.match.completedRounds,
      totalRounds: room.settings.totalRounds,
      over: room.match.over,
    },
    longestWords: room.match.longestWords.slice(0, 10),
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      ready: p.id === room.hostId ? true : p.ready,
      isHost: p.id === room.hostId,
    })),
    round: {
      active: room.round.active,
      gridSize: GRID_SIZE,
      grid: room.round.grid,
      endsAt: room.round.endsAt,
      remaining,
      usedWords: Array.from(room.round.usedWords),
    },
    dictionary: {
      enabled: dictionary.size > 0 || Boolean(WEBSTER_API_KEY),
      locale: "en-US",
      words: dictionary.size,
      websterEnabled: Boolean(WEBSTER_API_KEY),
    },
    readyGate: {
      membersReady: allMembersReady(room),
      memberCount: nonHostPlayers(room).length,
    },
    leaderboard: [...room.players]
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => ({ rank: idx + 1, id: p.id, name: p.name, score: p.score })),
  };
}

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://api.qrserver.com data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
}

function sendJson(res, status, data) {
  applySecurityHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function getPlayer(room, pid) {
  return room.players.find((p) => p.id === pid);
}

function requirePlayer(room, pid, token) {
  const player = getPlayer(room, pid);
  if (!player) return null;
  return player.token === token ? player : null;
}

function emitRoom(room) {
  const key = room.id;
  const payload = `event: state\ndata: ${JSON.stringify(roomSnapshot(room))}\n\n`;
  const subs = clients.get(key) || new Set();
  for (const res of subs) res.write(payload);
}

function endRound(room) {
  room.round.active = false;
  room.round.endsAt = 0;
  room.round.lastResults = room.round.wordLog.slice(-30);
  room.match.completedRounds += 1;
  if (room.match.completedRounds >= room.settings.totalRounds) {
    room.match.over = true;
  }
  for (const p of room.players) {
    if (p.id !== room.hostId) p.ready = false;
  }
}

function ensureTimer(room) {
  if (room.interval) return;
  room.interval = setInterval(() => {
    if (!room.round.active) return;
    if (Date.now() >= room.round.endsAt) {
      endRound(room);
      emitRoom(room);
    } else {
      emitRoom(room);
    }
  }, 1000);
}

function createRoom(name) {
  let rid = id(6);
  while (rooms.has(rid)) rid = id(6);
  const hostPid = playerId();
  const hostToken = sessionToken();
  const room = {
    id: rid,
    hostId: hostPid,
    settings: {
      roundSeconds: DEFAULT_ROUND_SECONDS,
      maxPlayers: DEFAULT_MAX_PLAYERS,
      minWordLength: DEFAULT_MIN_WORD_LENGTH,
      totalRounds: DEFAULT_TOTAL_ROUNDS,
    },
    match: {
      currentRound: 0,
      completedRounds: 0,
      over: false,
      longestWords: [],
    },
    players: [{ id: hostPid, token: hostToken, name: name || "Host", score: 0, ready: true }],
    round: {
      active: false,
      grid: [],
      endsAt: 0,
      usedWords: new Set(),
      wordLog: [],
      lastResults: [],
    },
    interval: null,
  };
  rooms.set(rid, room);
  ensureTimer(room);
  return { room, hostPid, hostToken };
}

function serveStatic(reqPath, res) {
  let file = reqPath === "/" ? "/index.html" : reqPath;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(PUBLIC_DIR, file);
  if (!fullPath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "Forbidden" });

  fs.readFile(fullPath, (err, data) => {
    if (err) return sendJson(res, 404, { error: "Not found" });
    const ext = path.extname(fullPath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
    };
    applySecurityHeaders(res);
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function getClientIp(req) {
  return req.socket?.remoteAddress || "unknown";
}

function checkRateLimit(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  let item = rateLimiter.get(ip);
  if (!item || now > item.resetAt) {
    item = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimiter.set(ip, item);
  }
  item.count += 1;
  return item.count <= RATE_LIMIT_MAX;
}

async function routeApi(req, res, url) {
  if (!checkRateLimit(req)) return sendJson(res, 429, { error: "Too many requests" });

  if (req.method === "GET" && url.pathname === "/api/meta") {
    return sendJson(res, 200, {
      app: { version: APP_VERSION, attribution: APP_ATTRIBUTION },
      dictionary: {
        enabled: dictionary.size > 0 || Boolean(WEBSTER_API_KEY),
        locale: "en-US",
        words: dictionary.size,
        source: "data/words_en_us.txt",
        websterEnabled: Boolean(WEBSTER_API_KEY),
      },
      gameplay: {
        board: `${GRID_SIZE}x${GRID_SIZE}`,
        adjacency: true,
        tileReusePerWord: false,
        includesQuTile: true,
        scoring: "3-4=1, 5=2, 6=3, 7=5, 8+=11",
      },
      offlineReady: true,
      security: {
        tokenAuth: true,
        rateLimited: true,
      },
    });
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    const room = rooms.get(normalizeRoomId(url.searchParams.get("roomId")));
    if (!room) return sendJson(res, 404, { error: "Room not found" });
    return sendJson(res, 200, roomSnapshot(room));
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const rid = normalizeRoomId(url.searchParams.get("roomId"));
    const room = rooms.get(rid);
    if (!room) return sendJson(res, 404, { error: "Room not found" });

    applySecurityHeaders(res);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: state\ndata: ${JSON.stringify(roomSnapshot(room))}\n\n`);
    if (!clients.has(rid)) clients.set(rid, new Set());
    clients.get(rid).add(res);
    req.on("close", () => {
      const set = clients.get(rid);
      if (!set) return;
      set.delete(res);
      if (set.size === 0) clients.delete(rid);
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/create-room") {
    const body = await parseBody(req);
    const name = normalizeName(body.name || "Host");
    if (!name) return sendJson(res, 400, { error: "Name is required" });
    const { room, hostPid, hostToken } = createRoom(name);
    return sendJson(res, 200, {
      roomId: room.id,
      playerId: hostPid,
      token: hostToken,
      host: true,
      state: roomSnapshot(room),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/join-room") {
    const body = await parseBody(req);
    const rid = normalizeRoomId(body.roomId);
    const name = normalizeName(body.name);
    const room = rooms.get(rid);
    if (!room) return sendJson(res, 404, { error: "Room not found" });
    if (!name) return sendJson(res, 400, { error: "Name is required" });
    if (room.round.active) return sendJson(res, 400, { error: "Cannot join while a round is active" });
    if (room.match.over) return sendJson(res, 400, { error: "Match has ended" });
    if (room.players.length >= room.settings.maxPlayers) return sendJson(res, 400, { error: "Room is full" });

    const pid = playerId();
    const token = sessionToken();
    room.players.push({ id: pid, token, name, score: 0, ready: false });
    emitRoom(room);
    return sendJson(res, 200, { roomId: rid, playerId: pid, token, host: false, state: roomSnapshot(room) });
  }

  if (req.method === "POST" && url.pathname === "/api/update-settings") {
    const body = await parseBody(req);
    const rid = normalizeRoomId(body.roomId);
    const pid = String(body.playerId || "");
    const token = String(body.token || "");
    const room = rooms.get(rid);
    if (!room) return sendJson(res, 404, { error: "Room not found" });
    const player = requirePlayer(room, pid, token);
    if (!player) return sendJson(res, 403, { error: "Unauthorized" });
    if (room.hostId !== player.id) return sendJson(res, 403, { error: "Only host can change settings" });
    if (room.round.active) return sendJson(res, 400, { error: "Cannot change settings during an active round" });
    if (room.match.currentRound > 0) return sendJson(res, 400, { error: "Settings lock after match starts" });

    const nextRoundSeconds = clampInt(
      body.roundSeconds,
      MIN_ROUND_SECONDS,
      MAX_ROUND_SECONDS,
      room.settings.roundSeconds
    );
    const nextMaxPlayers = clampInt(body.maxPlayers, MIN_MAX_PLAYERS, MAX_MAX_PLAYERS, room.settings.maxPlayers);
    const nextMinWordLength = clampInt(
      body.minWordLength,
      MIN_MIN_WORD_LENGTH,
      MAX_MIN_WORD_LENGTH,
      room.settings.minWordLength
    );
    const nextTotalRounds = clampInt(
      body.totalRounds,
      MIN_TOTAL_ROUNDS,
      MAX_TOTAL_ROUNDS,
      room.settings.totalRounds
    );

    if (room.players.length > nextMaxPlayers) {
      return sendJson(res, 400, { error: "Max players cannot be below current player count" });
    }

    room.settings.roundSeconds = nextRoundSeconds;
    room.settings.maxPlayers = nextMaxPlayers;
    room.settings.minWordLength = nextMinWordLength;
    room.settings.totalRounds = nextTotalRounds;

    emitRoom(room);
    return sendJson(res, 200, { ok: true, state: roomSnapshot(room) });
  }

  if (req.method === "POST" && url.pathname === "/api/set-ready") {
    const body = await parseBody(req);
    const rid = normalizeRoomId(body.roomId);
    const pid = String(body.playerId || "");
    const token = String(body.token || "");
    const room = rooms.get(rid);
    if (!room) return sendJson(res, 404, { error: "Room not found" });
    const player = requirePlayer(room, pid, token);
    if (!player) return sendJson(res, 403, { error: "Unauthorized" });
    if (room.round.active) return sendJson(res, 400, { error: "Round already active" });
    if (room.match.over) return sendJson(res, 400, { error: "Match has ended" });
    if (player.id === room.hostId) return sendJson(res, 400, { error: "Host is always ready" });

    player.ready = Boolean(body.ready);
    emitRoom(room);
    return sendJson(res, 200, { ok: true, state: roomSnapshot(room) });
  }

  if (req.method === "POST" && url.pathname === "/api/start-round") {
    const body = await parseBody(req);
    const rid = normalizeRoomId(body.roomId);
    const pid = String(body.playerId || "");
    const token = String(body.token || "");
    const room = rooms.get(rid);
    if (!room) return sendJson(res, 404, { error: "Room not found" });
    const player = requirePlayer(room, pid, token);
    if (!player) return sendJson(res, 403, { error: "Unauthorized" });
    if (room.hostId !== player.id) return sendJson(res, 403, { error: "Only host can start round" });
    if (room.players.length < MIN_PLAYERS) return sendJson(res, 400, { error: `Need at least ${MIN_PLAYERS} players` });
    if (!allMembersReady(room)) return sendJson(res, 400, { error: "All non-host members must be ready" });
    if (room.match.over) return sendJson(res, 400, { error: "Match has ended" });

    room.round.active = true;
    room.match.currentRound = room.match.completedRounds + 1;
    room.round.grid = createGrid();
    room.round.endsAt = Date.now() + room.settings.roundSeconds * 1000;
    room.round.usedWords.clear();
    room.round.wordLog = [];
    emitRoom(room);
    return sendJson(res, 200, { ok: true, state: roomSnapshot(room) });
  }

  if (req.method === "POST" && url.pathname === "/api/submit-word") {
    const body = await parseBody(req);
    const rid = normalizeRoomId(body.roomId);
    const pid = String(body.playerId || "");
    const token = String(body.token || "");
    const room = rooms.get(rid);
    if (!room) return sendJson(res, 404, { error: "Room not found" });
    const player = requirePlayer(room, pid, token);
    if (!player) return sendJson(res, 403, { error: "Unauthorized" });
    if (!room.round.active) return sendJson(res, 400, { error: "Round is not active" });

    const word = cleanWord(body.word);
    const minLetters = room.settings.minWordLength || DEFAULT_MIN_WORD_LENGTH;
    if (word.length < minLetters) return sendJson(res, 400, { error: `Word must be ${minLetters}+ letters` });
    if (!canTraceWordOnGrid(word, room.round.grid)) {
      return sendJson(res, 400, { error: "Word path is invalid for this 5x5 board" });
    }
    if (!(await isValidUsEnglishWord(word))) return sendJson(res, 400, { error: "Not a valid US English word" });
    if (room.round.usedWords.has(word)) return sendJson(res, 400, { error: "Word already used this round" });

    const points = scoreWord(word);
    room.round.usedWords.add(word);
    room.round.wordLog.push({ playerId: pid, playerName: player.name, word, points, t: Date.now() });
    room.match.longestWords.push({ word, playerName: player.name, round: room.match.currentRound, length: word.length });
    room.match.longestWords.sort((a, b) => b.length - a.length || a.word.localeCompare(b.word));
    room.match.longestWords = room.match.longestWords.filter((entry, index, all) => index === all.findIndex((item) => item.word === entry.word && item.playerName === entry.playerName));
    player.score += points;
    emitRoom(room);
    return sendJson(res, 200, { ok: true, points, state: roomSnapshot(room) });
  }

  sendJson(res, 404, { error: "API route not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return routeApi(req, res, url);
    return serveStatic(url.pathname, res);
  } catch (err) {
    return sendJson(res, 500, { error: err.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Word Factory running on http://localhost:${PORT}`);
  console.log(`Version: ${APP_VERSION}`);
  console.log(`Local dictionary loaded: ${dictionary.size} words`);
  console.log(`Webster fallback enabled: ${Boolean(WEBSTER_API_KEY)}`);
});





