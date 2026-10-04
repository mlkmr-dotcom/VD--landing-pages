# Landing page Votre Dentisterie Iberville — `chez.votredentisterie.com`

Remplace la page Unbounce de Votre Dentisterie Iberville. Hébergement : un Worker Cloudflare relié à ce dépôt GitHub (construction et déploiement automatiques à chaque `push`). Même architecture que `DC--landing-pages` (Dentisterie Confort).

> **Mise en ligne : voir [GUIDE-CMO.md](GUIDE-CMO.md)** (connexion GitHub → Cloudflare, secrets, recette, A/B testing, bascule DNS).

## Ce qui est en place

| Élément | État |
|---|---|
| `/` variante **A** | Nouvelle page bâtie sur la structure qui convertit le mieux chez Confort (variante D Unbounce : 13,6 %, contre ≈ 4 % pour la page Iberville actuelle). |
| `/` variante **B** | A + barre d'action fixe (« Appeler » / « Prendre rendez-vous ») + numéro cliquable sous le bouton du haut de page. Aucun autre changement. |
| Photos | **Uniquement des photos réelles de la clinique et de l'équipe** (tournages « Photos Iberville 2025 » et « 5 mai 2023 ») ; aucune image de banque. Provenance de chaque image : `src/pages/iberville/page.json` → `photos`. |
| Test A/B | 50/50, même version pour un même visiteur (cookie fonctionnel `vd_ab_iberville`, 30 jours). Réglage dans `src/config.js`. |
| Formulaire | 4 champs (nom, courriel, téléphone, message facultatif) envoyés à `/api/lead`, relayés à un **webhook entrant HighLevel** (location VD Iberville) en JSON simple. Succès affiché seulement si HighLevel accepte. |
| Suivi Google | GTM `GTM-M29KWPM` (le même que la page actuelle). Signal `vd_lp_form_success` envoyé après acceptation du formulaire. |
| Attribution | UTM + `gclid`/`gbraid`/`wbraid`/`fbclid`/`msclkid` + page + variante transmis à HighLevel. |
| Compteur interne | Visites, visiteurs uniques/jour, formulaires commencés, demandes reçues, clics téléphone — par variante, jour, source, appareil. Tableau de bord : `/stats?key=…`. Aucune donnée personnelle. |
| Confidentialité | `/confidentialite` (Loi 25) — nom de la personne responsable à compléter. |
| Anciennes pages | `/fb` → `/` (301) ; `/st-jean`, `/urgences`, `/implants`, `/implants/fb`, `/invisalign-fr` → pages du site principal (302, à valider) ; `/cdcp` → `/` (302). |

## Pratiques reprises de la page Confort qui convertit

1. Prix concret juste sous le haut de page (« nettoyage et examen à 260 $ »).
2. Note Google (4,8/5 · 76 avis) dès le haut de page, puis 3 avis réels cités mot pour mot.
3. Vraies photos de l'équipe, des dentistes et de la clinique.
4. Réponse aux craintes de coût : Régime canadien de soins dentaires, financement, consultation sans frais.
5. Un seul numéro (450 346-0102) et un formulaire court.
6. Plusieurs boutons vers le formulaire, aucun menu ni lien de sortie.
7. Dentistes présentés avec photo et formation.

## Structure

```
src/pages/iberville/ body.html, styles.css, logo.svg, page.json (contenu, horaires, à valider), variant-b.*
src/static/          confidentialite.html, static.css
src/shared/lp.js     formulaire + compteur (navigateur)
src/worker.js        A/B, /api/lead, /api/e, redirections
src/stats.js         tableau de bord /stats
src/config.js        page, poids du test, redirections
public/assets/       images optimisées (WebP + JPEG)
migrations/          schéma D1 du compteur
tools/build.mjs      construit dist/ (aucune dépendance)
test/                tests unitaires (npm test)
docs/                BASCULE.md (mise en ligne + retour arrière), MESURE.md, PLAN-MESURE.md (plan de mesure et A/B), TESTS.md (journal des tests)
```

## Commandes

```
npm install
npm test          # tests unitaires
npm run build     # construit dist/
npm run dev       # aperçu local (wrangler dev)
```

## Modifier la page ou le test

- Textes : `src/pages/iberville/body.html`. Téléphone, adresse, note Google, horaires : `page.json` (repris partout automatiquement).
- Répartition : `src/config.js` → `weights: { a: 50, b: 50 }`. Arrêter le test : `{ a: 100 }` ou `{ b: 100 }`.
- Aperçu d'une variante précise : `/?dc_variant=b` (exclu des statistiques).

Voir `docs/BASCULE.md` avant toute mise en ligne sur le domaine.
