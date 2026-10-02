// Tableau de bord /stats?key=... : visites, visiteurs, demandes, taux de conversion par variante,
// par jour et par source. Lecture seule sur la base D1. Aucune donnée personnelle.
import { PAGES } from './config.js';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Test bilatéral de deux proportions (approximation normale).
export function twoProportion(c1, n1, c2, n2) {
  if (!n1 || !n2) return null;
  const p1 = c1 / n1, p2 = c2 / n2, p = (c1 + c2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  const z = (p2 - p1) / se;
  const pValue = 2 * (1 - normCdf(Math.abs(z)));
  return { z, pValue, lift: p1 ? (p2 - p1) / p1 : null };
}
function normCdf(x) {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * x / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return 0.5 * (1 + y);
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + ' %' : '—');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function renderStats(request, env, url) {
  const key = url.searchParams.get('key') || request.headers.get('x-stats-key') || '';
  if (!env.STATS_KEY || !safeEqual(key, env.STATS_KEY)) return new Response('Accès refusé', { status: 403 });
  if (!env.DB) return new Response('Base de statistiques non configurée', { status: 503 });

  const path = PAGES[url.searchParams.get('page')] ? url.searchParams.get('page') : Object.keys(PAGES)[0];
  const page = PAGES[path];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : (env.TEST_START || '2026-10-01');
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : today;
  const where = 'page = ? AND day >= ? AND day <= ? AND qa = 0';
  const args = [path, from, to];

  // Visiteurs = somme des visiteurs uniques par jour (identifiant journalier).
  const q = (sql) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results || []);
  const [byVariant, byDay, bySource, byDevice] = await Promise.all([
    q(`SELECT variant, SUM(kind='view') views, 0 visitors,
         SUM(kind='lead') leads, SUM(kind='lead_error') lead_errors, SUM(kind='tel') tel, SUM(kind='cta') cta, SUM(kind='form_start') form_start
       FROM events WHERE ${where} GROUP BY variant ORDER BY variant`),
    q(`SELECT day, variant, COUNT(DISTINCT CASE WHEN kind='view' THEN visitor END) visitors, SUM(kind='view') views, SUM(kind='lead') leads, SUM(kind='tel') tel
       FROM events WHERE ${where} GROUP BY day, variant ORDER BY day DESC, variant`),
    q(`SELECT source, COUNT(DISTINCT CASE WHEN kind='view' THEN day||visitor END) visitors, SUM(kind='lead') leads, SUM(kind='tel') tel
       FROM events WHERE ${where} GROUP BY source ORDER BY visitors DESC LIMIT 20`),
    q(`SELECT device, variant, COUNT(DISTINCT CASE WHEN kind='view' THEN day||visitor END) visitors, SUM(kind='lead') leads, SUM(kind='tel') tel
       FROM events WHERE ${where} GROUP BY device, variant ORDER BY device, variant`)
  ]);

  const fixVisitors = await env.DB.prepare(
    `SELECT variant, COUNT(*) visitors FROM (SELECT DISTINCT variant, day, visitor FROM events WHERE ${where} AND kind='view') GROUP BY variant`
  ).bind(...args).all().then((r) => Object.fromEntries((r.results || []).map((x) => [x.variant, x.visitors])));
  for (const row of byVariant) row.visitors = fixVisitors[row.variant] || 0;

  const a = byVariant.find((r) => r.variant === 'a'), b = byVariant.find((r) => r.variant === 'b');
  const t = a && b ? twoProportion(a.leads, a.visitors, b.leads, b.visitors) : null;
  const tt = a && b ? twoProportion(a.leads + a.tel, a.visitors, b.leads + b.tel, b.visitors) : null;

  const verdict = (x) => !x ? 'Pas encore assez de données.'
    : `${x.lift === null ? '' : (x.lift >= 0 ? '+' : '') + (100 * x.lift).toFixed(0) + ' % pour B vs A · '}p = ${x.pValue.toFixed(3)} — ` +
      (x.pValue < 0.05 ? 'écart significatif.' : 'pas encore significatif (attendre).');

  const rowsVariant = byVariant.map((r) => `<tr><td><b>${esc(r.variant.toUpperCase() || '?')}</b></td><td>${r.visitors}</td><td>${r.views}</td><td>${r.form_start}</td><td><b>${r.leads}</b></td><td><b>${pct(r.leads, r.visitors)}</b></td><td>${r.tel}</td><td>${pct(r.leads + r.tel, r.visitors)}</td><td>${r.lead_errors}</td></tr>`).join('');
  const rowsDay = byDay.map((r) => `<tr><td>${esc(r.day)}</td><td>${esc(r.variant.toUpperCase())}</td><td>${r.visitors}</td><td>${r.views}</td><td>${r.leads}</td><td>${pct(r.leads, r.visitors)}</td><td>${r.tel}</td></tr>`).join('');
  const rowsSource = bySource.map((r) => `<tr><td>${esc(r.source)}</td><td>${r.visitors}</td><td>${r.leads}</td><td>${pct(r.leads, r.visitors)}</td><td>${r.tel}</td></tr>`).join('');
  const rowsDevice = byDevice.map((r) => `<tr><td>${esc(r.device)}</td><td>${esc(r.variant.toUpperCase())}</td><td>${r.visitors}</td><td>${r.leads}</td><td>${pct(r.leads, r.visitors)}</td><td>${r.tel}</td></tr>`).join('');

  const html = `<!doctype html><html lang="fr-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Statistiques LP | Votre Dentisterie</title>
<style>body{font:15px/1.45 Inter,system-ui,Arial,sans-serif;color:#2F3342;max-width:1040px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}p.m{color:#5a6b85;margin:0 0 16px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{border-bottom:1px solid #e3e8f0;padding:7px 8px;text-align:right}
th:first-child,td:first-child{text-align:left}th{font-weight:600;color:#5a6b85;font-size:13px}
.v{background:#f3f6fc;border:1px solid #dbe4f3;border-radius:10px;padding:12px 14px;margin:8px 0}
form{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 0}input{font:inherit;padding:4px 6px}
.scroll{overflow-x:auto}</style></head><body>
<h1>Landing page ${esc(path)} — test ${esc(page.test.id)}</h1>
<p class="m">Du ${esc(from)} au ${esc(to)} (heure de Montréal). Robots, aperçus et tests internes exclus. Répartition actuelle : ${esc(JSON.stringify(page.test.weights))}.</p>
<form method="get"><input type="hidden" name="key" value="${esc(key)}"><label>Du <input type="date" name="from" value="${esc(from)}"></label><label>au <input type="date" name="to" value="${esc(to)}"></label><button>Actualiser</button></form>
<div class="v"><b>Formulaires (demandes reçues ÷ visiteurs) :</b> ${esc(verdict(t))}<br><b>Formulaires + clics téléphone :</b> ${esc(verdict(tt))}</div>
<h2>Par variante</h2><div class="scroll"><table><tr><th>Variante</th><th>Visiteurs</th><th>Visites</th><th>Formulaire commencé</th><th>Demandes reçues</th><th>Taux de conversion</th><th>Clics téléphone</th><th>Demandes + appels</th><th>Envois échoués</th></tr>${rowsVariant || '<tr><td colspan="9">Aucune donnée</td></tr>'}</table></div>
<h2>Par appareil</h2><div class="scroll"><table><tr><th>Appareil</th><th>Variante</th><th>Visiteurs</th><th>Demandes</th><th>Taux</th><th>Clics téléphone</th></tr>${rowsDevice}</table></div>
<h2>Par source</h2><div class="scroll"><table><tr><th>Source</th><th>Visiteurs</th><th>Demandes</th><th>Taux</th><th>Clics téléphone</th></tr>${rowsSource}</table></div>
<h2>Par jour</h2><div class="scroll"><table><tr><th>Jour</th><th>Variante</th><th>Visiteurs</th><th>Visites</th><th>Demandes</th><th>Taux</th><th>Clics téléphone</th></tr>${rowsDay}</table></div>
<p class="m" style="margin-top:24px">« Demandes reçues » = formulaires acceptés par HighLevel (réponse 2xx du webhook). « Visiteurs » = visiteurs uniques par jour, sans cookie de suivi. Un clic sur le numéro n'est pas un appel abouti.</p>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
