import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bayes, srm } from '../src/abstats.js';
import { measureHead } from '../tools/measure-head.mjs';
import { validateLead } from '../src/worker.js';

test('bayes : sans écart, P(B > A) proche de 50 % et résultat stable', () => {
  const x = bayes(30, 300, 30, 300);
  assert.ok(x.probBBeatsA > 0.4 && x.probBBeatsA < 0.6, String(x.probBBeatsA));
  assert.deepEqual(bayes(30, 300, 30, 300), x);
});

test('bayes : écart net détecté, perte attendue faible pour le gagnant', () => {
  const x = bayes(20, 400, 60, 400);
  assert.ok(x.probBBeatsA > 0.99);
  assert.ok(x.expectedLossB < 0.001);
  assert.ok(x.liftLow > 0.5 && x.liftMedian > 1.5);
  assert.equal(bayes(0, 0, 1, 10), null);
});

test('contrôle du partage du trafic (SRM)', () => {
  assert.ok(srm({ a: 500, b: 500 }, { a: 50, b: 50 }).pValue > 0.9);
  assert.ok(srm({ a: 600, b: 400 }, { a: 50, b: 50 }).pValue < 0.001);
  assert.equal(srm({ a: 10, b: 12 }, { a: 50, b: 50 }), null);
  assert.equal(srm({ a: 100 }, { a: 100 }), null);
});

test('code de mesure : rien sans Clarity ni bannière (statu quo)', () => {
  assert.equal(measureHead({ measure: {}, test: 't', variant: 'a', pagePath: '/' }), '');
  assert.equal(measureHead({ measure: { clarity: 'bad id!' }, test: 't', variant: 'a', pagePath: '/' }), '');
});

test('code de mesure : Clarity sans témoin par défaut, consentement Google seulement avec la bannière', () => {
  const c = measureHead({ measure: { clarity: 'abc123xyz' }, test: 'general-2026-10', variant: 'b', pagePath: '/general/' });
  assert.match(c, /clarity\.ms\/tag\//);
  assert.match(c, /consentv2/);
  assert.match(c, /"banner":false/);
  const b = measureHead({ measure: { consentBanner: true }, test: 't', variant: 'a', pagePath: '/' });
  assert.match(b, /'consent','default'/);
  assert.doesNotMatch(b, /clarity\.ms/);
});

test('event_id transmis seulement au bon format', () => {
  const base = { 'nom_et_prénom': 'Test QA', email_: 'qa@example.com', 'numéro_de_téléphone': '450 555 0100' };
  assert.equal(validateLead({ ...base, event_id: 'dcub-0b6f3c1e-7d2a-4f3e-9a7b-1c2d3e4f5a6b' }).clean.event_id, 'dcub-0b6f3c1e-7d2a-4f3e-9a7b-1c2d3e4f5a6b');
  assert.equal(validateLead({ ...base, event_id: 'x@y.com' }).clean.event_id, '');
});
