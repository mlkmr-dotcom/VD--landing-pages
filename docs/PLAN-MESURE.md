# Plan de mesure et d'A/B testing : landing pages Confort et Votre Dentisterie

Version du 3 octobre 2026.
- Préparé par Claude pour Malek et le CMO.
- S'applique à `chez.dentisterieconfort.com/general/` et à `chez.votredentisterie.com/`.
- Ce plan est identique dans les deux dépôts (`docs/PLAN-MESURE.md`).

## En bref

1. **Un identifiant par demande, partout.** Chaque demande porte un `event_id` (`dcub-…`) :
   - navigateur → ID de transaction de la conversion Google Ads → GA4 → HighLevel ;
   - on peut donc relier une annonce à un rendez-vous pris, puis à un patient présent.
2. **Une source de vérité par question.**

   | Question | Source de vérité |
   | --- | --- |
   | Quelle version de la page convertit le mieux ? | compteur `/stats` |
   | Qu'est devenue la demande ? | HighLevel |
   | D'où viennent les gens et que font-ils ? | GA4 |
   | Pourquoi ? | Microsoft Clarity |
   | Quelles annonces apportent des patients ? | Google Ads et Meta, nourris par HighLevel |

3. **Le consentement est pensé dès le départ (Loi 25).** Bannière, Google Consent Mode v2 et consentement Clarity sont programmés. Ils s'activent par un réglage, sur décision de Malek.
4. **Des tests A/B adaptés à nos volumes.** Avec ~325 visiteurs par mois (Confort) et ~175 (VD), un test classique ne voit que les très gros écarts. Le tableau de bord donne donc une **décision bayésienne** :
   - probabilité que B batte A ;
   - risque si l'on se trompe ;
   - contrôle du partage du trafic.

   Le plan privilégie les changements marqués et les tests menés en même temps sur les deux cliniques.
5. **Le critère final n'est pas le clic : c'est le patient présent.** La page optimise les demandes. Les annonces doivent, à terme, optimiser les rendez-vous pris et honorés, importés de HighLevel.

---

## 1. Décisions à prendre (Malek)

Note : Claude n'est pas avocat. Les points touchant la Loi 25 méritent une validation par la personne responsable de la protection des renseignements personnels ou un conseiller.

| # | Décision | Recommandation | Ce que ça change |
| --- | --- | --- | --- |
| D1 | **Bannière de consentement** (`measure.consentBanner`) | **Oui, à la bascule.** | Conformité Loi 25 : témoins d'analyse et de publicité désactivés par défaut, « Tout refuser » aussi visible que « Tout accepter ». En contrepartie, GA4 et Google Ads observent moins de données ; Google modélise une partie des conversions manquantes. Le compteur `/stats` n'est **pas** touché, car il n'utilise aucun témoin : le test A/B reste complet. |
| D2 | **Microsoft Clarity** (`measure.clarity`) | **Oui**, un projet par site, masquage « Strict ». | Enregistrements de sessions et cartes de chaleur, filtrables par variante. Sans accord, Clarity fonctionne sans témoin (un identifiant par page vue) : les enregistrements restent utiles, sans lien entre deux visites. |
| D3 | **Critère principal des tests** | « Demandes reçues ÷ visiteurs » maintenant. Ensuite « rendez-vous pris ÷ visiteurs », dès que les étapes HighLevel sont tenues à jour. | Ce qu'on optimise. |
| D4 | **Suivi des appels par variante** | Oui : un 2e numéro CallRail par site, réservé à la variante B. | Aujourd'hui, `/stats` voit les **clics** sur le numéro, pas les appels aboutis. Une part importante des patients appelle. |
| D5 | **Conversions hors ligne** (« RDV pris », « patient présent ») vers Google Ads et Meta | Oui. Elles dépendent de D1 pour l'envoi de données de correspondance (courriel/téléphone haché). | Les annonces apprennent à trouver des patients, pas seulement des formulaires. |
| D6 | **Mode du consentement Google** | Mode « avancé » : les balises envoient des signaux sans témoin quand c'est refusé. C'est ce que fait le code. | Si l'avis juridique exige le mode « de base », le CMO bloque les balises Google dans GTM tant qu'il n'y a pas d'accord. Aucun changement de code. |

---

## 2. Ce qu'on mesure : hiérarchie des indicateurs

