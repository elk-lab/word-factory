# Word Factory Multiplayer

Responsive web and mobile multiplayer Word Factory with a 5x5 board, smooth tap/drag path tracing, timed rounds, room invites, host controls, and US English dictionary validation.

## Version
- `v1.3.0`
- Attribution label: `elk-lab-jzion`

## Highlights
- 5x5 board with adjacency rules and `Qu` tiles
- Tap-to-build, valid-neighbor highlights, and press-and-drag tracing with auto-submit on release
- Host settings for timer, max players, minimum word length, and total rounds
- Multi-round match scoring with leaderboard and longest-word tracking
- Round-local used-word resets
- QR and link invites
- Offline local dictionary with optional Merriam-Webster fallback

## Requirements
- Node.js LTS
- npm or `npm.cmd` on Windows PowerShell

## Quick Start (Windows PowerShell)
1. Create local env:
   - `Copy-Item .env.example .env`
2. Optional: add `WEBSTER_API_KEY` in `.env`
3. Import a large dictionary:
   - `npm.cmd run dict:import`
4. Start server:
   - `npm.cmd start`
5. Open:
   - `http://localhost:3000`

## npm PowerShell Policy Fix
If PowerShell blocks npm scripts:
- Temporary:
  - `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- Persistent for current user:
  - `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
- Or use:
  - `npm.cmd -v`
  - `npm.cmd start`

## Environment
```env
PORT=3000
WEBSTER_API_KEY=
```

## Dictionary Validation
Validation order:
1. `data/words_en_us.txt`
2. Merriam-Webster Collegiate API when `WEBSTER_API_KEY` is set

Import script:
- `scripts/import-dictionary.ps1`

## Scripts
- `npm run start`
- `npm run dict:import`

## Security
- Per-player session token checks
- Input validation and settings clamping
- Request rate limiting
- Security headers (CSP, frame deny, nosniff)

## Render Deploy
1. Push repo to GitHub.
2. In Render: `New +` -> `Blueprint`.
3. Select this repo.
4. Set `WEBSTER_API_KEY` only if needed.
5. Deploy.

## VPS Notes
- Docker-friendly deployment works well behind Traefik or another reverse proxy.
- For Traefik, attach the app container to the proxy network and route by host rule.

## Project Structure
- `server.js` - backend API, scoring, match flow, validation
- `public/` - UI and interaction logic
- `data/` - local dictionary file
- `scripts/` - dictionary import tooling

