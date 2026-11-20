// Usage : node tools/make-seed.js ancien-data.json > data.seed.json
// Convertit un data.json (PIN en clair) en fichier de départ avec PIN hachés.
const fs = require("fs");
const { hashPin } = require("../auth");
const src = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const u of src.users) {
  if (u.pin) { u.pinHash = hashPin(u.pin); }
  delete u.pin;
}
process.stdout.write(JSON.stringify(src, null, 2) + "\n");
