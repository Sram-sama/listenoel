# 🎄 Listenoel

Listes de cadeaux de Noël en famille. Chaque personne a sa liste et un code PIN à 4 chiffres ;
les autres peuvent réserver un cadeau (la personne concernée ne voit jamais ce qui est réservé).

## Lancer en local

```bash
npm install
npm start        # http://localhost:3000
```

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port d'écoute (fourni par l'hébergeur) | 3000 |
| `DATA_DIR` | Dossier où `data.json` est stocké (à pointer vers le volume en ligne) | dossier du projet |
| `RESET_GIFTS` | Efface tous les cadeaux (garde personnes et PIN) une seule fois ; changer la valeur pour recommencer | — |
| `SESSION_SECRET` | Clé de signature des sessions (longue chaîne aléatoire) | générée et enregistrée dans `DATA_DIR` |

Au premier démarrage, `data.json` est créé dans `DATA_DIR` à partir de `data.seed.json`.

## Sécurité

- PIN hachés (scrypt), jamais renvoyés au navigateur.
- Toutes les routes de données demandent une session (12 h).
- `data.json` n'est pas versionné : il contient les listes et les réservations réelles.

## Déployer sur Railway

1. Créer un projet : **New Project → Deploy from GitHub repo** → `listenoel`.
2. Ajouter un **Volume** au service, monté sur `/data`.
3. Onglet **Variables** : `DATA_DIR=/data` et `SESSION_SECRET=<longue chaîne aléatoire>`.
4. Onglet **Settings → Networking → Generate Domain** pour obtenir l'adresse publique.
5. Après usage : supprimer le projet pour arrêter la facturation.
