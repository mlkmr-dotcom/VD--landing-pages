/* Votre Dentisterie — landing pages runtime (Cloudflare).
 * Le formulaire est envoyé à /api/lead (Worker), qui le relaie au webhook HighLevel de VD Iberville.
 * - Succès affiché seulement après acceptation par le serveur (jamais au clic).
 * - Signal GTM vd_lp_form_success après acceptation (à raccorder aux conversions Google Ads dans GTM-M29KWPM).
 * - Compteur interne : beacons first-party vers /api/e (aucune donnée personnelle).
 */
(function (w, d) {
  'use strict';
  var cfg = w.__dcLp || {};
  var PAGE_ID = cfg.pageId || '';
  var PATH = cfg.pagePath || '/';
  var VARIANT = cfg.variant || 'a';
  var TEST = cfg.test || '';
  var CLICK_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid'];
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var STORE = 'dc_lp_attr_v1';
  // Aperçus (?dc_variant=…) et tests internes (?dc_qa=1) : exclus des statistiques.
  var QA = /(?:^|[?&])(?:dc_qa=1|dc_variant=)/.test(w.location.search);

  // Attribution : valeurs bornées, jamais de courriel ni de numéro de téléphone.
  function safe(value) {
    if (!value || value.length > 250 || /[<>\r\n{}@]/.test(value)) return '';
    if (/(?:\(\d{3}\)|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b)/.test(value)) return '';
    return value;
  }

  // Attribution : paramètres de l'URL d'arrivée, gardés pour l'onglet (sessionStorage).
  var attribution = (function () {
    var q = new URLSearchParams(w.location.search), out = {}, found = false;
    UTM_KEYS.concat(CLICK_KEYS).forEach(function (k) {
      var v = safe(q.get(k));
      if (v) { out[k] = v; found = true; }
    });
    try {
      if (found) w.sessionStorage.setItem(STORE, JSON.stringify(out));
      else out = JSON.parse(w.sessionStorage.getItem(STORE) || '{}') || {};
    } catch (_) { /* stockage indisponible : on garde l'URL courante */ }
    return out;
  }());

  function refHost() {
    try { var h = d.referrer ? new URL(d.referrer).hostname : ''; return h === w.location.hostname ? '' : h; } catch (_) { return ''; }
  }

  // ---------- Compteur interne ----------
  function beacon(kind) {
    try {
      var body = JSON.stringify({
        k: kind, p: PATH, v: VARIANT, t: TEST,
        us: attribution.utm_source || '', um: attribution.utm_medium || '',
        uc: attribution.utm_campaign || '',
        c: CLICK_KEYS.filter(function (k) { return !!attribution[k]; })[0] || '',
        r: refHost(),
        qa: QA ? 1 : 0
      });
      if (w.navigator.sendBeacon) {
        w.navigator.sendBeacon('/api/e', new Blob([body], { type: 'application/json' }));
      } else {
        w.fetch('/api/e', { method: 'POST', body: body, keepalive: true,
          headers: { 'content-type': 'application/json' } });
      }
    } catch (_) { /* ne jamais bloquer la page */ }
  }

  // ---------- Formulaire ----------
  function form() { return d.querySelector('#vd-page form#dc-form'); }

  function setHidden(f, name, value) {
    var el = f.elements.namedItem(name);
    if (!el) {
      el = d.createElement('input');
      el.type = 'hidden';
      el.name = name;
      f.appendChild(el);
    }
    if (el.type === 'hidden') el.value = value || '';
  }

  function fillHidden(f) {
    UTM_KEYS.concat(CLICK_KEYS).forEach(function (k) { setHidden(f, k, attribution[k] || ''); });
    setHidden(f, 'landing_path', PATH);
    setHidden(f, 'ab_variant', VARIANT);
    setHidden(f, 'ab_test', TEST);
  }

  function newId() {
    if (w.crypto && typeof w.crypto.randomUUID === 'function') return 'dcub-' + w.crypto.randomUUID();
    return 'dcub-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function signalSuccess(eventId) {
    var payload = {
      event: 'vd_lp_form_success',
      event_id: eventId,
      clinic_id: 'vd-iberville',
      service: 'general',
      language: 'fr',
      page_path: PATH,
      lp_page_id: PAGE_ID,
      tracking_schema: 'vd_lp_success_v1',
      ab_test: TEST,
      ab_variant: VARIANT
    };
    try { w.dataLayer = w.dataLayer || []; w.dataLayer.push(payload); } catch (_) {}
  }

  function showError(show) {
    var e = d.getElementById('dc-form-error');
    if (e) e.hidden = !show;
  }

  function focusForm() {
    var f = form();
    if (!f || f.hidden) return;
    var field = f.querySelector('input:not([type=hidden]):not([tabindex="-1"])');
    if (field) field.focus({ preventScroll: true });
  }

  var sending = false;
  function onSubmit(event) {
    var f = form();
    if (!f || event.target !== f) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (sending) return;
    if (typeof f.reportValidity === 'function' && !f.reportValidity()) return;
    fillHidden(f);
    var data = {};
    Array.prototype.forEach.call(f.elements, function (el) {
      if (!el.name || el.disabled || el.type === 'submit' || el.type === 'button') return;
      data[el.name] = String(el.value || '').slice(0, 2000);
    });
    var eventId = newId();
    data.event_id = eventId;
    if (QA) data.qa = '1';
    var button = f.querySelector('button[type=submit]');
    sending = true;
    if (button) button.disabled = true;
    showError(false);
    w.fetch('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: !!(r.ok && j && j.ok), j: j || {} }; });
    }).then(function (res) {
      if (!res.ok) throw new Error('rejected');
      var confirmation = d.getElementById('dc-success');
      f.hidden = true;
      if (confirmation) {
        confirmation.hidden = false;
        confirmation.focus({ preventScroll: true });
        confirmation.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      // Conversion seulement si le relais de production a accepté (ni robot, ni dry run, ni test interne).
      if (res.j.accepted === true && !res.j.dryRun && !res.j.qa && !QA) signalSuccess(eventId);
    }).catch(function () {
      showError(true);
    }).then(function () {
      sending = false;
      if (button) button.disabled = false;
    });
  }

  function init() {
    var page = d.getElementById('vd-page');
    if (!page) return;
    page.dataset.uiReady = 'true';
    d.documentElement.lang = page.dataset.language || 'fr-CA';
    var f = form();
    if (f) {
      fillHidden(f);
      var started = false;
      f.addEventListener('focusin', function () {
        if (!started) { started = true; beacon('form_start'); }
      });
    }
    w.addEventListener('submit', onSubmit, true);
    d.addEventListener('click', function (event) {
      var t = event.target && event.target.closest ? event.target : null;
      if (!t) return;
      var tel = t.closest('a[href^="tel:"]');
      if (tel) beacon('tel');
      var cta = t.closest('[data-dc-action="appointment"]');
      if (cta) { beacon('cta'); w.setTimeout(focusForm, 350); }
      if (t.closest('[data-dc-new-request]')) {
        var fm = form(), confirmation = d.getElementById('dc-success');
        if (!fm || !confirmation) return;
        fm.reset();
        confirmation.hidden = true;
        fm.hidden = false;
        fillHidden(fm);
        focusForm();
      }
    });
    beacon('view');
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}(window, document));
