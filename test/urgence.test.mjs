// Urgence Iberville : routes, métadonnées par page, indépendance des tests A/B, relais, replays,
// statistiques par page et isolement des aperçus. Webhook simulé, aucune donnée réelle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import worker, { assignVariant, buildWebhookJson, validateLead } from '../src/worker.js';
import { PAGES, ALIASES, REDIRECTS, SITE } from '../src/config.js';
import { renderStats } from '../src/stats.js';

const HOST = SITE.host, URG = '/urgences/', GEN = '/';
const ASSETS = { fetch: async (r) => new Response(`<html>${new URL(r.url).pathname}</html>`) };
function db() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_events.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(text) { let args = []; return { bind(...v) { args = v; return this; },
      async run() { const r = sql.prepare(text).run(...args); return { meta: { changes: Number(r.changes) } }; },
      async all() { return { results: sql.prepare(text).all(...args) }; } }; },
    async batch(statements) { return Promise.all(statements.map((s) => s.run())); }
  };
  return { sql, DB };
}
const lead = (extra = {}, host = HOST) => new Request(`https://${host}/api/lead`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ 'nom_et_prénom': 'Personne Fictive', email_: 'fictif@example.invalid', 'numéro_de_téléphone': '4505550100', event_id: 'dcub-fictive-urgence-0001', landing_path: URG, ab_variant: 'b', ab_test: 'vd-iberville-2026-10', ...extra }) });
async function withHook(fn) {
  const real = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, init) => { sent.push(String(init.body)); return new Response('{}'); };
  try { return await fn(sent); } finally { globalThis.fetch = real; }
}

test('routes : /urgences/ et ses alias (dont /urgences des annonces) servis en 200, sans redirection', async () => {
  for (const path of ['/urgences/', '/urgences', '/urgences/index.html']) {
    const r = await worker.fetch(new Request(`https://${HOST}${path}`), { ASSETS }, { waitUntil() {} });
    assert.equal(r.status, 200, path);
    assert.match(await r.text(), /\/_variants\/urgences\/[ab]\.html/);
  }
  assert.equal(ALIASES['/urgences'], URG);
  assert.equal(Object.keys(REDIRECTS).some((k) => k.startsWith('/urgence')), false);
});

test('métadonnées propres à chaque page (aucune valeur générale codée en dur)', () => {
  const u = PAGES[URG], g = PAGES[GEN];
  assert.equal(u.pageId, '0a0fcd7b-94f9-49aa-8db4-5025b3047ca4');
  assert.deepEqual([u.slug, u.clinic, u.service, u.landingTag, u.webhookFormat], ['urgences', 'iberville', 'urgence', 'landing-urgence-votre-dentisterie', 'json']);
  assert.deepEqual([g.clinic, g.service, g.landingTag], ['iberville', 'general', undefined]);
  assert.notEqual(u.test.id, g.test.id); assert.notEqual(u.test.cookie, g.test.cookie);
  assert.deepEqual(u.test.weights, { a: 50, b: 50 });
});

test('cookie A/B de la générale sans effet sur l’urgence (et inversement)', () => {
  const page = PAGES[URG], url = new URL(`https://${HOST}${URG}`);
  const withGeneral = new Request(url, { headers: { cookie: `${PAGES[GEN].test.cookie}=b` } });
  assert.equal(assignVariant(withGeneral, url, page).setCookie, true);
  const withUrgence = new Request(url, { headers: { cookie: `${page.test.cookie}=a; ${PAGES[GEN].test.cookie}=b` } });
  assert.deepEqual(assignVariant(withUrgence, url, page), { variant: 'a', setCookie: false, forced: false });
});