| Niveau | Indicateur | Source | Utilité |
| --- | --- | --- | --- |
| 1. Affaires | **Coût par patient présent**, par campagne. Puis production par campagne, si on peut l'extraire. | Ads + HighLevel | Répartir le budget |
| 2. Qualité | Rendez-vous pris ÷ demandes. Présents ÷ rendez-vous. Délai de premier contact. | HighLevel | Qualité des leads, suivi par l'équipe |
| 3. Page | **Demandes reçues ÷ visiteurs** (critère principal). Contacts ÷ visiteurs (demandes + appels). | `/stats` (+ CallRail) | Décider des tests A/B |
| 4. Diagnostic | Visite engagée, formulaire commencé, champ refusé, clics « Prendre rendez-vous » et téléphone, défilement, clics répétés | `/stats`, GA4, Clarity | Comprendre où ça bloque |
| Garde-fous | Envois échoués = 0. Partage du trafic conforme. Taux de rendez-vous par variante pas pire. Spam stable. | `/stats`, HighLevel | Ne pas « gagner » un test en dégradant autre chose |

**Définitions** (identiques partout) :
- **Visiteur** : visiteur unique par jour, compté sans témoin.
- **Demande reçue** : HighLevel a répondu 2xx.
- **Visite engagée** : moitié de la page atteinte, ou 30 s de lecture avec l'onglet visible.
- **Contact** : demande reçue ou clic sur le numéro. Il devient « appel abouti » dès que CallRail est relié (D4).

---

## 3. Architecture des données

```
Annonce (gclid / gbraid / wbraid / fbclid / msclkid, utm_*)
   │
   ▼
Landing page (Cloudflare) ── ab_test / ab_variant (cookie fonctionnel, 30 j)
   │     ├─► Compteur D1 /stats ........ test A/B (sans témoin, sans donnée personnelle)
   │     ├─► Clarity ................... comportement (étiquettes : variante, source, type de clic)
   │     ├─► dataLayer / GTM ........... Google Ads, Meta, GA4 (selon le consentement)
   │     └─► GA4 ....................... parcours, sources (Confort : direct depuis la page)
   ▼
Demande ─► Worker ─► HighLevel (1 seul envoi)
                      champs : event_id, ab_test, ab_variant, utm_*, gclid, gbraid, wbraid, fbclid, msclkid
                      │
                      ├─ Étapes : Nouveau → Contacté → RDV pris → Présent → (Plan de traitement accepté)
                      ├─► Google Ads : conversions hors ligne « RDV pris », « Patient présent » (gclid)
                      └─► Meta Conversions API : Lead, Schedule (event_id pour la déduplication)
```

**Règles de données :**
- aucune donnée personnelle dans le compteur, GA4, Clarity ou le dataLayer ;
- l'attribution qui ressemble à un courriel ou à un numéro est écartée ;
- le contenu du formulaire est masqué dans Clarity (`data-clarity-mask`, plus le masquage « Strict » du projet).

---

## 4. Dictionnaire des événements (déjà programmé)

| Moment | Compteur D1 | Clarity | dataLayer (GTM) | GA4 |
| --- | --- | --- | --- | --- |
| Page vue | `view` | session | — | `page_view` (automatique) |
| Visite engagée | `engaged` | `engaged` | `lp_interaction` · `interaction=engaged` | `lp_engaged` |
| Premier clic dans le formulaire | `form_start` | `form_start` | `lp_interaction` · `form_start` | `lp_form_start` |
| Envoi refusé par un champ invalide | `form_invalid` | `form_invalid` | `lp_interaction` · `form_invalid` + `field` | `lp_form_invalid` |
| Clic « Prendre rendez-vous » | `cta` | `cta` | `lp_interaction` · `cta` | `lp_cta_click` |
| Clic sur le numéro | `tel` | `tel` + session prioritaire | `lp_interaction` · `tel` | `lp_tel_click` |
| **Demande acceptée par HighLevel** | `lead` (serveur) | `lead_accepted` + session prioritaire | Confort : `dc_mcp_lead_form_success` (contrat v9 inchangé). VD : `vd_lp_form_success` | `lead_form_success` + `event_id`, `ab_test`, `ab_variant` |
| Échec d'envoi | `lead_error` (serveur) | `lead_error` | `lp_interaction` · `lead_error` | `lp_lead_error` |
| Choix de consentement | — | `consentv2` | `dc_consent_update` | consentement mis à jour |

