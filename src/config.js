// Configuration des pages, des tests A/B et des redirections de chez.votredentisterie.com.
// Toute modification passe par GitHub (historique + aperçu avant production).

export const SITE = {
  host: 'chez.votredentisterie.com',
  mainSite: 'https://www.votredentisterie.com'
};

export const PAGES = {
  '/': {
    slug: 'iberville',
    pageId: 'vd-iberville-general',
    pageName: 'VD Iberville — Dentisterie générale',
    clinic: 'iberville',
    // Nouveau workflow HighLevel (location VD Iberville) : charge utile JSON simple.
    webhookFormat: 'json',
    webhookVariant: 'a',
    test: {
      id: 'vd-iberville-2026-10',
      cookie: 'vd_ab_iberville',
      // Poids en pourcentage. Pour arrêter le test : { a: 100 } ou { b: 100 }.
      weights: { a: 50, b: 50 }
    }
  }
};

// Pages statiques (sans test).
export const STATIC_PAGES = {
  '/confidentialite': '/_pages/confidentialite.html',
  '/confidentialite/': '/_pages/confidentialite.html'
};

export const ALIASES = {
  '/index.html': '/'
};

// Anciennes pages Unbounce de chez.votredentisterie.com (≈ 0 visite en septembre 2026).
// 302 tant que la liste n'est pas validée ; passer à 301 ensuite. Les paramètres d'URL sont conservés.
export const REDIRECTS = {
  '/fb': { to: '/', status: 301 },
  '/st-jean': { to: 'https://www.votredentisterie.com/cliniques', status: 302 },
  '/urgences': { to: 'https://www.votredentisterie.com/soins-dentaires/urgence', status: 302 },
  '/implants': { to: 'https://www.votredentisterie.com/soins-dentaires/implant', status: 302 },
  '/implants/fb': { to: 'https://www.votredentisterie.com/soins-dentaires/implant', status: 302 },
  '/invisalign-fr': { to: 'https://www.votredentisterie.com/soins-dentaires/invisalign', status: 302 },
  '/cdcp': { to: '/', status: 302 }
};

export const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|adsbot|mediapartners|google-read-aloud|bingpreview|petalbot|yandex|baidu|semrush|ahrefs|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp|httpclient|scrapy|phantom|puppeteer|playwright|selenium/i;

export const EVENT_KINDS = ['view', 'cta', 'tel', 'form_start', 'engaged', 'form_invalid'];
