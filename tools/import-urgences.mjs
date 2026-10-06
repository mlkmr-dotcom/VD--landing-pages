#!/usr/bin/env node
// Import déterministe de l'urgence Iberville publiée (copie sanitisée) vers src/pages/urgences/ (variante A).
// Entrées : references/urgence-published-sanitized-20261005.html, src/pages/urgences/asset-sources.json,
//           src/pages/urgences/corrections.json. Sorties : a-body.html, a-styles.css.
// Relancer après toute modification des entrées : node tools/import-urgences.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'src/pages/urgences');
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const html = readFileSync(join(ROOT, 'references/urgence-published-sanitized-20261005.html'), 'utf8');
const sources = JSON.parse(readFileSync(join(DIR, 'asset-sources.json'), 'utf8'));
const corrections = JSON.parse(readFileSync(join(DIR, 'corrections.json'), 'utf8'));

const assetMap = {};
for (const [url, s] of Object.entries(sources)) assetMap[url] = s.source === 'hidden' ? PIXEL : s.file;
const local = (u) => {
  const key = 'https:' + u.replace(/^https?:/, '');
  if (!assetMap[key]) throw new Error('Image non résolue : ' + u);
  return assetMap[key];
};
const localize = (t) => t.replace(/(?:https?:)?\/\/d9hhrg4mnvzow\.cloudfront\.net\/[^"'\s),]+/g, local);

// 1) Styles publiés, dans l'ordre, images localisées.
let styles = localize([...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1].trim()).join('\n\n'));

// 2) Corps sans <style> ; la copie sanitisée ne contient aucun script.
let body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
if (/<script/i.test(body)) throw new Error('Script inattendu dans la référence');

// 3) Éléments masqués à retirer (voir corrections.json → removeHidden).
function span(src, id) {
  const at = src.indexOf(`id="${id}"`);
  if (at < 0) throw new Error('Élément introuvable : ' + id);
  const tag = src.slice(src.lastIndexOf('<', at) + 1).match(/^[a-z]+/)[0];
  const open = src.lastIndexOf('<' + tag, at);
  const re = new RegExp(`<\\/?${tag}\\b`, 'g'); re.lastIndex = open;
  let depth = 0;
  for (let m; (m = re.exec(src));) {
    depth += m[0] === '<' + tag ? 1 : -1;
    if (depth === 0) return [open, src.indexOf('>', m.index) + 1];
  }
  throw new Error('Élément non fermé : ' + id);
}
for (const id of corrections.removeHidden.ids) { const [a, b] = span(body, id); body = body.slice(0, a) + body.slice(b); }

// 4) Images : chargement différé Unbounce → image locale la plus nette, bascule ordinateur/mobile.
body = body.replace(/<img\b([^>]*)>/g, (tag, attrs) => {
  if (!/data-src-/.test(attrs)) return tag.replace(/src="([^"]+)"/, (m, u) => /cloudfront/.test(u) ? `src="${local(u)}"` : m);
  const pick = (kind) => {
    for (const d of ['3x', '2x', '1x']) {
      const m = attrs.match(new RegExp(`data-src-${kind}-${d}="([^"]+)"`));
      if (m) return local(m[1]);
    }
    return null;
  };
  const desk = pick('desktop') || pick('mobile'), mob = pick('mobile') || desk;
  const a = attrs.replace(/\s*data-src-[a-z]+-\dx="[^"]*"/g, '').replace(/\s*src="[^"]*"/, '');
  if (desk === PIXEL && mob === PIXEL) return `<img${a} src="${PIXEL}">`;
  return `<img${a} data-hd-desktop="${desk}" data-hd-mobile="${mob}" src="${desk}">`;
});
body = localize(body);

// 5) Formulaire → relais /api/lead, piège anti-robots, messages attendus par src/shared/lp.js.
const formOpen = '<form action="#" method="POST">';
if (body.split(formOpen).length !== 2) throw new Error('Formulaire introuvable');
body = body.replace(formOpen, '<form id="dc-form" action="/api/lead" method="post" aria-label="Demander un rendez-vous">');
const submit = '<button class="lp-element lp-pom-button" id="lp-pom-button-491" type="submit">';
if (body.split(submit).length !== 2) throw new Error('Bouton d\'envoi introuvable');
body = body.replace(submit, '<input aria-hidden="true" autocomplete="off" name="website" style="position:absolute;left:-9999px;width:1px;height:1px" tabindex="-1" type="text"/>' + submit);
const formClose = '</form></div><div class="lp-element lp-pom-text nlh" id="lp-pom-text-492">';
if (body.split(formClose).length !== 2) throw new Error('Fin du formulaire introuvable');
body = body.replace(formClose, '</form><p class="dc-form-error" id="dc-form-error" role="alert" hidden>Le formulaire n’est pas disponible pour le moment. Veuillez réessayer ou nous appeler au <a data-dc-action="phone" href="tel:+14503903135">450 390-3135</a>.</p>'
  + '<div class="dc-success" id="dc-success" role="status" tabindex="-1" hidden><h3>Votre demande a été envoyée.</h3><p>Notre équipe vous recontactera pour convenir d’un rendez-vous.</p><button class="dc-success-new" data-dc-new-request="" type="button">Faire une autre demande</button></div>'
  + '</div><div class="lp-element lp-pom-text nlh" id="lp-pom-text-492">');

// 6) Corrections documentées : chaque chaîne doit apparaître le nombre de fois attendu.
for (const c of corrections.replacements) {
  const n = body.split(c.find).length - 1;
  if (n !== c.count) throw new Error(`Correction « ${c.find.slice(0, 50)} » : ${n} occurrence(s), ${c.count} attendue(s)`);
  body = body.split(c.find).join(c.replace);
}
if (/346-0102|3460102|clkn\/|oralvie|St-Jean \(|Dominique Laroche|unbounce|cloudfront/i.test(body + styles)) throw new Error('Référence interdite restante (ancien numéro, Oralvie, Saint-Jean, Unbounce)');

body = '<div data-clinic="iberville" data-language="fr-CA" data-service="urgence" id="vd-page">' + body.trim() + '</div>\n';
writeFileSync(join(DIR, 'a-body.html'), body);
writeFileSync(join(DIR, 'a-styles.css'), styles + '\n');
console.log(JSON.stringify({ body: body.length, styles: styles.length, removed: corrections.removeHidden.ids.length, corrections: corrections.replacements.length }));
