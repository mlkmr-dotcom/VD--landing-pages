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
  var previewParams = new URLSearchParams(w.location.search);
  var QA = previewParams.get('dc_qa') === '1' || previewParams.has('dc_variant');

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

  var ENTRY_REF = refHost(); // même référent pour la visite et sa demande

  // ---------- Compteur interne ----------
  function beacon(kind) {
    try {
      var body = JSON.stringify({
        k: kind, p: PATH, v: VARIANT, t: TEST,
        us: attribution.utm_source || '', um: attribution.utm_medium || '',
        uc: attribution.utm_campaign || '',
        c: CLICK_KEYS.filter(function (k) { return !!attribution[k]; })[0] || '',
        r: ENTRY_REF,
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

  // ---------- Mesure : un seul point d'entrée pour chaque interaction ----------
  // - compteur interne D1 (source de vérité du test A/B) ;
  // - Microsoft Clarity (événement + session prioritaire pour les demandes et les appels) ;
  // - dataLayer « lp_interaction » (GTM) et, si la page parle à GA4 directement, un événement GA4.
  // Les tests internes et aperçus ne vont ni dans GA4 ni dans GTM (Clarity les marque « qa »).
  var MEASURE = cfg.measure || {};
  var D1_KINDS = { view: 1, cta: 1, tel: 1, form_start: 1, engaged: 1, form_invalid: 1 };
  var GA4_NAMES = { cta: 'lp_cta_click', tel: 'lp_tel_click', form_start: 'lp_form_start', engaged: 'lp_engaged',
    form_invalid: 'lp_form_invalid', lead_error: 'lp_lead_error' };
  function track(kind, extra) {
    if (D1_KINDS[kind]) beacon(kind);
    try {
      if (typeof w.clarity === 'function' && kind !== 'view') {
        w.clarity('event', kind === 'lead' ? 'lead_accepted' : kind);
        if (kind === 'lead' || kind === 'tel') w.clarity('upgrade', kind);
      }
    } catch (_) {}
    if (QA || kind === 'view' || kind === 'lead') return;
    var params = { interaction: kind, ab_test: TEST, ab_variant: VARIANT, page_path: PATH };
    if (extra) for (var x in extra) params[x] = extra[x];
    try { w.dataLayer = w.dataLayer || []; w.dataLayer.push(Object.assign({ event: 'lp_interaction' }, params)); } catch (_) {}
    try {
      if (MEASURE.ga4Direct && typeof w.gtag === 'function' && GA4_NAMES[kind]) {
        var p = Object.assign({ send_to: MEASURE.ga4Direct }, params);
        delete p.interaction;
        w.gtag('event', GA4_NAMES[kind], p);
      }
    } catch (_) {}
  }
  w.dcLpTrack = track;

  // Visite « engagée » : moitié de la page atteinte ou 30 s de lecture (onglet visible). Une fois par page vue.
  function watchEngagement() {
    var done = false, visibleMs = 0, last = Date.now();
    function fire() { if (done) return; done = true; track('engaged'); cleanup(); }
    function onScroll() {
      var h = Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0) - w.innerHeight;
      if (h > 0 && (w.scrollY || w.pageYOffset) / h >= 0.5) fire();
    }
    var timer = w.setInterval(function () {
      var now = Date.now();
      if (d.visibilityState === 'visible') visibleMs += now - last;
      last = now;
      if (visibleMs >= 30000) fire();
    }, 1000);
    function cleanup() { w.clearInterval(timer); w.removeEventListener('scroll', onScroll); }
    w.addEventListener('scroll', onScroll, { passive: true });
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
    setHidden(f, 'referrer_host', ENTRY_REF);
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

  var duplicateNotice = false;
  function showError(show) {
    var e = d.getElementById('dc-form-error');
    if (e) {
      if (show && e.firstChild && e.firstChild.nodeType === 3)
        e.firstChild.nodeValue = duplicateNotice
          ? 'Une demande avec cette référence a déjà été tentée. Pour vérifier sa réception, appelez-nous au '
          : 'Nous n’avons pas pu confirmer la réception de votre demande. Veuillez nous appeler au ';
      e.hidden = !show;
    }
  }

  function focusForm() {
    var f = form();
    if (!f || f.hidden) return;
    var field = f.querySelector('input:not([type=hidden]):not([tabindex="-1"])');
    if (field) field.focus({ preventScroll: true });
  }

  var sending = false;
  var lastRequestBody = '', lastRequestId = ''; // mémoire de la page seulement
  function onSubmit(event) {
    var f = form();
    if (!f || event.target !== f) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (sending) return;
    if (typeof f.reportValidity === 'function' && !f.reportValidity()) return; // compté par l'écouteur « invalid »
    fillHidden(f);
    var data = {};
    Array.prototype.forEach.call(f.elements, function (el) {
      if (!el.name || el.disabled || el.type === 'submit' || el.type === 'button') return;
      data[el.name] = String(el.value || '').slice(0, 2000);
    });
    var requestBody = JSON.stringify(data);
    if (requestBody !== lastRequestBody) { lastRequestBody = requestBody; lastRequestId = newId(); }
    var eventId = lastRequestId;
    data.event_id = eventId;
    if (QA) data.qa = '1';
    var button = f.querySelector('button[type=submit]');
    sending = true;
    if (button) button.disabled = true;
    duplicateNotice = false;
    showError(false);
    w.fetch('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: !!(r.ok && j && j.ok), j: j || {} }; });
    }).then(function (res) {
      duplicateNotice = res.j.error === 'duplicate_request';
      if (!res.ok || (res.j.accepted !== true && !QA && !res.j.dryRun && !res.j.qa)) throw new Error('rejected');
      var confirmation = d.getElementById('dc-success');
      f.hidden = true;
      if (confirmation) {
        if (QA || res.j.dryRun || res.j.qa) {
          var qaTitle = confirmation.querySelector('h3');
          var qaNote = confirmation.querySelector('p');
          if (qaTitle) qaTitle.textContent = 'Essai effectué — aucune demande envoyée.';
          if (qaNote) qaNote.textContent = 'Cet aperçu est en mode essai. Aucun rendez-vous ni message patient n’a été créé.';
        }
        confirmation.hidden = false;
        confirmation.focus({ preventScroll: true });
        confirmation.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      // Conversion seulement si le relais de production a accepté (ni robot, ni dry run, ni test interne).
      if (res.j.accepted === true && !res.j.dryRun && !res.j.qa && !QA) {
        signalSuccess(eventId);
        track('lead');
      }
    }).catch(function () {
      showError(true);
      track('lead_error');
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
      f.setAttribute('data-clarity-mask', 'True');
      // Validation native du navigateur : l'événement submit n'est pas émis si un champ est invalide.
      var lastInvalid = 0;
      f.addEventListener('invalid', function (ev) {
        var now = Date.now();
        if (now - lastInvalid < 1000) return;
        lastInvalid = now;
        track('form_invalid', { field: ev.target && ev.target.name ? String(ev.target.name).slice(0, 40) : '' });
      }, true);
      fillHidden(f);
      var started = false;
      f.addEventListener('focusin', function () {
        if (!started) { started = true; track('form_start'); }
      });
    }
    w.addEventListener('submit', onSubmit, true);
    d.addEventListener('click', function (event) {
      var t = event.target && event.target.closest ? event.target : null;
      if (!t) return;
      var tel = t.closest('a[href^="tel:"]');
      if (tel) track('tel');
      var cta = t.closest('[data-dc-action="appointment"]');
      if (cta) { track('cta'); w.setTimeout(focusForm, 350); }
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
    track('view');
    watchEngagement();
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}(window, document));