test('contrat JSON urgence : clinique iberville, service et tag urgence, identifiants cohérents', () => {
  const page = PAGES[URG];
  const { clean } = validateLead({ 'nom_et_prénom': 'Personne Fictive', email_: 'fictif@example.invalid', 'numéro_de_téléphone': '4505550100', ab_variant: 'b', ab_test: page.test.id, landing_path: URG, event_id: 'dcub-fictive-urgence-0001' });
  const j = buildWebhookJson(clean, { host: HOST, pagePath: URG, pageUrl: `https://${HOST}${URG}`, clinic: page.clinic, service: page.service, landingTag: page.landingTag, pageId: page.pageId });
  assert.deepEqual([j.clinic, j.service, j.landing_tag, j.page_id, j.page_path], ['iberville', 'urgence', 'landing-urgence-votre-dentisterie', page.pageId, URG]);
  assert.deepEqual([j.full_name, j.email, j.phone, j.ab_test, j.ab_variant, j.event_id], ['Personne Fictive', 'fictif@example.invalid', '4505550100', 'vd-urgences-2026-10', 'b', 'dcub-fictive-urgence-0001']);
  const g = buildWebhookJson(clean, { clinic: PAGES[GEN].clinic, service: PAGES[GEN].service, landingTag: PAGES[GEN].landingTag });
  assert.equal('landing_tag' in JSON.parse(JSON.stringify(g)), false);
});

test('relais urgence : un envoi, test A/B fixé par le serveur, replay 409 sans second relais', () => withHook(async (sent) => {
  const { sql, DB } = db(), pending = [], ctx = { waitUntil(p) { pending.push(p); } };
  const env = { DB, DEDUPE_REQUIRED: '1', LEAD_DRY_RUN: '0', VISITOR_SALT: 'fictif', GHL_WEBHOOK_URL: 'https://hook.invalid/x' };
  const first = await worker.fetch(lead(), env, ctx);
  assert.deepEqual(await first.json(), { ok: true, accepted: true, qa: false });
  const j = JSON.parse(sent[0]);
  assert.deepEqual([j.ab_test, j.landing_tag, j.service, j.clinic], ['vd-urgences-2026-10', 'landing-urgence-votre-dentisterie', 'urgence', 'iberville']);
  assert.equal((await worker.fetch(lead(), env, ctx)).status, 409);
  assert.equal(sent.length, 1);
  await Promise.all(pending);
  const row = sql.prepare("SELECT page, test, variant FROM events WHERE kind='lead'").get();
  assert.deepEqual({ ...row }, { page: URG, test: 'vd-urgences-2026-10', variant: 'b' });
  sql.close();
}));

test('chemin ou variante inconnus : 422, aucun repli sur la générale ni relais', () => withHook(async (sent) => {
  const env = { LEAD_DRY_RUN: '0', GHL_WEBHOOK_URL: 'https://hook.invalid/x' }, ctx = { waitUntil() {} };
  for (const [extra, field] of [[{ landing_path: '/inconnue/' }, 'landing_path'], [{ landing_path: undefined }, 'landing_path'], [{ ab_variant: 'c' }, 'ab_variant'], [{ ab_variant: '' }, 'ab_variant']]) {
    const r = await worker.fetch(lead(extra), env, ctx);
    assert.equal(r.status, 422); assert.ok((await r.json()).fields.includes(field));
  }
  assert.equal(sent.length, 0);
}));

