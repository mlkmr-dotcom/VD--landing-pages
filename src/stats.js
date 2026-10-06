import { ensureSchema } from './schema.js';
import { bayes, srm } from './abstats.js';
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
  await ensureSchema(env.DB);

  const path = PAGES[url.searchParams.get('page')] ? url.searchParams.get('page') : Object.keys(PAGES)[0];
  const page = PAGES[path];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : (env.TEST_START || '2026-10-01');
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : today;
  const where = 'page = ? AND day >= ? AND day <= ? AND qa = 0 AND test = ?';
  const args = [path, from, to, page.test.id];

  // Visiteurs = somme des visiteurs uniques par jour (identifiant journalier).
  const convertedVisitors = `COUNT(DISTINCT CASE WHEN kind='lead' AND visitor != '' AND EXISTS (
    SELECT 1 FROM events exposure WHERE exposure.page=events.page AND exposure.test=events.test
      AND exposure.variant=events.variant AND exposure.day=events.day AND exposure.visitor=events.visitor
      AND exposure.kind='view' AND exposure.qa=0 AND exposure.ts<=events.ts
  ) THEN day||':'||visitor END)`;
  const sourceConvertedVisitors = convertedVisitors.replace("AND exposure.kind='view'", "AND exposure.source=events.source AND exposure.kind='view'");
  const deviceConvertedVisitors = convertedVisitors.replace("AND exposure.kind='view'", "AND exposure.device=events.device AND exposure.kind='view'");
  const q = (sql) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results || []);
  const [byVariant, byDay, bySource, byDevice] = await Promise.all([
    q(`SELECT variant, SUM(kind='view') views, 0 visitors,
         SUM(kind='lead') leads, ${convertedVisitors} converted_visitors, SUM(kind='lead_error') lead_errors, SUM(kind='tel') tel, SUM(kind='cta') cta, SUM(kind='form_start') form_start,
         SUM(kind='engaged') engaged, SUM(kind='form_invalid') form_invalid
       FROM events WHERE ${where} GROUP BY variant ORDER BY variant`),
    q(`SELECT day, variant, COUNT(DISTINCT CASE WHEN kind='view' AND visitor != '' THEN visitor END) visitors, SUM(kind='view') views, SUM(kind='lead') leads, ${convertedVisitors} converted_visitors, SUM(kind='tel') tel
       FROM events WHERE ${where} GROUP BY day, variant ORDER BY day DESC, variant`),
    q(`SELECT source, COUNT(DISTINCT CASE WHEN kind='view' AND visitor != '' THEN day||':'||visitor END) visitors, SUM(kind='lead') leads, ${sourceConvertedVisitors} converted_visitors, SUM(kind='tel') tel
       FROM events WHERE ${where} GROUP BY source ORDER BY visitors DESC LIMIT 20`),
    q(`SELECT device, variant, COUNT(DISTINCT CASE WHEN kind='view' AND visitor != '' THEN day||':'||visitor END) visitors, SUM(kind='lead') leads, ${deviceConvertedVisitors} converted_visitors, SUM(kind='tel') tel
       FROM events WHERE ${where} GROUP BY device, variant ORDER BY device, variant`)
  ]);

  const fixVisitors = await env.DB.prepare(
    `SELECT variant, COUNT(*) visitors FROM (SELECT DISTINCT variant, day, visitor FROM events WHERE ${where} AND kind='view' AND visitor != '') GROUP BY variant`
  ).bind(...args).all().then((r) => Object.fromEntries((r.results || []).map((x) => [x.variant, x.visitors])));
  for (const row of byVariant) row.visitors = fixVisitors[row.variant] || 0;

  const a = byVariant.find((r) => r.variant === 'a'), b = byVariant.find((r) => r.variant === 'b');
  const t = a && b ? twoProportion(a.converted_visitors, a.visitors, b.converted_visitors, b.visitors) : null;

  // Règle de décision pré-enregistrée (docs/PLAN-MESURE.md) : bayésienne, adaptée aux faibles volumes.
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1);
  const ratio = srm(Object.fromEntries(byVariant.map((r) => [r.variant, r.visitors])), page.test.weights);
  const bz = a && b ? bayes(a.converted_visitors, a.visitors, b.converted_visitors, b.visitors) : null;
  const fmtPct = (x) => (x >= 0 ? '+' : '') + (100 * x).toFixed(0) + ' %';
  function decision(x, ca, na) {
    if (!x) return 'Pas encore de données sur les deux variantes.';
    const base = na ? ca / na : 0, tol = Math.max(base * 0.10, 0.002);
    const ready = days >= 14 && a.visitors >= 100 && b.visitors >= 100 && !(ratio && ratio.pValue < 0.01);
    const head = `P(B > A) = ${(100 * x.probBBeatsA).toFixed(0)} % · écart probable ${fmtPct(x.liftMedian)} (intervalle 95 % : ${fmtPct(x.liftLow)} à ${fmtPct(x.liftHigh)}) · perte attendue si on choisit B : ${(100 * x.expectedLossB).toFixed(2)} pt, si on garde A : ${(100 * x.expectedLossA).toFixed(2)} pt. `;
    if (!ready) return head + `→ Continuer (minimum 14 jours et 100 visiteurs-jours par variante ; jour ${days}).`;
    if (x.probBBeatsA >= 0.95 && x.expectedLossB <= tol) return head + '→ Signal favorable à B; vérifier la réception CRM et les visiteurs récurrents avant de décider.';
    if (x.probBBeatsA <= 0.05 && x.expectedLossA <= tol) return head + '→ Signal favorable à A; vérifier la réception CRM et les visiteurs récurrents avant de décider.';
    if (days >= 56) return head + '→ 8 semaines sans écart net : décision à revoir avec les résultats CRM.';
    return head + '→ Continuer.';
  }
  const srmLine = !ratio ? 'Partage du trafic : pas encore assez de visiteurs pour le contrôler.'
    : ratio.pValue < 0.01 ? `⚠ Partage du trafic anormal (p = ${ratio.pValue.toFixed(4)}) : résultats non fiables, vérifier la répartition et les exclusions avant toute décision.`
    : `Aucun déséquilibre détecté sur les visiteurs-jours (p = ${ratio.pValue.toFixed(2)}).`;

  const verdict = (x) => !x ? 'Pas encore assez de données.'
    : `${x.lift === null ? '' : (x.lift >= 0 ? '+' : '') + (100 * x.lift).toFixed(0) + ' % pour B vs A · '}p = ${x.pValue.toFixed(3)} — ` +
      (x.pValue < 0.05 ? 'écart significatif.' : 'pas encore significatif (attendre)');

  const rowsVariant = byVariant.map((r) => `<tr><td><b>${esc(r.variant.toUpperCase() || '?')}</b></td><td>${r.visitors}</td><td>${r.views}</td><td>${pct(r.engaged, r.views)}</td><td>${r.form_start}</td><td>${r.form_invalid}</td><td><b>${r.leads}</b></td><td>${r.converted_visitors}</td><td><b>${pct(r.converted_visitors, r.visitors)}</b></td><td>${r.tel}</td><td>${r.lead_errors}</td></tr>`).join('');
  const rowsDay = byDay.map((r) => `<tr><td>${esc(r.day)}</td><td>${esc(r.variant.toUpperCase())}</td><td>${r.visitors}</td><td>${r.views}</td><td>${r.leads}</td><td>${pct(r.converted_visitors, r.visitors)}</td><td>${r.tel}</td></tr>`).join('');
  const rowsSource = bySource.map((r) => `<tr><td>${esc(r.source)}</td><td>${r.visitors}</td><td>${r.leads}</td><td>${pct(r.converted_visitors, r.visitors)}</td><td>${r.tel}</td></tr>`).join('');
  const rowsDevice = byDevice.map((r) => `<tr><td>${esc(r.device)}</td><td>${esc(r.variant.toUpperCase())}</td><td>${r.visitors}</td><td>${r.leads}</td><td>${pct(r.converted_visitors, r.visitors)}</td><td>${r.tel}</td></tr>`).join('');

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
<div class="v"><b>Indicateur principal — visiteurs-jours avec formulaire accepté ÷ visiteurs-jours exposés :</b> ${esc(decision(bz, a ? a.converted_visitors : 0, a ? a.visitors : 0))}<br><br><small>${esc(srmLine)} Comparaison indicative — formulaires : ${esc(verdict(t))}. Un visiteur revenant un autre jour peut être compté à nouveau; ces résultats ne suffisent pas à déclarer une variante gagnante.</small></div>
<h2>Par variante</h2><div class="scroll"><table><tr><th>Variante</th><th>Visiteurs-jours</th><th>Visites</th><th>Visites engagées</th><th>Formulaire commencé</th><th>Formulaire refusé (champ invalide)</th><th>Formulaires acceptés</th><th>Visiteurs-jours avec formulaire</th><th>Taux de formulaire</th><th>Clics téléphone</th><th>Envois échoués</th></tr>${rowsVariant || '<tr><td colspan="11">Aucune donnée</td></tr>'}</table></div>
<h2>Par appareil</h2><div class="scroll"><table><tr><th>Appareil</th><th>Variante</th><th>Visiteurs-jours</th><th>Formulaires acceptés</th><th>Taux</th><th>Clics téléphone</th></tr>${rowsDevice}</table></div>
<h2>Par source</h2><div class="scroll"><table><tr><th>Source</th><th>Visiteurs-jours</th><th>Formulaires acceptés</th><th>Taux</th><th>Clics téléphone</th></tr>${rowsSource}</table></div>
<h2>Par jour</h2><div class="scroll"><table><tr><th>Jour</th><th>Variante</th><th>Visiteurs-jours</th><th>Visites</th><th>Formulaires acceptés</th><th>Taux</th><th>Clics téléphone</th></tr>${rowsDay}</table></div>
<p class="m" style="margin-top:24px">« Formulaires acceptés » = réponse HTTP 2xx du relais HighLevel, à rapprocher de la réception CRM et des automatismes. Le taux compte au plus un succès par visiteur-jour exposé à la variante, même en cas d’envois répétés. « Visiteurs-jours » = identifiants pseudonymes distincts par jour; ce ne sont pas des personnes uniques sur la période. Les clics téléphone restent séparés : ni appels reçus ni nouveaux patients. Les résultats sont indicatifs, sans décision automatique.</p>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
