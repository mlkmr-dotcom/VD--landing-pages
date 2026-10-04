// Schéma du compteur (identique à migrations/0001_events.sql). Créé automatiquement au premier
// enregistrement : aucune commande de migration à lancer après le premier déploiement.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, day TEXT NOT NULL, page TEXT NOT NULL,
    test TEXT NOT NULL DEFAULT '', variant TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL,
    visitor TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
    medium TEXT NOT NULL DEFAULT '', campaign TEXT NOT NULL DEFAULT '', click TEXT NOT NULL DEFAULT '',
    qa INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS idx_events_page_day ON events (page, day)',
  'CREATE INDEX IF NOT EXISTS idx_events_variant_kind ON events (page, variant, kind)'
];
let ready = null;
export function ensureSchema(db) {
  if (!ready) ready = db.batch(STATEMENTS.map((s) => db.prepare(s))).catch((e) => { ready = null; throw e; });
  return ready;
}
