# Guide CMO — mise en ligne de `chez.votredentisterie.com` (Votre Dentisterie Iberville) sur Cloudflare

Même architecture que `DC--landing-pages` (Confort). Le dépôt est prêt : il reste à le relier à Cloudflare, créer le webhook HighLevel, ajouter trois secrets, faire la recette, puis basculer le DNS **avec l'accord de Malek**.

**Design approuvé par Malek** (Figma, équipe Malek A's team, fichier `GP2f4Ikd1Xmbh5tvfmUsyj`) :
- en-tête en dégradé ardoise fondu dans la photo ;
- offre 260 $ avec prix régulier 513 $ barré ;
- bloc « accueil et contact » avec la photo de la réception ;
- logo officiel Iberville.

---

## 0. Prérequis HighLevel (à faire avant la recette)

Aujourd'hui, les demandes de la page Unbounce Iberville n'arrivent **pas** dans HighLevel (courriels seulement).

1. Location **VD Iberville** (`7TDzpTJ5zB0KAAEycNcZ`) → nouveau workflow, déclencheur **Inbound Webhook**.
2. Le Worker envoie un POST `application/json` avec ces champs :
   - `first_name`, `last_name`, `full_name`, `email`, `phone`, `message` ;
   - `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid` ;
   - `ab_test`, `ab_variant`, `page_id`, `page_url`, `clinic`, `submitted_at`.
3. Actions du workflow :
   - créer ou mettre à jour le contact ;
   - tag `lp-iberville` ;
   - opportunité « Nouveau lead » ;
   - notification à l'équipe (la personne qui reçoit aujourd'hui les courriels Unbounce) ;
   - champ personnalisé `ab_variant` (recommandé).
4. L'URL du webhook devient le secret `GHL_WEBHOOK_URL`.

## 1. Relier GitHub à Cloudflare (~10 min)

1. Cloudflare → **Workers & Pages** → **Create** → **Import a repository** → `mlkmr-dotcom/VD--landing-pages`.
2. Réglages de construction :
   - Project name : `vd-landing-pages`
   - Production branch : `main`
   - Build command : `npm run build`
   - Deploy command : `npx wrangler deploy`
   - Non-production branch deploy command : `npx wrangler versions upload`
   - Root directory : `/`
3. **Save and Deploy**. La base D1 `vd-lp-analytics` est créée automatiquement, et la table se crée à la première visite.
4. Adresse de test : `https://vd-landing-pages.<compte>.workers.dev/`.

## 2. Secrets (Worker → Settings → Variables and Secrets → type Secret)

| Nom | Valeur |
| --- | --- |
| `GHL_WEBHOOK_URL` | URL du webhook de l'étape 0. Jamais dans le dépôt. |
| `STATS_KEY` | Longue phrase aléatoire (tableau de bord `/stats?key=…`) |
| `VISITOR_SALT` | Autre chaîne aléatoire |

## 3. Recette sur workers.dev

- [ ] `/?dc_variant=a`, `/?dc_variant=b` et `/confidentialite` : rendu correct sur iPhone, Android et ordinateur.
- [ ] **Une** demande de test avec `?dc_variant=a&dc_qa=1&utm_source=qa` : contact, tag, opportunité et notification créés dans VD Iberville, avec tous les champs mappés.
- [ ] Aucune conversion sur le test QA (aucun `vd_lp_form_success`).
- [ ] **GTM `GTM-M29KWPM`** :
  - créer le déclencheur « Événement personnalisé » `vd_lp_form_success`, relié à la conversion Google Ads « formulaire », avec `event_id` comme ID de transaction ;
  - créer la balise d'appel sur les clics `tel:+14503460102` ;
  - pour GA4, ajouter **une** balise d'événement `lead_form_success` sur ce déclencheur, avec les paramètres `ab_test`, `ab_variant` et `event_id`. Sur VD, la page n'appelle pas GA4 directement : il n'y a donc pas de double comptage.
- [ ] `/stats?key=…` s'ouvre, et le test n'y est pas compté.

## 4. Bascule du DNS (seulement avec l'accord écrit de Malek)

À vérifier d'abord : **où est géré le DNS de `votredentisterie.com`**.

- **Si le domaine est dans Cloudflare :**
  1. Noter le CNAME `chez` actuel (Unbounce) : c'est le retour arrière.
  2. Worker → **Domains & Routes → Add → Custom domain** `chez.votredentisterie.com`.
  3. Contrôler l'en-tête `x-dc-variant`, le formulaire, le téléphone et GTM.
- **Sinon :** déplacer la zone DNS vers Cloudflare (en recopiant tous les enregistrements existants du site principal et des courriels), ou utiliser Cloudflare for SaaS. Ces deux options sont à planifier avec Malek.

Après la bascule :
- mettre `TEST_START` = date de bascule dans `wrangler.jsonc` ;
- laisser Unbounce publié 7 jours.

**Retour arrière :** retirer le domaine personnalisé, puis recréer le CNAME `chez` vers Unbounce.

**Redirections des anciennes pages** :
- `/st-jean`, `/urgences`, `/implants`, `/implants/fb` et `/invisalign-fr` vers le site principal restent **désactivées** (`REDIRECTS_ENABLED: "0"`) jusqu'à validation ;
- `/fb` et `/cdcp` vers `/` sont actives.

## 5. Le test A/B

- **A** = nouvelle page.
- **B** = A + barre d'action fixe « Appeler / Prendre rendez-vous » + numéro sous le bouton du haut.
- Répartition 50/50 (`src/config.js`, `weights`) ; cookie fonctionnel `vd_ab_iberville` (30 jours).
- Aperçu : `?dc_variant=a|b`. Exclus des statistiques, comme `?dc_qa=1` et les robots.
- L'URL des annonces reste `https://chez.votredentisterie.com/`. Pas d'expérience Google Ads à créer.

**Où lire les résultats :**
- **`/stats?key=…`** (source de vérité) :
  - par variante : visiteurs uniques/jour, visites, formulaires commencés, demandes reçues, clics téléphone ;
  - par appareil, source et jour ;
  - l'écart B vs A et sa valeur p ;
  - un choix de période avec `&from=` et `&to=`.
- **HighLevel :** `ab_variant` sur chaque lead, pour comparer les rendez-vous pris par variante.
- **GA4 :** via la balise de l'étape 3. Créer les dimensions personnalisées `ab_test` et `ab_variant`, de portée événement.

**Règles :**
- décider après 4 semaines ou ~30 demandes par variante, et p < 0,05 ; sinon garder A ;
- ne pas changer la répartition en cours de test ;
- pour arrêter : `weights: { a: 100 }` ;
- pour un nouveau test : nouvelle variante et nouvel identifiant de test.

## 6. Points à valider par la clinique avant la mise en ligne

Liste dans `src/pages/iberville/page.json` → `toValidate` :
- honoraires réguliers (513 $) et date de fin de l'offre à 260 $ (code de déontologie, art. 3.09.07 et 3.09.08) ;
- numéro unique 450 346-0102 ;
- dentistes présentés ;
- Dentoplan ;
- consultation sans frais ;
- photos de 2023 ;
- nom de la personne responsable de la vie privée (page `/confidentialite`).

## 7. Données

Les règles sont les mêmes que pour Confort :
- le compteur ne garde que des totaux, sans aucune donnée personnelle ;
- l'attribution est filtrée (aucun courriel ni téléphone) ;
- le cookie A/B est distinct de tout consentement publicitaire.
