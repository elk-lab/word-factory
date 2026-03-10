# Word Factory

Word Factory is a responsive multiplayer word-building game built around a 5x5 tile grid. Players join the same room, wait until everyone is ready, and compete across timed rounds to build valid American English words from adjacent tiles. The game supports desktop and mobile play, QR or link invites, offline dictionary validation, and multi-round automatic scoring.

## Version
- Current version: `v1.4.2`
- Attribution: `elk-lab-jzion`

## Features
- 5x5 board gameplay with adjacency-only path rules
- `Qu` tile support
- Tap-to-build and press-drag-release tracing with auto-submit
- Path backtracking and tap-start reset behavior
- Upright letters while rotating the board view
- Host controls for timer, max players, minimum word length, and total rounds
- Ready-check system before each round starts
- Match-long leaderboard and longest-word tracking
- Round-local word reset each new round
- QR and share-link invites
- Responsive mobile layout with tabbed panels for players, leaderboard, words found, and longest words
- Offline local dictionary with optional Merriam-Webster API fallback
- Basic security protections: token checks, input validation, rate limiting, and response headers

## Game Rules
- Words must be formed from touching tiles on the 5x5 board.
- Tiles may connect horizontally, vertically, or diagonally.
- A tile cannot be reused within the same word.
- `Qu` counts as a single board tile but contributes `QU` to the word.
- Words must meet the configured minimum word length.
- Words must be valid US English according to the loaded dictionary source.
- Already-used words are blocked within the current round.
- Used-word lists reset at the start of every new round.

## Scoring
- `3-4` letters = `1` point
- `5` letters = `2` points
- `6` letters = `3` points
- `7` letters = `5` points
- `8+` letters = `11` points

## Room Settings
The host can configure these before the match starts:
- Round timer in seconds
- Maximum number of players
- Minimum allowed word length
- Total number of rounds in the match

After the match begins, settings lock to keep the competition fair.

## Mobile Play Notes
- During active rounds, page scrolling is suppressed to make drag tracing more reliable.
- The active mobile layout prioritizes the timer, board, action buttons, and tabs.
- Rotate the board if you want a different reading angle; the board turns while letters stay upright.

## Requirements
- Node.js LTS
- npm, or `npm.cmd` on Windows PowerShell

## Quick Start
### Windows PowerShell
1. Create a local environment file:
   - `Copy-Item .env.example .env`
2. Optionally add a Merriam-Webster API key in `.env`.
3. Import a larger offline dictionary:
   - `npm.cmd run dict:import`
4. Start the app:
   - `npm.cmd start`
5. Open:
   - `http://localhost:3000`

### General
1. Ensure Node.js is installed.
2. Create `.env` from `.env.example`.
3. Import the dictionary if needed.
4. Start the server with `npm start`.

## Environment Variables
```env
PORT=3000
WEBSTER_API_KEY=
```

## Dictionary Validation
Validation priority:
1. Local file: `data/words_en_us.txt`
2. Merriam-Webster Collegiate API when `WEBSTER_API_KEY` is set

This means the game can run fully offline as long as the local dictionary file is present.

## Scripts
- `npm run start` - start the Word Factory server
- `npm run dict:import` - import a large dictionary into `data/words_en_us.txt`

## PowerShell npm Fix
If PowerShell blocks npm scripts:
- Temporary for current shell:
  - `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- Persistent for current user:
  - `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
- Or use:
  - `npm.cmd -v`
  - `npm.cmd start`

## Project Structure
- `server.js` - backend API, round logic, validation, scoring, and room state
- `public/index.html` - UI markup
- `public/styles.css` - responsive layout and visual system
- `public/app.js` - client gameplay logic and live room updates
- `data/words_en_us.txt` - local dictionary source
- `scripts/import-dictionary.ps1` - dictionary import helper
- `.env.example` - example runtime configuration
- `render.yaml` - Render deployment blueprint

## Deployment
### Render
1. Push the repository to GitHub.
2. In Render, create a new Blueprint deployment.
3. Select this repository.
4. Set `WEBSTER_API_KEY` only if you want online fallback validation.
5. Deploy.

### VPS / Docker / Traefik
This project can run behind a VPS reverse proxy such as Traefik.
Typical flow:
1. Clone the repo on the server.
2. Create `.env`.
3. Build and run with Docker Compose.
4. Route your subdomain through the reverse proxy.

## Security Notes
Current protections include:
- Per-player session token checks
- Request rate limiting
- Input validation and server-side settings clamping
- Security headers including CSP, frame denial, and content-type protections

For public deployments, still use HTTPS/TLS and standard VPS hardening.

## Git Safety
- `.env` is ignored by `.gitignore`
- `.env.example` is kept in the repo for setup guidance

## Attribution
Word Factory by `elk-lab-jzion`

