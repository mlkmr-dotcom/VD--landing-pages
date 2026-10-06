// Worker Cloudflare — landing pages de Votre Dentisterie (chez.votredentisterie.com).
// Rôles : 1) A/B testing par cookie ; 2) relais du formulaire vers le webhook HighLevel ;
// 3) compteur interne (visites, visiteurs, demandes, clics) ; 4) redirections ; 5) tableau de bord /stats.
import { ensureSchema } from './schema.js';
import { claimReceipt, finishReceipt } from './receipt.js';
import { PAGES, ALIASES, REDIRECTS, BOT_UA, EVENT_KINDS, SITE, STATIC_PAGES } from './config.js';
import { renderStats } from './stats.js';

const ONE_MONTH = 60 * 60 * 24 * 30;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let path = url.pathname;
    try {
      if (path === '/api/lead') return await handleLead(request, env, ctx, url);
      if (path === '/api/e') return await handleEvent(request, env, ctx);
      if (path === '/stats' || path === '/stats/') return await renderStats(request, env, url);
      if (path === '/healthz') return json({ ok: true, ts: Date.now() });
      if (path.startsWith('/_variants/') || path.startsWith('/_pages/') || path === '/_build.json') return notFound();

      if (ALIASES[path]) path = ALIASES[path];
      if (PAGES[path]) return await servePage(request, env, url, path);
      if (STATIC_PAGES[path]) {
        const res = await env.ASSETS.fetch(new Request(new URL(STATIC_PAGES[path], url.origin).toString()));
        return new Response(res.body, { status: res.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-robots-tag': 'noindex' } });
      }

      const r0 = REDIRECTS[path] || REDIRECTS[path.replace(/\/+$/, '')];
      // Redirections vers une autre adresse : actives seulement si REDIRECTS_ENABLED = "1" (après validation).
      const redirect = r0 && (r0.to.startsWith('/') || env.REDIRECTS_ENABLED === '1') ? r0 : null;
      if (redirect) {
        const target = new URL(redirect.to, url.origin);
        url.searchParams.forEach((v, k) => { if (!target.searchParams.has(k)) target.searchParams.set(k, v); });
        return Response.redirect(target.toString(), redirect.status);
      }

      if (path.startsWith('/assets/')) {
        const res = await env.ASSETS.fetch(request);
        if (res.status !== 200) return res;
        const headers = new Headers(res.headers);
        // Fichiers CSS/JS avec empreinte : cache long. Images : 7 jours.
        headers.set('cache-control', /\.[0-9a-f]{10}\.(css|js)$/.test(path)
          ? 'public, max-age=31536000, immutable' : 'public, max-age=604800');
        return new Response(res.body, { status: res.status, headers });
      }
      return notFound();
    } catch (err) {
      console.error('worker_error', path, err && err.stack || String(err));
      return new Response('Erreur temporaire', { status: 500 });
    }
  }
};

// ---------------------------------------------------------------- A/B
export function pickVariant(weights, rand = Math.random()) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rand * total;
  for (const [v, w] of entries) { if ((x -= w) < 0) return v; }
  return entries[entries.length - 1][0];
}

export function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function assignVariant(request, url, page) {
  const { weights, cookie } = page.test;
  const forced = url.searchParams.get('dc_variant');
  if (forced && Object.prototype.hasOwnProperty.call(weights, forced)) return { variant: forced, setCookie: false, forced: true };
  const existing = readCookie(request, cookie);
  if (existing && weights[existing] > 0) return { variant: existing, setCookie: false, forced: false };
  return { variant: pickVariant(weights), setCookie: true, forced: false };
}

// L’aperçu est isolé des plateformes de mesure, indépendamment des balises GTM publiées.
function isolatedPreview(request, env) {
  const url = new URL(request.url);
  let refIsPreview = false;
  try { const ref = new URL(request.headers.get('referer')); refIsPreview = ref.searchParams.get('dc_qa') === '1' || ref.searchParams.has('dc_variant'); } catch (_) {}
  return url.hostname !== SITE.host || env.LEAD_DRY_RUN === '1' || url.searchParams.get('dc_qa') === '1' || url.searchParams.has('dc_variant') || refIsPreview;
}

