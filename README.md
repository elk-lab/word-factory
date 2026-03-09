# Word Factory Multiplayer

Responsive web/mobile multiplayer word game with:
- Room-based multiplayer
- Host/admin controls (timer, max players, min word length)
- Ready-up flow for members
- Timed rounds + auto scoring + leaderboard
- QR/link invites
- US English word validation (offline dictionary + optional Webster fallback)

## Requirements
- Node.js LTS
- npm (or use `npm.cmd` on Windows PowerShell if needed)

## Quick Start (Windows PowerShell)
1. Install dependencies (none required for runtime).
2. Create local env:
   - `Copy-Item .env.example .env`
3. (Optional) Add Webster key in `.env`:
   - `WEBSTER_API_KEY=your_key_here`
4. Import large dictionary:
   - `npm.cmd run dict:import`
5. Start server:
   - `npm.cmd start`
6. Open:
   - `http://localhost:3000`

## npm PowerShell Script Policy Fix
If you see `running scripts is disabled`:
- Temporary (current shell):
  - `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- Persistent (current user):
  - `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
- Or bypass PowerShell script shim:
  - `npm.cmd -v`

## Configuration (.env)
- `PORT` default `3000`
- `WEBSTER_API_KEY` optional Merriam-Webster Collegiate API key

Example:
```env
PORT=3000
WEBSTER_API_KEY=
```

## Dictionary Validation
Priority order:
1. Local file `data/words_en_us.txt` (offline)
2. Merriam-Webster API fallback (if `WEBSTER_API_KEY` is set)

Import script:
- `scripts/import-dictionary.ps1`
- Downloads a large word list, normalizes to uppercase A-Z words, de-duplicates.

## Scripts
- `npm run start` - start server
- `npm run dict:import` - import large dictionary to `data/words_en_us.txt`

## Security Notes
Current protections include:
- Per-player session token checks for game actions
- Input validation and safe clamping on settings
- Request rate limiting
- Security headers (CSP, frame-deny, nosniff, etc.)

For cloud deployment also use:
- HTTPS/TLS via reverse proxy (Nginx/Caddy/Cloudflare)
- Firewall and process isolation
- Secret management for API keys

## Git Safety
- `.env` is ignored in `.gitignore`
- `.env.example` is committed for team setup

## Project Structure
- `server.js` - backend API + game state + security controls
- `public/` - frontend UI
- `data/` - local dictionary file
- `scripts/` - dictionary import utility