Notes :
- **Paramètres communs** dans le dataLayer et GA4 : `ab_test`, `ab_variant`, `page_path`.
- **Étiquettes Clarity** : `ab_test`, `ab_variant`, `lp_path`, `utm_source`, `utm_medium`, `utm_campaign`, `click_id_type` et `qa` pour les tests internes.
- **GA4 sur Confort** : la page parle directement à GA4 (`G-0FR47D1GVC`), car GTM v9 n'a aucune balise GA4. Ne pas en ajouter, sinon le comptage est doublé.
- **GA4 sur VD** : passe par GTM. Le CMO crée une balise GA4 « événement » sur `lp_interaction`, avec le nom d'événement `lp_{{interaction}}`, et une balise sur `vd_lp_form_success` (`lead_form_success`).
- **Tests internes** : les aperçus (`?dc_variant=`) et les tests (`?dc_qa=1`) ne vont ni dans GA4, ni dans GTM, ni dans le compteur. Clarity les marque `qa=1`.

---

## 5. Consentement (Loi 25) : comment c'est programmé

- **Réglage :** `measure.consentBanner` dans `src/pages/*/page.json`. Il vaut `false` aujourd'hui : statu quo, identique à Unbounce.
- **Quand il passe à `true`**, dans l'ordre :
  - dans `<head>`, avant GTM : Google Consent Mode v2, tout refusé par défaut (`ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`) ;
  - le choix déjà mémorisé est appliqué tout de suite, et les clics publicitaires sont conservés sans témoin (`url_passthrough`) ;
  - la bannière propose « Tout refuser » et « Tout accepter », de même taille, même couleur et même poids, plus « Personnaliser » ;
  - deux catégories : **mesure d'audience** (GA4, Clarity) et **publicité** (Google Ads, Meta) ;
  - le choix est mémorisé 12 mois dans le témoin fonctionnel `dc_consent` et reste modifiable par le lien « Préférences de témoins » / « Témoins » ;
  - le consentement Clarity v2 suit le choix ; sans accord, Clarity fonctionne sans témoin.