async function servePage(request, env, url, path) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
  const page = PAGES[path];
  const { variant, setCookie } = assignVariant(request, url, page);
  const assetUrl = new URL(`/_variants/${page.slug}/${variant}.html`, url.origin);
  const res = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: 'GET' }));
  if (res.status !== 200) return new Response('Page indisponible', { status: 502 });
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'private, no-store',
    'vary': 'Cookie',
    'x-robots-tag': 'noindex, nofollow',
    'x-dc-variant': variant,
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-content-type-options': 'nosniff'
  });
  if (isolatedPreview(request, env)) {
    headers.set('content-security-policy', "script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; object-src 'none'");
  }
  if (setCookie) {
    headers.append('set-cookie', `${page.test.cookie}=${variant}; Path=/; Max-Age=${ONE_MONTH}; Secure; SameSite=Lax`);
  }
  return new Response(request.method === 'HEAD' ? null : res.body, { status: 200, headers });
}

// ---------------------------------------------------------------- Formulaire → HighLevel
const FIELD_LIMITS = {
  'nom_et_prénom': 120, 'email_': 254, 'numéro_de_téléphone': 40,
  'message__comment_pouvonsnous_vous_aider_': 2000,
  utm_source: 250, utm_medium: 250, utm_campaign: 250, utm_content: 250, utm_term: 250,
  gclid: 250, gbraid: 250, wbraid: 250, fbclid: 250, msclkid: 250,
  landing_path: 100, ab_variant: 10, ab_test: 60, referrer_host: 253,
  // Identifiant de la demande (aussi ID de transaction de la conversion Ads) : relie navigateur, Ads, GA4 et HighLevel.
  event_id: 80
};

const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid'];
// Attribution et compteur : jamais de courriel, de numéro de téléphone ni de balisage.
export function attrSafe(v) {
  if (!v) return true;
  if (/[<>{}@]/.test(v)) return false;
  if (/(?:\(\d{3}\)|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b)/.test(v)) return false;
  return true;
}

export function validateLead(input) {
  const clean = {};
  for (const [k, max] of Object.entries(FIELD_LIMITS)) {
    const v = typeof input[k] === 'string' ? input[k].trim().slice(0, max) : '';
    clean[k] = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  }
  for (const k of ATTR_KEYS) if (!attrSafe(clean[k])) clean[k] = '';
  if (!/^dcub-[A-Za-z0-9-]{8,70}$/.test(clean.event_id)) clean.event_id = '';
  const errors = [];
  if (clean['nom_et_prénom'].length < 2) errors.push('nom');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean['email_'])) errors.push('courriel');
  const digits = clean['numéro_de_téléphone'].replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) errors.push('téléphone');
  // Le raccord CRM rejette une demande sans cet identifiant. Ne pas annoncer
  // un succès lorsque le workflow ne peut pas traiter la soumission.
  if (!clean.event_id) errors.push('event_id');
  return { clean, errors, spam: typeof input.website === 'string' && input.website.trim() !== '' };
}

// Même forme que le webhook Unbounce (application/x-www-form-urlencoded, champ data.json),
// pour que le workflow HighLevel existant fonctionne sans modification.
export function buildWebhookBody(clean, meta) {
  const now = meta.now || new Date();
  const hh = now.getUTCHours(), mm = String(now.getUTCMinutes()).padStart(2, '0');
  const time = `${String(((hh + 11) % 12) + 1).padStart(2, '0')}:${mm} ${hh < 12 ? 'AM' : 'PM'} UTC`;
  const data = {};
  for (const [k, v] of Object.entries(clean)) data[k] = [v];
  data.ip_address = [meta.ip || ''];
  data.page_uuid = [meta.pageId];
  data.variant = [meta.webhookVariant];
  data.time_submitted = [time];
  data.date_submitted = [now.toISOString().slice(0, 10)];
  data.page_url = [meta.pageUrl];
  data.page_name = [meta.pageName];
  const body = new URLSearchParams();
  body.set('data.json', JSON.stringify(data));
  body.set('page_id', meta.pageId);
  body.set('page_name', meta.pageName);
  body.set('page_url', meta.pageUrl);
  body.set('variant', meta.webhookVariant);
  return body;
}

// Charge utile JSON simple pour un nouveau déclencheur « Inbound Webhook » HighLevel.
export function buildWebhookJson(clean, meta) {
  const full = clean['nom_et_prénom'];
  const parts = full.split(/\s+/);
  return {
    source: 'landing-page', site: meta.host, page_path: meta.pagePath, page_url: meta.pageUrl,
    clinic: meta.clinic, service: meta.service, landing_tag: meta.landingTag, page_id: meta.pageId,
    full_name: full, first_name: parts[0] || '', last_name: parts.slice(1).join(' '),
    email: clean.email_, phone: clean['numéro_de_téléphone'],
    message: clean['message__comment_pouvonsnous_vous_aider_'],
    utm_source: clean.utm_source, utm_medium: clean.utm_medium, utm_campaign: clean.utm_campaign,
    utm_content: clean.utm_content, utm_term: clean.utm_term,
    gclid: clean.gclid, gbraid: clean.gbraid, wbraid: clean.wbraid, fbclid: clean.fbclid, msclkid: clean.msclkid,
    ab_test: clean.ab_test, ab_variant: clean.ab_variant, event_id: clean.event_id,
    submitted_at: (meta.now || new Date()).toISOString()
  };
}

