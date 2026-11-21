const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("Set SESSION_SECRET in production.");
}

const dataDir = process.env.DATA_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "pixelmuse.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
const findUser = db.prepare("SELECT id, name, email, password_hash FROM users WHERE email = ?");
const createUser = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)");

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dataDir }),
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

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Please sign in to continue." });
  next();
};

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post("/api/signup", authLimiter, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: "Please enter a name between 2 and 60 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "Use a password with at least 10 characters." });
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: "Password must include at least one letter and one number." });
  if (findUser.get(email)) return res.status(409).json({ error: "An account with this email already exists. Try signing in." });
  const hash = await bcrypt.hash(password, 12);
  const result = createUser.run(name, email, hash);
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start your session. Please try again." });
    req.session.user = { id: result.lastInsertRowid, name, email };
    req.session.save(saveErr => {
      if (saveErr) return res.status(500).json({ error: "Account created, but session could not be saved. Please sign in." });
      res.status(201).json({ user: req.session.user });
    });
  });
});

app.post("/api/login", authLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = findUser.get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Email or password doesn't match. Please try again." });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start your session. Please try again." });
    req.session.user = { id: user.id, name: user.name, email: user.email };
    req.session.save(saveErr => {
      if (saveErr) return res.status(500).json({ error: "Could not save your session. Please try again." });
      res.json({ user: req.session.user });
    });
  });
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "Could not sign out. Please try again." });
    res.clearCookie("pixelmuse.sid", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.json({ ok: true });
  });
});

app.get("/api/account", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(req.session.user.id);
  res.json({ user });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, "0.0.0.0", () => console.log(`PixelMuse Pro running on port ${PORT}`));
