const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const path = require("path");

const app = express();
const SESSION_SECRET = process.env.SESSION_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (process.env.NODE_ENV === "production" && !SESSION_SECRET) {
  throw new Error("Set SESSION_SECRET in Vercel Environment Variables.");
}
if (process.env.NODE_ENV === "production" && !DATABASE_URL) {
  throw new Error("Set DATABASE_URL in Vercel Environment Variables.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && /neon\.tech|sslmode=require/.test(DATABASE_URL)
    ? { rejectUnauthorized: false }
    : undefined,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

let schemaPromise;
function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(60) NOT NULL,
        email VARCHAR(254) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(err => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use(async (req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (err) {
    console.error("Database initialization failed:", err);
    res.status(503).json({ error: "Database is unavailable. Check DATABASE_URL and try again." });
  }
});

app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  secret: SESSION_SECRET || "local-development-secret-change-before-deploy",
  resave: false,
  saveUninitialized: false,
  name: "pixelmuse.sid",
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false
});
const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Please sign in to continue." });
  next();
};

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post("/api/signup", authLimiter, async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (name.length < 2 || name.length > 60) return res.status(400).json({ error: "Please enter a name between 2 and 60 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "Use a password with at least 10 characters." });
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: "Password must include at least one letter and one number." });

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount) return res.status(409).json({ error: "An account with this email already exists. Try signing in." });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, hash]
    );
    const user = result.rows[0];
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: "Could not start your session. Please try again." });
      req.session.user = { id: String(user.id), name: user.name, email: user.email };
      req.session.save(saveErr => {
        if (saveErr) return res.status(500).json({ error: "Account created, but session could not be saved. Please sign in." });
        res.status(201).json({ user: req.session.user });
      });
    });
  } catch (err) { next(err); }
});

app.post("/api/login", authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const result = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Email or password doesn't match. Please try again." });
    }
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: "Could not start your session. Please try again." });
      req.session.user = { id: String(user.id), name: user.name, email: user.email };
      req.session.save(saveErr => {
        if (saveErr) return res.status(500).json({ error: "Could not save your session. Please try again." });
        res.json({ user: req.session.user });
      });
    });
  } catch (err) { next(err); }
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "Could not sign out. Please try again." });
    res.clearCookie("pixelmuse.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.json({ ok: true });
  });
});

app.get("/api/account", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, created_at FROM users WHERE id = $1",
      [req.session.user.id]
    );
    res.json({ user: result.rows[0] || null });
  } catch (err) { next(err); }
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.use((err, req, res, next) => {
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Please try again." });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, "0.0.0.0", () => console.log(`PixelMuse Pro running on port ${port}`));
}

module.exports = app;
