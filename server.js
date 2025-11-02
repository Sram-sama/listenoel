// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // sert le dossier public

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], purchases: {} }, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("Erreur lecture data.json :", e);
    return { users: [], purchases: {} };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error("Erreur écriture data.json :", e);
    return false;
  }
}

app.get("/data", (req, res) => {
  const data = loadData();
  res.json(data);
});

app.post("/addItem", (req, res) => {
  const { user, item, comment } = req.body;
  if (!user || !item) return res.status(400).json({ error: "user et item requis" });
  const data = loadData();
  const u = data.users.find(x => x.name === user);
  if (!u) return res.status(400).json({ error: "Utilisateur non trouvé" });
  // assure que u.list est tableau d'objets
  if (!Array.isArray(u.list)) u.list = (u.list || []).map(name => ({ name, comment: "" }));
  u.list.push({ name: item, comment: comment || "" });
  if (!data.purchases) data.purchases = {};
  if (!data.purchases[user]) data.purchases[user] = {};
  data.purchases[user][item] = false;
  const ok = saveData(data);
  if (!ok) return res.status(500).json({ error: "Impossible d'enregistrer" });
  res.json({ success: true });
});

app.post("/purchase", (req, res) => {
  const { user, item } = req.body;
  if (!user || !item) return res.status(400).json({ error: "user et item requis" });
  const data = loadData();
  if (!data.purchases) data.purchases = {};
  if (!data.purchases[user]) data.purchases[user] = {};
  data.purchases[user][item] = true;
  const ok = saveData(data);
  if (!ok) return res.status(500).json({ error: "Impossible d'enregistrer" });
  res.json({ success: true });
});

app.post("/updatePin", (req, res) => {
  const { user, newPin } = req.body;
  if (!user || !newPin) return res.status(400).json({ error: "user et newPin requis" });
  if (!/^\d{4}$/.test(newPin)) return res.status(400).json({ error: "newPin doit être 4 chiffres" });
  const data = loadData();
  const u = data.users.find(x => x.name === user);
  if (!u) return res.status(400).json({ error: "Utilisateur non trouvé" });
  u.pin = newPin;
  const ok = saveData(data);
  if (!ok) return res.status(500).json({ error: "Impossible d'enregistrer" });
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Serveur lancé sur http://localhost:${PORT}`));
