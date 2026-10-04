/* Bannière de consentement (Loi 25) — identique dans DC--landing-pages et VD--landing-pages.
 * Chargée seulement si measure.consentBanner est vrai (page.json).
 * - Tout est refusé par défaut (le code de <head> a déjà posé Google Consent Mode v2 « denied »).
 * - « Tout refuser » et « Tout accepter » ont exactement le même poids visuel.
 * - Deux catégories : mesure d'audience (GA4, Clarity) et publicité (Google Ads, Meta).
 * - Choix mémorisé 12 mois dans le témoin fonctionnel dc_consent (v1.aX.mY), modifiable en tout temps
 *   par tout élément [data-dc-consent-open] (ou le lien ajouté en bas de page).
 */
(function (w, d) {
  'use strict';
  var cfg = (w.__dcLp && w.__dcLp.measure) || {};
  if (!cfg.consentBanner) return;
  var state = w.__dcConsent || { decided: false, analytics: false, marketing: false };
  var COOKIE = 'dc_consent';
  var t = cfg.consentTheme || {};
  var ink = t.ink || '#1f2937', bg = t.bg || '#ffffff', line = t.line || 'rgba(15,23,42,.14)', accent = t.accent || ink;

  function g() { w.dataLayer = w.dataLayer || []; w.dataLayer.push(arguments); }

  function apply(analytics, marketing, source) {
    var a = analytics ? 'granted' : 'denied', m = marketing ? 'granted' : 'denied';
    g('consent', 'update', { analytics_storage: a, ad_storage: m, ad_user_data: m, ad_personalization: m });
    try { if (typeof w.clarity === 'function') w.clarity('consentv2', { ad_Storage: m, analytics_Storage: a }); } catch (_) {}
    var exp = new Date(Date.now() + 365 * 864e5).toUTCString();
    d.cookie = COOKIE + '=v1.a' + (analytics ? 1 : 0) + '.m' + (marketing ? 1 : 0) + '.' + Date.now().toString(36) +
      '; Path=/; Expires=' + exp + '; SameSite=Lax' + (w.location.protocol === 'https:' ? '; Secure' : '');
    state = { decided: true, analytics: !!analytics, marketing: !!marketing };
    w.__dcConsent = Object.assign({ banner: true }, state);
    try { w.dataLayer.push({ event: 'dc_consent_update', consent_analytics: a, consent_marketing: m, consent_source: source }); } catch (_) {}
  }

  var css = '' +
    '.dcc{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:560px;margin:0 auto;background:' + bg + ';color:' + ink + ';' +
    'border:1px solid ' + line + ';border-radius:14px;box-shadow:0 10px 30px rgba(15,23,42,.18);padding:18px 18px 16px;font:14px/1.5 Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;' +
    'opacity:0;transform:translateY(8px);transition:opacity .2s ease-out,transform .2s ease-out}' +
    '.dcc.in{opacity:1;transform:none}' +
    '.dcc h2{font-size:16px;line-height:1.3;font-weight:600;margin:0 0 6px;font-family:inherit;color:inherit;letter-spacing:0;text-transform:none}' +
    '.dcc p{margin:0 0 12px}.dcc a{color:inherit;text-decoration:underline}' +
    '.dcc .row{display:flex;gap:8px;flex-wrap:wrap}' +
    '.dcc button{font-size:14px;line-height:1;font-weight:600;font-family:inherit;letter-spacing:0;text-transform:none;min-height:44px;padding:0 16px;border-radius:10px;cursor:pointer}' +
    '.dcc .main{flex:1 1 120px;background:' + accent + ';color:' + bg + ';border:1px solid ' + accent + '}' +
    '.dcc .link{background:none;border:0;color:inherit;text-decoration:underline;padding:0 4px;font-weight:500}' +
    '.dcc fieldset{border:0;margin:0 0 12px;padding:0}.dcc label{display:flex;gap:10px;align-items:flex-start;margin:0 0 8px;cursor:pointer}' +
    '.dcc input{width:18px;height:18px;margin:2px 0 0;accent-color:' + accent + '}.dcc small{display:block;opacity:.75}' +
    '.dcc button:focus-visible,.dcc input:focus-visible{outline:2px solid ' + accent + ';outline-offset:2px}' +
    '.dcc-reopen{display:block;margin:12px auto 20px;background:none;border:0;font:13px/1.4 system-ui,Arial,sans-serif;color:inherit;opacity:.7;text-decoration:underline;cursor:pointer}' +
    '@media (prefers-reduced-motion:reduce){.dcc{transition:none}}';

  var box = null;
  function el(tag, attrs, html) {
    var e = d.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html) e.innerHTML = html;
    return e;
  }

  function close() {
    if (!box) return;
    var b = box; box = null;
    b.classList.remove('in');
    w.setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 220);
  }

  function open(detailed) {
    if (box) close();
    if (!d.getElementById('dcc-css')) d.head.appendChild(el('style', { id: 'dcc-css' }, css));
    var privacy = cfg.privacyUrl ? ' <a href="' + cfg.privacyUrl + '" target="_blank" rel="noopener">Politique de confidentialité</a>' : '';
    box = el('section', { 'class': 'dcc', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'dcc-t', 'data-clarity-mask': 'True' });
    box.innerHTML = '<h2 id="dcc-t">Vos choix de confidentialité</h2>' +
      '<p>Avec votre accord, nous utilisons des témoins pour mesurer la fréquentation de cette page et l’efficacité de nos publicités. ' +
      'Ils restent désactivés tant que vous n’avez pas choisi.' + privacy + '</p>' +
      (detailed ?
        '<fieldset><legend class="dcc-sr" style="position:absolute;left:-9999px">Catégories</legend>' +
        '<label><input type="checkbox" checked disabled><span>Nécessaires<small>Fonctionnement de la page et version affichée. Toujours actifs.</small></span></label>' +
        '<label><input type="checkbox" id="dcc-a"' + (state.analytics ? ' checked' : '') + '><span>Mesure d’audience<small>Google Analytics, Microsoft Clarity (enregistrement anonymisé de la navigation, champs masqués).</small></span></label>' +
        '<label><input type="checkbox" id="dcc-m"' + (state.marketing ? ' checked' : '') + '><span>Publicité<small>Google Ads, Meta : mesurer les résultats de nos annonces.</small></span></label>' +
        '</fieldset><div class="row"><button type="button" class="main" data-c="save">Enregistrer mes choix</button></div>'
        :
        '<div class="row"><button type="button" class="main" data-c="none">Tout refuser</button>' +
        '<button type="button" class="main" data-c="all">Tout accepter</button></div>' +
        '<div class="row" style="margin-top:8px"><button type="button" class="link" data-c="more">Personnaliser</button></div>');
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button[data-c]') : null;
      if (!b) return;
      var c = b.getAttribute('data-c');
      if (c === 'more') { open(true); var f = d.getElementById('dcc-a'); if (f) f.focus(); return; }
      if (c === 'all') apply(true, true, 'banner_all');
      else if (c === 'none') apply(false, false, 'banner_none');
      else if (c === 'save') apply(!!(d.getElementById('dcc-a') || {}).checked, !!(d.getElementById('dcc-m') || {}).checked, 'banner_custom');
      close();
    });
    d.body.appendChild(box);
    w.requestAnimationFrame(function () { w.requestAnimationFrame(function () { if (box) box.classList.add('in'); }); });
  }

  function init() {
    var openers = d.querySelectorAll('[data-dc-consent-open]');
    Array.prototype.forEach.call(openers, function (o) { o.hidden = false; });
    if (!openers.length) {
      if (!d.getElementById('dcc-css')) d.head.appendChild(el('style', { id: 'dcc-css' }, css));
      var r = el('button', { type: 'button', 'class': 'dcc-reopen', 'data-dc-consent-open': '' }, 'Préférences de témoins');
      d.body.appendChild(r);
    }
    d.addEventListener('click', function (ev) {
      var o = ev.target.closest ? ev.target.closest('[data-dc-consent-open]') : null;
      if (o) { ev.preventDefault(); open(true); }
    });
    if (!state.decided) open(false);
  }

  w.dcConsent = { open: function () { open(true); }, get: function () { return state; } };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}(window, document));
