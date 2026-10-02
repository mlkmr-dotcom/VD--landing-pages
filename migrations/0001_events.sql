-- Compteur interne des landing pages (aucune donnée personnelle : pas de nom, courriel, téléphone ni IP).
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,            -- horodatage (ms)
  day TEXT NOT NULL,              -- jour, heure de Montréal (AAAA-MM-JJ)
  page TEXT NOT NULL,             -- ex. /general/
  test TEXT NOT NULL DEFAULT '',  -- identifiant du test A/B
  variant TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,             -- view | cta | tel | form_start | lead | lead_error | lead_spam | lead_dry_run
  visitor TEXT NOT NULL DEFAULT '', -- empreinte pseudonyme valable une journée
  device TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  click TEXT NOT NULL DEFAULT '', -- type d'identifiant de clic présent (gclid, fbclid…), jamais sa valeur
  qa INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_page_day ON events (page, day);
CREATE INDEX IF NOT EXISTS idx_events_variant_kind ON events (page, variant, kind);
