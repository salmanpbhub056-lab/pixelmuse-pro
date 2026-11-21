# PixelMuse Pro

A full-stack photo editing website with a polished responsive UI and server-backed email/password accounts.

## Requirements
- Node.js 18 or newer
- npm

## Run locally
```bash
npm install
```

Set a unique session secret before starting:
```bash
# macOS / Linux
export SESSION_SECRET="replace-this-with-a-long-random-secret"
npm start
```
```powershell
# Windows PowerShell
$env:SESSION_SECRET="replace-this-with-a-long-random-secret"
npm start
```
Open http://localhost:3000

For local-only testing, the app can start without `SESSION_SECRET`; it uses a development-only fallback. Never deploy with that fallback.

## What's included
- Signup and sign-in with email validation and password rules
- Password hashing with bcrypt (12 rounds)
- Server-side sessions stored in SQLite
- Session ID regeneration on login/signup
- HTTP-only, SameSite=Lax session cookie
- Rate limiting on authentication endpoints
- Helmet security headers
- SQLite user database created automatically
- Photo editor: filters, brightness, contrast, saturation, exposure, warmth, blur, grayscale, rotate, flip, centred aspect-ratio crop, text overlays, brush drawing, undo/redo, zoom and PNG export
- Client-side photo processing: images are not uploaded to the server

## Important production checklist
This is a working starter application, not a fully audited production identity platform. Before public deployment:
1. Use HTTPS and set `NODE_ENV=production`.
2. Set a long random `SESSION_SECRET` using your hosting provider's secret manager.
3. Add CSRF protection / origin checks to state-changing routes.
4. Configure a persistent disk for the SQLite database and session store, or migrate to managed PostgreSQL/Redis.
5. Add email verification, password reset, account deletion and privacy/terms pages.
6. Add automated tests, monitoring, backups and a security review.
7. Configure a restrictive Content Security Policy instead of the development-friendly policy currently used.

## Data and privacy
Passwords are stored as bcrypt hashes, never as plaintext. The editor uses the browser canvas and does not send selected photos to the backend. Account details are stored in the local SQLite database on the server.


## Browser-only GitHub + Render deployment
1. Create a GitHub repository in the browser.
2. Use **Add file → Upload files** and upload the contents of this project (not the ZIP itself).
3. On Render, create **New → Web Service**, connect that GitHub repository, and set:
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: `NODE_ENV=production`
   - Environment: `SESSION_SECRET` = a long random secret generated in Render
   - Environment: `DATA_DIR=/var/data`
4. Attach a persistent disk mounted at `/var/data`. This is important because SQLite stores user accounts and sessions there. Render's persistent disks are a paid feature; without persistent storage, SQLite data can disappear after restarts/deploys.
5. Deploy. Render provides an `onrender.com` URL and can redeploy on future GitHub pushes.

For a no-paid-disk setup, migrate SQLite to a managed persistent database such as PostgreSQL before launch.