- **Ce qui ne demande pas de consentement :** le compteur interne (aucun témoin) et le cookie A/B (fonctionnel, nécessaire pour qu'un visiteur voie toujours la même page).
- **Politiques de confidentialité :**
  - VD : `/confidentialite` est mise à jour (Clarity, catégories, lien « Témoins ») ;
  - Confort : la politique du site principal doit mentionner Clarity et les choix de témoins (CMO/Malek).
- **Effet attendu sur les chiffres :** GA4 et Google Ads voient une partie seulement des visites (ceux qui acceptent), plus une modélisation. Il faut donc comparer les périodes avant et après la bannière avec prudence. `/stats` et HighLevel restent complets.

---

## 6. Méthode A/B adaptée à nos volumes

### Nos volumes réels (Unbounce, 30 derniers jours)

| Page | Visiteurs/mois | Taux de conversion | Remarque |
| --- | --- | --- | --- |
| Confort `/general` | ~325 | 8,6 % (D seule depuis le 25 sept.) | Ancienne variante A : **12,0 % sur 783 visiteurs** (juil.–oct.) |
| VD Iberville | ~175 | 3,5 % (6 demandes) | Les demandes n'arrivaient pas dans HighLevel |

### Ce qu'un test peut détecter (seuil 95 %, puissance 80 %)

| Durée | Confort (~10 %) | VD (~3,5 %) | Les deux ensemble, même hypothèse |
| --- | --- | --- | --- |
| 4 semaines | écart de +97 % | +233 % | — |
| 8 semaines | **+69 %** | +165 % | **+64 %** |
| 12 semaines | +56 % | +134 % | — |

Taille d'échantillon nécessaire **par variante** (test classique) :

| Taux de base | Gain de +20 % | Gain de +30 % | Gain de +50 % |
| --- | --- | --- | --- |
| 13,6 % | 2 699 | 1 244 | 478 |
| 10 % | 3 841 | 1 774 | 686 |
| 4 % | 10 317 | 4 783 | 1 863 |

**Conséquence honnête :** à ce volume, on ne peut **pas** prouver de petits gains (+10 à 20 %). D'où quatre règles :
1. **Tester des changements marqués** (structure, offre, mode de contact), pas des couleurs de bouton.
2. **Même hypothèse sur les deux cliniques en même temps.** La variante B actuelle (barre d'action fixe) est la même sur Confort et VD : on lit chaque site, puis la combinaison.
3. **Décider par le risque, pas seulement par la valeur p.** Le tableau de bord calcule, avec des lois a priori neutres :
   - la probabilité que B batte A ;
   - l'intervalle de crédibilité de l'écart ;
   - la **perte attendue** : combien de points de conversion on risque de perdre si l'on choisit la mauvaise version.
4. **Compléter par le qualitatif.** Revue Clarity hebdomadaire et lecture des demandes pour les petits ajustements, qu'on applique sans test formel lorsqu'ils corrigent un problème évident (bogue, champ qui bloque).

### Règle de décision pré-enregistrée (affichée dans `/stats`)

- **Minimum :** 14 jours (deux cycles hebdomadaires) **et** 100 visiteurs par variante, avec un partage du trafic conforme (contrôle SRM, p ≥ 0,01).
- **B gagne** si P(B > A) ≥ 95 % **et** la perte attendue en choisissant B ≤ 10 % du taux de A. → Passer B à 100 %.
- **A gagne** si P(B > A) ≤ 5 %, avec la même condition de perte. → Arrêter B.
- **8 semaines sans décision** → garder A (la version la plus simple) et tester un changement plus marqué.
- **Garde-fous** avant de passer B à 100 % : envois échoués à 0, et taux de rendez-vous pris par variante (HighLevel) pas inférieur.
- **Interdits pendant un test :**
  - changer la répartition ;
  - modifier une variante ;
  - lire le résultat tous les jours pour s'arrêter au premier « vert » (la règle ci-dessus en tient compte).

### Journal des tests

Chaque test est consigné avant son lancement dans `docs/TESTS.md` :
- hypothèse et justification ;
- critère principal et garde-fous ;
- dates ;
- décision et apprentissage.

### File d'attente des tests (priorité = impact attendu × facilité)

| # | Hypothèse | Pages | Pourquoi |
| --- | --- | --- | --- |
| 1 | **Barre d'action fixe + numéro sous le bouton** (en cours) | Confort + VD | Réduire l'effort pour appeler ou demander, surtout sur téléphone |
| 2 | **Ancienne variante A d'Unbounce vs D actuelle** | Confort | 12,0 % sur 783 visiteurs contre 7,5 % pour D sur 67 : le plus gros écart observé. Périodes et trafic différents, donc à confirmer par un vrai test |
| 3 | **Formulaire court** (nom + téléphone) vs formulaire actuel | Confort + VD | Moins de friction ; garde-fou : qualité des leads dans HighLevel |
| 4 | **Prise de rendez-vous en ligne** (calendrier HighLevel) vs demande de rappel | Confort + VD | Changement marqué ; c'est le critère de niveau 2 qui tranche |
| 5 | **Preuve sociale et équipe en haut de page** vs offre d'abord | VD | Faible taux actuel ; à appuyer par la lecture Clarity |

---

## 7. Boucle fermée : de l'annonce au patient présent (HighLevel → Ads)

1. **HighLevel (CMO), dans les deux locations :**
   - champs personnalisés du contact : `ab_test`, `ab_variant`, `lp_event_id`, `utm_source`, `utm_medium`, `utm_campaign`, `gclid`, `gbraid`, `wbraid`, `fbclid` ;
   - le workflow du webhook copie ces valeurs ;
   - pipeline « Nouveau patient » avec des étapes **tenues à jour par l'équipe** : Nouveau → Contacté → RDV pris → Présent → Non qualifié / Perdu (avec raison) ;
   - sans cette discipline, aucun outil ne pourra mesurer la qualité.
2. **Google Ads :**
   - créer les conversions « RDV pris » et « Patient présent » (importées, secondaires au départ) ;
   - les alimenter par l'intégration Google Ads de HighLevel ou un import planifié (gclid + date/heure) ;
   - optionnel, si la décision D5 le permet : conversions améliorées pour les leads (courriel/téléphone haché).
   - Quand « RDV pris » dépasse ~30 par mois et par compte, envisager d'en faire l'objectif d'enchères principal.
3. **Meta :** Conversions API depuis HighLevel (Lead, Schedule), avec `event_id` pour dédupliquer avec le pixel.
4. **CallRail :**
   - un numéro distinct pour la variante B sur chaque site (D4) ;
   - les appels de plus de 60 s sont importés comme conversion « Appel qualifié » ;
   - Claude ajoute l'affichage d'un numéro par variante dès que les numéros existent (≈ 15 min de travail).
5. **Comparaison hebdomadaire.** Les trois chiffres doivent concorder à ±10 % près. Un écart plus grand signale un problème de marquage à corriger avant toute décision.

   | Demandes | Source |
   | --- | --- |
   | reçues | `/stats` |
   | créées | HighLevel |
   | `lead_form_success` | GA4 |

---

## 8. Tableaux de bord et rituels

| Rythme | Durée | Quoi | Qui |
| --- | --- | --- | --- |
| Hebdomadaire | 15 min | `/stats` de chaque site (décision du test, garde-fous) ; 10 sessions Clarity par variante, en priorité les sessions « demande » et « appel » ; comparaison des trois chiffres ci-dessus | CMO |
| Mensuel | — | Coût par demande, par RDV pris et par patient présent, par campagne et par source ; décisions de budget ; test suivant de la file d'attente | CMO + Malek |
| Infrastructure | — | GA4 relié à BigQuery (export quotidien gratuit) et à Google Ads ; conservation des données GA4 sur 14 mois ; Clarity relié à GA4 ; un tableau Looker Studio « Marketing patients » (GA4 + Ads + export HighLevel) | CMO |

---

## 9. Qui fait quoi, et quand

| Quand | Claude (code) | CMO (outils) | Malek |
| --- | --- | --- | --- |
| **Fait** | Événements, Clarity, bannière et Consent Mode (désactivés par réglage), `event_id` vers HighLevel, décision bayésienne + contrôle SRM dans `/stats`, tests | — | — |
| **Avant la bascule** (avant le renouvellement Unbounce du 15 oct.) | Mettre les identifiants Clarity et le réglage de consentement dans `page.json`, sur réception | 1) Créer deux projets Clarity (masquage Strict, IP de la clinique exclues, lien GA4) et transmettre les identifiants. 2) GA4 : dimensions `ab_test`, `ab_variant`, `interaction`, `field`. 3) HighLevel : champs et étapes (§ 7). 4) GTM VD : balises (§ 4). 5) Politique de confidentialité Confort | Décisions D1 à D6 ; validations clinique (prix régulier, date de fin, responsable vie privée) |
| **Bascule + 7 jours** | Correctifs éventuels | Recette de la mesure (§ 10), comparaison des trois chiffres | Accord écrit de bascule DNS |
| **+30 jours** | Numéro par variante (si D4) | Conversions hors ligne Ads et Meta, CallRail | Revue mensuelle |
| **+8 semaines** | Variante suivante (file d'attente) | Décision du test 1 selon la règle | Valider le test suivant |

---

## 10. Recette de la mesure (à refaire après chaque changement de marquage)

- [ ] `/?dc_qa=1` : aucune conversion, aucun événement GA4 ni `lp_interaction`. Clarity marque la session `qa`.
- [ ] Visite normale sur A puis sur B, en navigation privée :
  - `/stats` compte la visite, la visite engagée et le formulaire commencé dans la bonne variante ;
  - GTM en mode Aperçu montre `lp_interaction`, puis l'événement de succès avec `event_id`.
- [ ] Demande de test (fiche technique autorisée) : `event_id` identique dans GTM (ID de transaction Ads), GA4 (DebugView) et HighLevel.
- [ ] Bannière activée :
  - avant tout choix : `consent default` = denied avant `gtm.js` ;
  - « Tout refuser » → témoin `dc_consent=v1.a0.m0…` ; aucun témoin `_ga` ni `_clck` ;
  - « Personnaliser » → mesure seule → `analytics_storage=granted`, publicité refusée ;
  - le choix est conservé au rechargement, et le lien « Témoins » rouvre les choix.
- [ ] Clarity : le filtre `ab_variant` fonctionne, et les champs du formulaire apparaissent masqués dans un enregistrement.

Cette recette est automatisée en local (Playwright) et a passé sur les deux pages le 3 octobre 2026, avec Clarity et la bannière activés : ordre consentement/GTM, boutons de même poids, refus, choix personnalisé, rechargement, événements, masquage, `event_id` reçu par le faux webhook.

---

## 11. Réglages (dans `src/pages/*/page.json` → `measure`)

| Clé | Confort | VD | Effet |
| --- | --- | --- | --- |
| `clarity` | `""` | `""` | Identifiant du projet Clarity. Vide = Clarity non chargé |
| `consentBanner` | `false` | `false` | Bannière + Consent Mode v2 (décision D1) |
| `privacyUrl` | politique du site principal | `/confidentialite` | Lien dans la bannière |
| `ga4Direct` | `G-0FR47D1GVC` | `""` | Événements `lp_*` envoyés directement à GA4 (Confort seulement, sans balise GA4 dans GTM) |
| `consentTheme` | couleurs Confort | couleurs VD | Couleurs de la bannière |

Toute modification se fait par un commit sur `main` ; Cloudflare redéploie automatiquement.
