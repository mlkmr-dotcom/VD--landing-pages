#!/usr/bin/env python3
"""Provenance et téléchargement des images de l'urgence Iberville -> src/pages/urgences/asset-sources.json.
- Originaux publics S3 de la bibliothèque Unbounce (client Oralvie, actifs listés le 2026-10-06 en lecture seule).
- Photos Oralvie (autre clinique) et logo Saint-Jean remplacés par des images Iberville déjà dans le dépôt.
Photos > 2400 px ou > 400 Kio réencodées (JPEG q85). Usage : python3 tools/fetch-urgences-assets.py"""
import io, json, os, re, ssl, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public/assets/urgences'); os.makedirs(OUT, exist_ok=True)
S3 = 'https://user-assets-unbounce-com.s3.amazonaws.com/7b6ad057-fd01-4d0f-8927-161649703c2c'
# préfixe de l'image publiée -> (source, valeur, raison)
PLAN = {
  '4550bb01': ('s3', '97f34960-3f78-4659-8ce8-5de5ac3f67a7/votre-dentisterie-emergency.original.jpg', 'carte Examen d’urgence'),
  '48c9d83b': ('s3', '1ddd3c5c-8a54-4ddb-8dd2-1e6e6b41aaab/votre-dentisterie-scan.original.jpg', 'carte Traumatisme dentaire'),
  '09b54f6a': ('s3', '51696dd0-f94c-4c92-9ea9-19389d57cec4/votre-dentisterie-clients.original.jpg', 'carte Gencives enflées'),
  '455dd8d3': ('s3', 'a7e33180-ae68-4495-afa1-a9f8f68eb8f4/dr-duy-k-nguyen.original.jpg', 'photo Dr Duy K. Nguyen'),
  'cb2e5f91': ('s3', '838b66fc-658c-490c-bae5-e8e8624d37cf/i-dr-malek-amer-2022-05-13-014638-lvql-1.original.jpg', 'photo Dr Malek Amer (uuid identique au préchargement publié)'),
  'ab518c88': ('s3', '11b289f6-c783-44c4-b494-3dd91a6e508c/votre-dentisterie-bg-hero-emegrency.original.jpg', 'fond du haut de page'),
  'f03fd81c': ('s3', '12dc308f-f5a6-468e-ac51-5af6cf2c411f/votredentisterie-footer-bg.original.jpg', 'fond du pied de page (deux originaux identiques octet pour octet)'),
  'ce66d3a1': ('s3', '4600aa14-3bfa-4848-9df4-c6a24294d721/votredentisterie-logo-symbol.original.svg', 'symbole du logo'),
  '968cb445': ('s3', 'baa40242-ea98-42be-adde-02d466439e4c/votredentisterie-map-icon.original.svg', 'icône d’adresse'),
  'ac302ec3': ('hidden', None, 'élément masqué sur ordinateur et mobile'),
  # Remplacements nécessaires (autre clinique ou autre succursale) : images Iberville du dépôt.
  '9995635d': ('local', '/assets/urgences/logo-iberville.svg', 'logo publié = « votre dentisterie St-Jean-sur-Richelieu » (succursale Saint-Jean) ; remplacé par le logo Iberville de la générale'),
  'f473579a': ('local', '/assets/iberville/explication-900.jpg', 'photo Oralvie (oralvie-services-wisdom-teeth) remplacée par une photo Iberville'),
  '7c45fbd6': ('local', '/assets/iberville/hero-900.jpg', 'photo Oralvie (oralvie-services-dental-pain) remplacée par une photo Iberville'),
  'd1396e57': ('local', '/assets/iberville/accueil-900.jpg', 'photo Oralvie (oralvie-services-food-crushing) remplacée par une photo Iberville'),
  '52b404cf': ('local', '/assets/iberville/equipe-1200.jpg', 'fond Oralvie (oralvie-new-patients-accepted-bg-mobile) remplacé par la photo d’équipe Iberville'),
}
ca = '/root/.ccr/ca-bundle.crt'
ctx = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()
ref = open(os.path.join(ROOT, 'references/urgence-published-sanitized-20261005.html'), encoding='utf-8').read()
urls = sorted(set('https:' + re.sub(r'^https?:', '', u) for u in re.findall(r'(?:https?:)?//d9hhrg4mnvzow\.cloudfront\.net/[^"\'\s),]+', ref)))
logo = open(os.path.join(ROOT, 'src/pages/iberville/logo.svg'), encoding='utf-8').read()
open(os.path.join(OUT, 'logo-iberville.svg'), 'w', encoding='utf-8').write(logo)
sources = {}
for u in urls:
    p = u.split('/')[-1][:8]
    if p not in PLAN: raise SystemExit('Image sans provenance : ' + u)
    kind, val, why = PLAN[p]
    if kind == 'hidden': sources[u] = {'source': 'hidden', 'reason': why}; continue
    if kind == 'local': sources[u] = {'source': 'local', 'file': val, 'reason': why}; continue
    name = p + '-' + val.split('/')[-1].replace('.original', '')
    path = os.path.join(OUT, name)
    if not os.path.exists(path):
        data = urllib.request.urlopen(f'{S3}/{val}', context=ctx, timeout=60).read()
        if name.endswith('.jpg'):
            from PIL import Image
            im = Image.open(io.BytesIO(data))
            if im.width > 2400 or len(data) > 400 * 1024:
                # Trop large ou peu compressé : réduit à 2400 px au plus, JPEG q85.
                im = im.convert('RGB'); im.thumbnail((2400, 10000)); b = io.BytesIO(); im.save(b, 'JPEG', quality=85, optimize=True, progressive=True); data = b.getvalue()
        open(path, 'wb').write(data)
    sources[u] = {'source': 's3', 's3': f'{S3}/{val}', 'file': '/assets/urgences/' + name, 'reason': why}
json.dump(sources, open(os.path.join(ROOT, 'src/pages/urgences/asset-sources.json'), 'w'), ensure_ascii=False, indent=1)
print(len(sources), 'URL publiées,', len(os.listdir(OUT)), 'fichiers locaux')
