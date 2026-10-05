import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVariant, assignVariant, validateLead, buildWebhookJson, sourceOf, localDay } from '../src/worker.js';
import { twoProportion } from '../src/stats.js';
import { PAGES } from '../src/config.js';

const page = PAGES['/'];
const req = (cookie = '') => new Request('https://chez.votredentisterie.com/', { headers: cookie ? { cookie } : {} });

test('répartition pondérée', () => {
  assert.equal(pickVariant({ a: 50, b: 50 }, 0.0), 'a');
  assert.equal(pickVariant({ a: 50, b: 50 }, 0.49), 'a');
  assert.equal(pickVariant({ a: 50, b: 50 }, 0.5), 'b');
  assert.equal(pickVariant({ a: 50, b: 50 }, 0.999), 'b');
  assert.equal(pickVariant({ a: 100, b: 0 }, 0.99), 'a');
  let b = 0; for (let i = 0; i < 10000; i++) if (pickVariant({ a: 50, b: 50 }) === 'b') b++;
  assert.ok(b > 4700 && b < 5300, `répartition ${b}`);
});

test('le cookie garde la même variante; ?dc_variant force sans cookie', () => {
  const u = new URL('https://chez.votredentisterie.com/');
  assert.deepEqual(assignVariant(req('vd_ab_iberville=b'), u, page), { variant: 'b', setCookie: false, forced: false });
  assert.equal(assignVariant(req(), u, page).setCookie, true);
  assert.equal(assignVariant(req('vd_ab_iberville=z'), u, page).setCookie, true);
  const f = new URL('https://chez.votredentisterie.com/?dc_variant=a');
  assert.deepEqual(assignVariant(req('vd_ab_iberville=b'), f, page), { variant: 'a', setCookie: false, forced: true });
});

test('validation du formulaire', () => {
  const ok = validateLead({ 'nom_et_prénom': 'Marie Tremblay', email_: 'marie@example.com', 'numéro_de_téléphone': '(450) 555-1234', event_id: 'dcub-test0001' });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.spam, false);
  const bad = validateLead({ 'nom_et_prénom': 'M', email_: 'pas-un-courriel', 'numéro_de_téléphone': '123', event_id: 'dcub-test0001' });
  assert.deepEqual(bad.errors, ['nom', 'courriel', 'téléphone']);
  assert.equal(validateLead({ website: 'http://spam' }).spam, true);
  assert.equal(validateLead({ 'nom_et_prénom': 'x'.repeat(500) }).clean['nom_et_prénom'].length, 120);
});

test('le webhook JSON contient le lead, l\'attribution et la variante', () => {
  const { clean } = validateLead({ 'nom_et_prénom': 'Marie  Tremblay Roy', email_: 'marie@example.com', 'numéro_de_téléphone': '4505551234', utm_source: 'google', gclid: 'abc', ab_test: 'vd-iberville-2026-10', ab_variant: 'b', message__comment_pouvonsnous_vous_aider_: 'Nettoyage' });
  const body = buildWebhookJson(clean, { host: 'chez.votredentisterie.com', pagePath: '/', pageUrl: 'https://chez.votredentisterie.com/', clinic: page.clinic, pageId: page.pageId, now: new Date('2026-10-06T15:04:00Z') });
  assert.equal(body.clinic, 'iberville');
  assert.equal(body.page_id, page.pageId);
  assert.equal(body.first_name, 'Marie');
  assert.equal(body.last_name, 'Tremblay Roy');
  assert.equal(body.email, 'marie@example.com');
  assert.equal(body.phone, '4505551234');
  assert.equal(body.message, 'Nettoyage');
  assert.equal(body.utm_source, 'google');
  assert.equal(body.gclid, 'abc');
  assert.equal(body.ab_variant, 'b');
  assert.equal(body.submitted_at, '2026-10-06T15:04:00.000Z');
  assert.equal(page.webhookFormat, 'json');
});

test('source de trafic', () => {
  assert.equal(sourceOf({ us: 'Google', c: '', r: '' }), 'google');
  assert.equal(sourceOf({ us: '', c: 'gclid', r: '' }), 'google_ads');
  assert.equal(sourceOf({ us: '', c: 'fbclid', r: '' }), 'meta');
  assert.equal(sourceOf({ us: '', c: '', r: 'www.google.com' }), 'google_organic');
  assert.equal(sourceOf({ us: '', c: '', r: 'www.votredentisterie.com' }), 'site_principal');
  assert.equal(sourceOf({ us: '', c: '', r: '' }), 'direct');
});

test('jour en heure de Montréal', () => {
  assert.equal(localDay(Date.parse('2026-10-07T03:30:00Z')), '2026-10-06');
  assert.equal(localDay(Date.parse('2026-10-07T04:30:00Z')), '2026-10-07');
});

test('test de deux proportions', () => {
  const r = twoProportion(30, 1000, 50, 1000);
  assert.ok(r.pValue < 0.05);
  assert.ok(Math.abs(r.lift - 0.6667) < 0.01);
  assert.ok(twoProportion(5, 100, 6, 100).pValue > 0.5);
  assert.equal(twoProportion(0, 0, 1, 10), null);
});

