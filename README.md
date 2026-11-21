# PixelMuse Pro — Vercel Edition

This version is adapted for Vercel serverless deployment and uses PostgreSQL instead of SQLite.
It avoids `better-sqlite3` and `connect-sqlite3`, which caused the native `node-gyp` build failure.

## Deploy using GitHub + Vercel

1. Upload the contents of this folder to your GitHub repository (replace the old files).
2. Create a Neon PostgreSQL database at https://neon.tech/.
3. Copy the **pooled** PostgreSQL connection string from Neon. Keep it secret.
4. In Vercel, open Project → Settings → Environment Variables and add:
   - `DATABASE_URL` = Neon pooled connection string
   - `SESSION_SECRET` = a long random secret (at least 32 random characters)
   - `NODE_ENV` = `production`
   Apply them to Production, Preview, and Development as needed.
5. Redeploy from Vercel → Deployments → Redeploy.

Vercel uses `api/index.js` as the serverless entry point. The `vercel.json` rewrite sends requests to the Express app. The app creates its PostgreSQL users table automatically; the session store creates its table automatically.

## Local development

```bash
npm install
```

Set `DATABASE_URL` and `SESSION_SECRET`, then run:

```bash
npm start
```

Open http://localhost:3000.

## Notes

- Use Neon's pooled connection string for serverless workloads.
- Do not commit `.env` files or expose `DATABASE_URL` or `SESSION_SECRET`.
- Existing SQLite accounts from the previous Render-oriented package are not migrated automatically.
- Photos are edited in the browser; image files are not uploaded to the server.
- This is a starter authentication implementation. Before a high-traffic public launch, add CSRF/origin protections, email verification, password reset, privacy/terms pages, monitoring, and a security review.
