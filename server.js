// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { hashPin, verifyPin, makeToken, readToken } = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Dossier des données : sur Railway, pointer DATA_DIR vers le volume (ex. /data)
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, "data.json");
const SEED_FILE = path.join(__dirname, "data.seed.json");
const SECRET_FILE = path.join(DATA_DIR, ".session-secret");
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try { return fs.readFileSync(SECRET_FILE, "utf8").trim(); } catch (e) {}
  const s = crypto.randomBytes(32).toString("hex");
  try { fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 }); } catch (e) { console.error("Secret non persisté :", e); }
  return s;
}
const SECRET = loadSecret();

/* ---------- Données ---------- */
function emptyData() { return { users: [], purchases: {} }; }

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    let initial = emptyData();
    try { initial = JSON.parse(fs.readFileSync(SEED_FILE, "utf8")); } catch (e) {}
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("Erreur lecture data.json :", e);
    throw e; // on ne remplace jamais silencieusement les données
  }
  // Migration : PIN en clair -> PIN haché
  let migrated = false;
  for (const u of data.users) {
    if (u.pin) { u.pinHash = hashPin(u.pin); delete u.pin; migrated = true; }
    if (!Array.isArray(u.list)) u.list = [];
  }
  if (!data.purchases) data.purchases = {};
  if (migrated) saveData(data);
  return data;
}

function saveData(data) {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE); // écriture atomique
}

/* ---------- Middleware ---------- */
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

function auth(req, res, next) {
  const h = req.get("authorization") || "";
  const user = readToken(h.startsWith("Bearer ") ? h.slice(7) : "", SECRET);
  if (!user) return res.status(401).json({ error: "Non connecté" });
  req.user = user;
  next();
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/* ---------- Anti force brute (4 chiffres = 10 000 combinaisons) ---------- */
const fails = new Map(); // clé -> { n, until }
const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;
function lockedFor(key) {
  const f = fails.get(key);
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 60000) : 0;
}
function registerFail(key) {
  const f = fails.get(key) || { n: 0, until: 0 };
  if (f.until && f.until <= Date.now()) { f.n = 0; f.until = 0; }
  f.n += 1;
  if (f.n >= MAX_FAILS) f.until = Date.now() + LOCK_MS;
  fails.set(key, f);
}

/* ---------- Routes publiques ---------- */
app.get("/users", (req, res) => {
  res.json({ users: loadData().users.map(u => u.name) });
});

app.post("/login", (req, res) => {
  const name = str(req.body.user, 100);
  const pin = typeof req.body.pin === "string" ? req.body.pin : "";
  const keys = [`u:${name}`, `ip:${req.ip}`];
  const wait = Math.max(...keys.map(lockedFor));
  if (wait) return res.status(429).json({ error: `Trop d'essais. Réessayez dans ${wait} min.` });

  const u = loadData().users.find(x => x.name === name);
  // Même durée de calcul que l'utilisateur existe ou non
  const ok = verifyPin(pin, u ? u.pinHash : "00:00");
  if (!u || !ok) {
    keys.forEach(registerFail);
    return res.status(401).json({ error: "PIN incorrect" });
  }
  keys.forEach(k => fails.delete(k));
  res.json({ token: makeToken(u.name, SECRET, TOKEN_TTL_MS), user: u.name });
});

/* ---------- Routes protégées ---------- */
// Chaque utilisateur voit sa propre liste (sans l'état « acheté », pour garder la surprise)
// et celles des autres avec l'état « acheté ».
app.get("/data", auth, (req, res) => {
  const data = loadData();
  res.json({
    me: req.user,
    users: data.users.map(u => ({
      name: u.name,
      list: u.list.map(it => {
        const base = { name: it.name, comment: it.comment || "" };
        if (u.name !== req.user) base.purchased = !!(data.purchases[u.name] && data.purchases[u.name][it.name]);
        return base;
      })
    }))
  });
});

app.post("/addItem", auth, (req, res) => {
  const item = str(req.body.item, 200);
  const comment = str(req.body.comment, 1000);
  if (!item) return res.status(400).json({ error: "item requis" });
  const data = loadData();
  const u = data.users.find(x => x.name === req.user);
  if (!u) return res.status(400).json({ error: "Utilisateur non trouvé" });
  if (u.list.some(x => x.name === item)) return res.status(409).json({ error: "Ce cadeau est déjà dans votre liste" });
  u.list.push({ name: item, comment });
  if (!data.purchases[u.name]) data.purchases[u.name] = {};
  data.purchases[u.name][item] = false;
  saveData(data);
  res.json({ success: true });
});

app.post("/purchase", auth, (req, res) => {
  const owner = str(req.body.user, 100);
  const item = str(req.body.item, 200);
  if (!owner || !item) return res.status(400).json({ error: "user et item requis" });
  if (owner === req.user) return res.status(403).json({ error: "Vous ne pouvez pas réserver votre propre cadeau" });
  const data = loadData();
  const u = data.users.find(x => x.name === owner);
  if (!u || !u.list.some(x => x.name === item)) return res.status(400).json({ error: "Cadeau non trouvé" });
  if (!data.purchases[owner]) data.purchases[owner] = {};
  data.purchases[owner][item] = true;
  saveData(data);
  res.json({ success: true });
});

app.post("/updatePin", auth, (req, res) => {
  const newPin = typeof req.body.newPin === "string" ? req.body.newPin : "";
  if (!/^\d{4}$/.test(newPin)) return res.status(400).json({ error: "newPin doit être 4 chiffres" });
  const data = loadData();
  const u = data.users.find(x => x.name === req.user);
  if (!u) return res.status(400).json({ error: "Utilisateur non trouvé" });
  u.pinHash = hashPin(newPin);
  saveData(data);
  res.json({ success: true });
});

app.post("/updateComment", auth, (req, res) => {
  const item = str(req.body.item, 200);
  const comment = str(req.body.comment, 1000);
  if (!item) return res.status(400).json({ error: "item requis" });
  const data = loadData();
  const u = data.users.find(x => x.name === req.user);
  const obj = u && u.list.find(x => x.name === item);
  if (!obj) return res.status(400).json({ error: "Cadeau non trouvé" });
  obj.comment = comment;
  saveData(data);
  res.json({ success: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erreur serveur" });
});

app.listen(PORT, "0.0.0.0", () => console.log(`Serveur lancé sur le port ${PORT} (données : ${DATA_FILE})`));