// ---------------------------------------------------------------- Correctifs CMO du 1er octobre 2026 (même code que Confort)
import worker, { attrSafe } from '../src/worker.js';
const ctx = { waitUntil() {} };
const lead = (extra = {}) => new Request('https://chez.votredentisterie.com/api/lead', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ 'nom_et_prénom': 'Test QA', email_: 'qa@example.com', 'numéro_de_téléphone': '4505550100', landing_path: '/', ab_variant: 'a', event_id: 'dcub-test0001', ...extra })
});
async function withFetch(impl, fn) { const real = globalThis.fetch; globalThis.fetch = impl; try { return await fn(); } finally { globalThis.fetch = real; } }

for (const event_id of [undefined, '', 'schema_reference_only', 'dcub-short', 'wrongprefix-test0001']) {
  test(`identifiant rejeté avant le relais CRM : ${String(event_id)}`, async () => {
    let calls = 0;
    const response = await withFetch(async () => { calls++; return new Response('{}'); },
      () => worker.fetch(lead({ event_id }), { GHL_WEBHOOK_URL: 'https://hook.test/x' }, ctx));
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { ok: false, error: 'validation', fields: ['event_id'] });
    assert.equal(calls, 0);
  });
}

test('identifiant accepté conservé dans le relais CRM', async () => {
  let sent;
  const response = await withFetch(async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response('{}');
  }, () => worker.fetch(lead({ event_id: 'dcub-12345678-1234-4321-abcd-123456789012' }), { GHL_WEBHOOK_URL: 'https://hook.test/x' }, ctx));
  assert.equal(response.status, 200);
  assert.equal(sent.event_id, 'dcub-12345678-1234-4321-abcd-123456789012');
  assert.equal((await response.json()).accepted, true);
});

test('un seul envoi au webhook, même en cas d’échec', async () => {
  let n = 0;
  const r = await withFetch(async () => { n++; throw new Error('perdu'); }, () => worker.fetch(lead(), { GHL_WEBHOOK_URL: 'https://hook.test/x' }, ctx));
  assert.equal(n, 1); assert.equal(r.status, 502);
});

test('accepted seulement pour le relais de production; jamais pour robot ou dry run', async () => {
  const ok = await withFetch(async () => new Response('{}'), () => worker.fetch(lead(), { GHL_WEBHOOK_URL: 'https://hook.test/x' }, ctx));
  assert.deepEqual(await ok.json(), { ok: true, accepted: true, qa: false });
  const qa = await withFetch(async () => new Response('{}'), () => worker.fetch(lead({ qa: '1' }), { GHL_WEBHOOK_URL: 'https://hook.test/x' }, ctx));
  assert.deepEqual(await qa.json(), { ok: true, accepted: false, dryRun: true, qa: true });
  let n = 0;
  const spam = await withFetch(async () => { n++; return new Response(''); }, () => worker.fetch(lead({ website: 'x' }), { GHL_WEBHOOK_URL: 'https://hook.test/x' }, ctx));
  assert.deepEqual(await spam.json(), { ok: true, accepted: false }); assert.equal(n, 0);
  const dry = await worker.fetch(lead(), { LEAD_DRY_RUN: '1' }, ctx);
  assert.deepEqual(await dry.json(), { ok: true, accepted: false, dryRun: true, qa: true });
});

test('attribution : aucune coordonnée personnelle', () => {
  assert.equal(attrSafe('marie@example.com'), false); assert.equal(attrSafe('450-555-1234'), false);
  assert.equal(attrSafe('dentiste iberville'), true); assert.equal(attrSafe('120212345678901234'), true);
});


// Les appels ci-dessous sont tous simulés : aucun contact, webhook réel ou message patient.
for (const c of [
  { name: 'dry run avec un secret présent', env: { LEAD_DRY_RUN: '1' } },
  { name: 'marqueur QA avec un secret présent', extra: { qa: '1' } },
  { name: 'URL QA avec un secret présent', ref: 'https://preview.test/?dc_qa=1' },
  { name: 'aperçu de variante avec un secret présent', ref: 'https://preview.test/?dc_variant=b' }
]) {
  test(c.name + ' ne transmet aucune demande', async () => {
    let calls = 0;
    const request = lead(c.extra);
    if (c.ref) request.headers.set('referer', c.ref);
    const response = await withFetch(async () => {
      calls++;
      return new Response('{}');
    }, () => worker.fetch(request, { GHL_WEBHOOK_URL: 'https://hook.test/x', ...c.env }, ctx));
    assert.equal(calls, 0);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, accepted: false, dryRun: true, qa: true });
  });
}
test('la validation reste prioritaire en mode dry run', async () => {
  let calls = 0;
  const response = await withFetch(async () => { calls++; return new Response('{}'); },
    () => worker.fetch(lead({ email_: 'invalide' }), { GHL_WEBHOOK_URL: 'https://hook.test/x', LEAD_DRY_RUN: '1' }, ctx));
  assert.equal(calls, 0);
  assert.equal(response.status, 422);
});