async function handleLead(request, env, ctx, url) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== url.host) return json({ ok: false, error: 'origin' }, 403);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 20000) return json({ ok: false, error: 'size' }, 413);

  let input;
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) input = await request.json().catch(() => null);
  else if (ct.includes('form')) input = Object.fromEntries(await request.formData());
  if (!input || typeof input !== 'object') return json({ ok: false, error: 'body' }, 400);

  // Page et variante doivent être connues : aucun repli silencieux sur une autre page.
  const pagePath = typeof input.landing_path === 'string' && PAGES[input.landing_path] ? input.landing_path : '';
  if (!pagePath) return json({ ok: false, error: 'validation', fields: ['landing_path'] }, 422);
  const page = PAGES[pagePath];
  const { clean, errors, spam } = validateLead(input);
  if (!Object.prototype.hasOwnProperty.call(page.test.weights, clean.ab_variant)) errors.push('ab_variant');
  clean.ab_test = page.test.id;
  const ev = baseEvent(request, {
    page: pagePath, test: page.test.id,
    variant: Object.prototype.hasOwnProperty.call(page.test.weights, clean.ab_variant) ? clean.ab_variant : '',
    us: clean.utm_source, um: clean.utm_medium, uc: clean.utm_campaign,
    c: ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid'].find((k) => clean[k]) || '',
    r: clean.referrer_host,
    qa: input.qa === '1' || isolatedPreview(request, env) ? 1 : 0
  });

  // Robot : réponse neutre, aucune conversion côté navigateur.
  if (spam) { ctx.waitUntil(record(env, { ...ev, kind: 'lead_spam' })); return json({ ok: true, accepted: false }); }
  if (errors.length) return json({ ok: false, error: 'validation', fields: errors }, 422);

  // Les essais internes restent isolés même quand le secret de production existe.
  // Garder ce garde-fou avant tout accès au webhook : aucun contact ni message patient.
  if (env.LEAD_DRY_RUN === '1' || ev.qa === 1) {
    ctx.waitUntil(record(env, { ...ev, kind: 'lead_dry_run', qa: 1 }));
    return json({ ok: true, accepted: false, dryRun: true, qa: true });
  }

  if (!env.GHL_WEBHOOK_URL) {
    ctx.waitUntil(record(env, { ...ev, kind: 'lead_error' }));
    return json({ ok: false, error: 'not_configured' }, 503);
  }

  // Référence réservée une seule fois, avant le relais, même après un échec ambigu.
  const guard = env.DEDUPE_REQUIRED === '1';
  if (guard) {
    try {
      if (!await claimReceipt(env.DB,clean.event_id)) return json({ok:false,error:'duplicate_request'},409);
    } catch (_) { return json({ok:false,error:'receipt_unavailable'},503); }
  }

  const meta = {
    ip: request.headers.get('cf-connecting-ip') || '', host: SITE.host, pagePath, clinic: page.clinic, service: page.service, landingTag: page.landingTag,
    pageId: page.pageId, pageName: page.pageName,
    pageUrl: `https://${SITE.host}${pagePath}`, webhookVariant: page.webhookVariant
  };
  const isJson = page.webhookFormat === 'json';
  const body = isJson ? JSON.stringify(buildWebhookJson(clean, meta)) : buildWebhookBody(clean, meta);
  // Un seul envoi, sans relance automatique (une relance après une réponse perdue créerait un doublon CRM).
  let ok = false, status = 0;
  try {
    const r = await fetch(env.GHL_WEBHOOK_URL, {
      method: 'POST', body,
      headers: { 'content-type': isJson ? 'application/json' : 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000)
    });
    status = r.status; ok = r.ok;
  } catch (e) { status = 0; }
  if (guard) {
    try { await finishReceipt(env.DB,clean.event_id,ok?'accepted':status===0?'uncertain':'rejected'); }
    catch (_) { /* pending reste réservé; aucun renvoi automatique. */ }
  }
  ctx.waitUntil(record(env, { ...ev, kind: ok ? 'lead' : 'lead_error' }));
  if (!ok) {
    console.error('ghl_webhook_failed', status);
    return json({ ok: false, error: 'upstream' }, 502);
  }
  // accepted:true = acceptée par le relais de production ; qa:true = test interne (aucune conversion).
  return json({ ok: true, accepted: true, qa: ev.qa === 1 });
}

