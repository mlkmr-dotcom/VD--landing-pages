/* Pages Unbounce historiques : image la plus nette selon le format et mise à l'échelle mobile.
   Mobile (≤ 600 px) : la mise en page de 320 px est agrandie à la largeur de l'écran (max 1,25), comme sur Unbounce.
   Mise en page seulement : aucune requête ni mesure. */
(function (w, d) {
  'use strict';
  function refresh() {
    var page = d.getElementById('vd-page'); if (!page) return;
    var mobile = w.innerWidth <= 600, cfg = w.__dcLp || {}, mw = cfg.mobileWidth || 320;
    page.querySelectorAll('img[data-hd-desktop]').forEach(function (im) {
      var src = im.getAttribute(mobile ? 'data-hd-mobile' : 'data-hd-desktop');
      if (src && im.getAttribute('src') !== src) im.setAttribute('src', src);
    });
    var root = d.getElementById('lp-pom-root'); if (!root) return;
    root.style.zoom = mobile ? String(Math.min(d.documentElement.clientWidth / mw, 1.25)) : '';
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', refresh, { once: true }); else refresh();
  w.addEventListener('resize', refresh); w.addEventListener('load', refresh, { once: true });
}(window, document));
