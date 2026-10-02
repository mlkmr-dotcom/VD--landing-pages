#!/usr/bin/env node
// Construit dist/ : pages variantes (HTML complet), CSS/JS avec empreinte, images auto-hébergées.
// Aucune dépendance externe. Usage : node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'assets', 'shared'), { recursive: true });
cpSync(join(ROOT, 'public'), DIST, { recursive: true });

function emit(dir, name, ext, content) {
  const file = `${name}.${hash(content)}.${ext}`;
  mkdirSync(join(DIST, 'assets', dir), { recursive: true });
  writeFileSync(join(DIST, 'assets', dir, file), content);
  return `/assets/${dir}/${file}`;
}
const shared = { runtime: emit('shared', 'lp', 'js', rd('src/shared/lp.js')) };

const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Prata&display=swap';

function fill(tpl, vars) {
  const out = tpl.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`Variable inconnue : ${k}`);
    return vars[k];
  });
  return out;
}

function buildPage(slug) {
  const dir = `src/pages/${slug}`;
  const page = JSON.parse(rd(`${dir}/page.json`));
  const logo = rd(`${dir}/logo.svg`).trim();
  const hours = page.hours.map(([d, h]) => `<dt>${esc(d)}</dt><dd>${esc(h)}</dd>`).join('');
  const base = {
    LOGO: logo,
    G_URL: esc(page.google.url),
    G_RATING: esc(page.google.rating),
    G_COUNT: esc(page.google.count),
    MAPS: esc(page.address.maps),
    ADDRESS1: esc(page.address.line1),
    ADDRESS2: esc(page.address.line2),
    PHONE_HREF: page.phone.href,
    PHONE_DISPLAY: esc(page.phone.display),
    HOURS: hours
  };
  const bodyTpl = rd(`${dir}/body.html`);
  if (/unbounce|cloudfront|oralvie/i.test(bodyTpl)) throw new Error(`Référence externe indésirable dans ${slug}`);
  const pageCss = emit(slug, 'page', 'css', rd(`${dir}/styles.css`));

  const variants = Object.keys(page.test.variants);
  for (const v of variants) {
    let extraCss = '', extraBody = '';
    const vars = { ...base, HERO_PHONE: '' };
    if (v === 'b') {
      extraCss = `<link rel="stylesheet" href="${emit(slug, 'variant-b', 'css', rd(`${dir}/variant-b.css`))}">`;
      extraBody = fill(rd(`${dir}/variant-b.html`), vars);
      vars.HERO_PHONE = `<a class="hero-phone" data-dc-action="phone" data-dc-source="hero" href="${page.phone.href}">ou appelez le ${esc(page.phone.display)}</a>`;
    }
    const body = fill(bodyTpl, vars);
    if (/\{\{/.test(body + extraBody)) throw new Error(`Variable non remplacée (${slug}/${v})`);
    if (!body.includes('action="/api/lead"') || !body.includes('name="website"')) throw new Error('Formulaire incomplet');
    const html = renderPage({ page, v, pageCss, extraCss, body, extraBody });
    mkdirSync(join(DIST, '_variants', slug), { recursive: true });
    writeFileSync(join(DIST, '_variants', slug, `${v}.html`), html);
  }
  return { slug, path: page.path, variants };
}

function renderPage({ page, v, pageCss, extraCss, body, extraBody }) {
  const lp = { pageId: page.pageId, pagePath: page.path, variant: v, test: page.test.id, clinic: page.slug };
  return `<!DOCTYPE html>
<html lang="${page.language}">
<head>
<meta charset="utf-8">
<!-- ${page.pageId} variante ${v} (test ${page.test.id}) — hébergé sur Cloudflare -->
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<meta name="robots" content="${page.robots}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#565B6E">
<link rel="canonical" href="${page.canonicalUrl}">
<meta property="og:type" content="${page.og.type}">
<meta property="og:locale" content="fr_CA">
<meta property="og:title" content="${esc(page.og.title)}">
<meta property="og:description" content="${esc(page.og.description)}">
<meta property="og:image" content="${page.og.image}">
<meta property="og:url" content="${page.og.url}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="preload" as="image" href="/assets/${page.slug}/hero-900.webp" imagesrcset="/assets/${page.slug}/hero-900.webp 900w, /assets/${page.slug}/hero-1600.webp 1600w" imagesizes="(max-width: 800px) 100vw, 50vw">
<link rel="stylesheet" href="${pageCss}">
${extraCss}
<script>window.__dcLp=${JSON.stringify(lp)};window.dataLayer=window.dataLayer||[];window.dataLayer.push({ab_test:${JSON.stringify(page.test.id)},ab_variant:${JSON.stringify(v)},lp_page_id:${JSON.stringify(page.pageId)}});</script>
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${page.tracking.gtm}');</script>
</head>
<body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${page.tracking.gtm}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
${body}
${extraBody}
<script src="${shared.runtime}" defer></script>
</body>
</html>
`;
}

function buildStatic(name) {
  const tpl = rd(`src/static/${name}.html`);
  const page = JSON.parse(rd('src/pages/iberville/page.json'));
  const css = emit('shared', 'static', 'css', rd('src/static/static.css'));
  const html = fill(tpl, {
    CSS: css, FONTS, PHONE_HREF: page.phone.href, PHONE_DISPLAY: esc(page.phone.display),
    ADDRESS1: esc(page.address.line1), ADDRESS2: esc(page.address.line2), GTM: page.tracking.gtm
  });
  mkdirSync(join(DIST, '_pages'), { recursive: true });
  writeFileSync(join(DIST, '_pages', `${name}.html`), html);
  return name;
}

const results = ['iberville'].map(buildPage);
const statics = ['confidentialite'].map(buildStatic);
writeFileSync(join(DIST, '_build.json'), JSON.stringify({ builtAt: new Date().toISOString(), shared, pages: results, statics }, null, 2));
console.log(JSON.stringify({ pages: results, statics }));