test('compteur : variante inconnue ignorée, page connue enregistrée sous son propre test', async () => {
  const { sql, DB } = db(), pending = [], ctx = { waitUntil(p) { pending.push(p); } };
  const ev = (body) => worker.fetch(new Request(`https://${HOST}/api/e`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 Chrome/141' }, body: JSON.stringify(body) }), { DB, VISITOR_SALT: 'fictif' }, ctx);
  await ev({ k: 'view', p: URG, v: 'z' }); await ev({ k: 'view', p: URG, v: 'a' }); await ev({ k: 'view', p: GEN, v: 'a' });
  await Promise.all(pending);
  assert.deepEqual(sql.prepare('SELECT page, test, variant FROM events ORDER BY page').all().map((r) => ({ ...r })),
    [{ page: GEN, test: 'vd-iberville-2026-10', variant: 'a' }, { page: URG, test: 'vd-urgences-2026-10', variant: 'a' }]);
  sql.close();
});

test('statistiques par page : expositions et formulaires séparés, page inconnue 404', async () => {
  const { sql, DB } = db(), day = '2026-10-06';
  const ins = sql.prepare('INSERT INTO events (ts,day,page,test,variant,kind,visitor,device,source,qa) VALUES (?,?,?,?,?,?,?,?,?,?)');
  [[1, URG, 'vd-urgences-2026-10', 'a', 'view', 'u1'], [2, URG, 'vd-urgences-2026-10', 'a', 'lead', 'u1'], [3, GEN, 'vd-iberville-2026-10', 'a', 'view', 'g1'], [4, GEN, 'vd-iberville-2026-10', 'a', 'view', 'g2'], [5, URG, 'vd-iberville-2026-10', 'a', 'lead', 'u1']]
    .forEach(([ts, page, t, v, k, vis]) => ins.run(ts, day, page, t, v, k, vis, 'mobile', 'google', 0));
  const get = (q) => renderStats(new Request(`https://${HOST}/stats?${q}`), { STATS_KEY: 'fictif', DB }, new URL(`https://${HOST}/stats?${q}`));
  const u = await (await get(`key=fictif&page=${encodeURIComponent(URG)}&from=${day}&to=${day}`)).text();
  assert.match(u, /test vd-urgences-2026-10/);
  assert.match(u, /<td><b>A<\/b><\/td><td>1<\/td><td>1<\/td><td>[^<]*<\/td><td>0<\/td><td>0<\/td><td><b>1<\/b><\/td><td>1<\/td><td><b>100\.0 %<\/b>/);
  const g = await (await get(`key=fictif&page=${encodeURIComponent(GEN)}&from=${day}&to=${day}`)).text();
  assert.match(g, /<td><b>A<\/b><\/td><td>2<\/td><td>2<\/td><td>[^<]*<\/td><td>0<\/td><td>0<\/td><td><b>0<\/b><\/td>/);
  assert.equal((await get('key=fictif&page=/inconnue/')).status, 404);
  sql.close();
});

test('aperçu (hôte de préversion, marqueur ou dry run) : CSP, aucun relais', () => withHook(async (sent) => {
  const env = { ASSETS, LEAD_DRY_RUN: '0', GHL_WEBHOOK_URL: 'https://hook.invalid/x' }, ctx = { waitUntil() {} };
  const page = await worker.fetch(new Request('https://preview.workers.dev/urgences/'), env, ctx);
  assert.match(page.headers.get('content-security-policy') || '', /connect-src 'self'/);
  for (const [r, extra] of [[lead({}, 'preview.workers.dev'), {}], [lead({ qa: '1' }), {}], [lead(), { LEAD_DRY_RUN: '1' }]]) {
    assert.equal((await (await worker.fetch(r, { ...env, ...extra }, ctx)).json()).dryRun, true);
  }
  assert.equal(sent.length, 0);
}));

test('pages construites : numéro HighLevel, formulaire, mesure dynamique, aucun tarif ni contenu Oralvie/Saint-Jean', () => {
  execFileSync(process.execPath, ['tools/build.mjs'], { cwd: new URL('..', import.meta.url), stdio: 'ignore' });
  for (const v of ['a', 'b']) {
    const f = new URL(`../dist/_variants/urgences/${v}.html`, import.meta.url);
    assert.ok(existsSync(f));
    const html = readFileSync(f, 'utf8');
    assert.deepEqual([...new Set(html.match(/href="tel:[^"]*"/g))], ['href="tel:+14503903135"']);
    assert.match(html, /id="vd-page"/); assert.match(html, /<form id="dc-form"[^>]*action="\/api\/lead"/); assert.match(html, /name="website"/);
    assert.match(html, /"pagePath":"\/urgences\/","variant":"[ab]","test":"vd-urgences-2026-10","clinic":"iberville","clinicId":"vd-iberville","service":"urgence"/);
    assert.match(html, /GTM-M29KWPM/);
    assert.doesNotMatch(html, /346-0102|unbounce\.com|cloudfront|oralvie|clkn\/|Dominique Laroche|St-Jean \(|\$199|\$457|\$130|\d+\s?\$|GTM-T3CBSLZ9|390-9968/i);
  }
  assert.match(readFileSync(new URL('../dist/_variants/urgences/b.html', import.meta.url), 'utf8'), /id="dc-actionbar"/);
  const gen = readFileSync(new URL('../dist/_variants/iberville/a.html', import.meta.url), 'utf8');
  assert.match(gen, /"pagePath":"\/","variant":"a","test":"vd-iberville-2026-10","clinic":"iberville","clinicId":"vd-iberville","service":"general"/);
});