// ---------------------------------------------------------------- Compteur interne
async function handleEvent(request, env, ctx) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const input = await request.json().catch(() => null);
  if (!input || !EVENT_KINDS.includes(input.k)) return new Response(null, { status: 204 });
  const page = PAGES[input.p];
  // Page ou variante inconnue : ignoré (jamais rattaché à une autre page ou à une variante vide).
  if (!page || !Object.prototype.hasOwnProperty.call(page.test.weights, input.v)) return new Response(null, { status: 204 });
  const ev = baseEvent(request, {
    page: input.p, test: page.test.id,
    variant: input.v,
    us: input.us, um: input.um, uc: input.uc, c: input.c, r: input.r, qa: input.qa || isolatedPreview(request, env) ? 1 : 0
  });
  ctx.waitUntil(record(env, { ...ev, kind: input.k }));
  return new Response(null, { status: 204 });
}

function str(v, max = 120) { if (typeof v !== 'string' || !attrSafe(v)) return ''; return v.slice(0, max).replace(/[^\w.\-:/ +%]/g, ''); }

export function sourceOf({ us, c, r }) {
  if (us) return us.toLowerCase();
  if (c === 'gclid' || c === 'gbraid' || c === 'wbraid') return 'google_ads';
  if (c === 'fbclid') return 'meta';
  if (c === 'msclkid') return 'bing_ads';
  if (r) {
    if (/google\./.test(r)) return 'google_organic';
    if (/facebook\.|instagram\.|fb\.com/.test(r)) return 'meta_organic';
    if (/votredentisterie\.com$/.test(r)) return 'site_principal';
    return 'referral';
  }
  return 'direct';
}

function baseEvent(request, o) {
  const ua = request.headers.get('user-agent') || '';
  const cf = request.cf || {};
  return {
    ts: Date.now(),
    page: o.page, test: o.test || '', variant: o.variant || '',
    source: sourceOf({ us: str(o.us), c: str(o.c, 10), r: str(o.r) }),
    medium: str(o.um).toLowerCase(), campaign: str(o.uc),
    click: ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid'].includes(o.c) ? o.c : '',
    device: /Mobi|Android|iPhone|iPod/i.test(ua) ? 'mobile' : (/iPad|Tablet/i.test(ua) ? 'tablet' : 'desktop'),
    bot: BOT_UA.test(ua) || cf.verifiedBotCategory ? 1 : 0,
    qa: o.qa ? 1 : 0,
    _ip: request.headers.get('cf-connecting-ip') || '', _ua: ua
  };
}

// Jour en heure de Montréal (America/Toronto).
export function localDay(ts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

// Identifiant de visiteur pseudonyme, valable une seule journée (sel quotidien) : aucun cookie,
// aucune adresse IP stockée, impossible de suivre une personne d'un jour à l'autre.
async function visitorHash(env, day, ip, ua) {
  const secret = env.VISITOR_SALT || 'dc-lp';
  const data = new TextEncoder().encode(`${secret}|${day}|${ip}|${ua}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function record(env, ev) {
  if (!env.DB || ev.bot) return;
  try {
    await ensureSchema(env.DB);
    const day = localDay(ev.ts);
    const visitor = await visitorHash(env, day, ev._ip, ev._ua);
    await env.DB.prepare(
      'INSERT INTO events (ts, day, page, test, variant, kind, visitor, device, source, medium, campaign, click, qa) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(ev.ts, day, ev.page, ev.test, ev.variant, ev.kind, visitor, ev.device, ev.source, ev.medium, ev.campaign, ev.click, ev.qa).run();
  } catch (e) {
    console.error('record_failed', e && e.message);
  }
}

// ---------------------------------------------------------------- utilitaires
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function notFound() {
  return new Response(`<!doctype html><html lang="fr-CA"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page introuvable | Votre Dentisterie</title><body style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#2F3342"><h1 style="color:#565B6E">Page introuvable</h1><p>Cette page n'existe plus. Visitez <a href="https://www.votredentisterie.com/">votredentisterie.com</a> ou appelez-nous au <a href="tel:+14503903135">450 390-3135</a>.</p></body></html>`,
    { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } });
}
