# Mise en ligne et retour arrière — `chez.votredentisterie.com`

Aucune étape de cette liste n'est faite tant que Malek n'a pas donné son accord explicite.

## 0. Prérequis côté HighLevel (CMO)

Aujourd'hui, les demandes de la page Unbounce Iberville **n'arrivent pas dans HighLevel** (notifications par courriel seulement). Avant la mise en ligne :

1. Dans la location **VD Iberville**, créer un workflow avec le déclencheur **Inbound Webhook**.
2. Envoyer une demande de test (étape 2) pour que HighLevel lise les champs, puis mapper : `first_name`, `last_name`, `email`, `phone`, `message`, `utm_*`, `gclid`, `fbclid`, `ab_variant`.
3. Actions : créer/mettre à jour le contact, tag `lp-iberville`, opportunité « Nouveau lead », notification à l'équipe (la personne qui reçoit les courriels Unbounce aujourd'hui).
4. Copier l'URL du webhook : c'est le secret `GHL_WEBHOOK_URL`.

## 1. Préparation (une seule fois, Cloudflare)

1. **Workers & Pages → Créer → Importer un dépôt** : le dépôt GitHub de ce projet, branche `main`.
   - Construction : `npm run build` · Déploiement : `npx wrangler deploy`.
2. **D1** : rien à faire. Wrangler crée la base `vd-lp-analytics` au premier déploiement et le Worker crée sa table à la première visite.
3. **Secrets** : `GHL_WEBHOOK_URL`, `STATS_KEY` (longue phrase aléatoire), `VISITOR_SALT` (autre chaîne aléatoire).
4. `TEST_START` (wrangler.jsonc) : mettre la date réelle de bascule.
5. Vérifier sur le lien `*.workers.dev` : `/`, `/?dc_variant=a`, `/?dc_variant=b`, `/confidentialite`, `/stats?key=…`.

## 2. Recette avant bascule (sur le lien workers.dev)

- [ ] A et B corrects sur iPhone, Android et ordinateur.
- [ ] Une demande de test avec `?dc_variant=a&dc_qa=1&utm_source=qa` : contact, tag, opportunité et notification créés dans VD Iberville.
- [ ] GTM `GTM-M29KWPM` (mode Aperçu) : événement `vd_lp_form_success` reçu → y raccorder la conversion Google Ads « formulaire » ; balise d'appel sur `tel:+14503460102`.
- [ ] `/stats` : la demande de test n'est **pas** comptée.

## 3. Bascule (≈ 5 minutes, un matin de semaine)

À vérifier d'abord : **où est géré le DNS de `votredentisterie.com`** (pas encore confirmé).

- **Si le domaine est dans Cloudflare** : noter l'enregistrement `chez` actuel (CNAME vers Unbounce = retour arrière), puis Worker → Domaines et routes → Ajouter un domaine personnalisé `chez.votredentisterie.com`.
- **Sinon** : ajouter le sous-domaine via une route Cloudflare for SaaS, ou transférer la zone DNS vers Cloudflare (à planifier séparément, ne touche pas au site principal si fait correctement).

Contrôler : `https://chez.votredentisterie.com/` répond avec l'en-tête `x-dc-variant`, formulaire et téléphone fonctionnels, GTM chargé. Laisser Unbounce publié 7 jours, puis le dépublier.

## 4. Retour arrière (≈ 2 minutes)

1. Retirer le domaine personnalisé du Worker.
2. Recréer le CNAME `chez` vers la valeur Unbounce notée, proxy désactivé.

## 5. Après la bascule

- Jour 1 : chaque demande visible dans HighLevel ; `/stats` → Envois échoués = 0.
- Jour 7 : comparer demandes/semaine à la référence Unbounce Iberville (≈ 4 % de conversion).
- Test A/B : décider après **au moins 4 semaines ou ~30 demandes par variante** et un écart significatif dans `/stats`. Sinon, garder A.
- Unbounce : renouvellement le 15 octobre 2026.
