# Mesure et A/B testing

## Ce qui est compté (base D1 `events`)

| Événement | Origine | Sens |
|---|---|---|
| `view` | navigateur → `/api/e` au chargement | une visite (robots exclus : il faut exécuter le JS, et liste de robots connus) |
| `form_start` | premier clic dans le formulaire | intention |
| `cta` | clic « Prendre rendez-vous » | intention |
| `tel` | clic sur un numéro | clic, **pas** un appel abouti |
| `engaged` | moitié de la page atteinte ou 30 s de lecture (onglet visible) | visite engagée |
| `form_invalid` | envoi refusé par le navigateur (champ invalide) | friction du formulaire |
| `lead` | serveur, après réponse 2xx du webhook HighLevel | **demande reçue** — c'est la conversion |
| `lead_error` | serveur, webhook en échec | à surveiller (doit rester à 0) |

- **Visiteurs** = visiteurs uniques par jour : empreinte calculée sur le serveur (sel quotidien + IP + navigateur), ni l'IP ni l'empreinte ne permettent de suivre une personne d'un jour à l'autre. Aucun cookie de suivi.
- **Taux de conversion** = demandes reçues ÷ visiteurs.
- Exclus : robots, aperçus `?dc_variant=…`, tests `?dc_qa=1`.

## A/B testing

- Répartition aléatoire au premier passage, mémorisée 30 jours (cookie fonctionnel `vd_ab_iberville`, nécessaire pour qu'un visiteur voie toujours la même version).
- La variante est envoyée à HighLevel (`ab_variant`) et dans `dataLayer` / GA4 (`ab_variant`).
- Le tableau de bord donne une **décision bayésienne** : probabilité que B batte A, écart probable avec intervalle, perte attendue. Il contrôle aussi le partage du trafic (SRM). La valeur p classique reste affichée à titre indicatif.
- Règle de décision, plan de marquage complet, Clarity et consentement : voir **`docs/PLAN-MESURE.md`**. Journal des tests : `docs/TESTS.md`.

## Suivi Google

- GTM `GTM-M29KWPM` (le même conteneur que la page Unbounce actuelle).
- Après acceptation du formulaire par HighLevel : `dataLayer.push({ event: 'vd_lp_form_success', clinic_id: 'vd-iberville', page_path: '/', ab_test, ab_variant, event_id, tracking_schema: 'vd_lp_success_v1' })`. Dans GTM : déclencheur « Événement personnalisé » `vd_lp_form_success` → conversion Google Ads (utiliser `event_id` comme ID de transaction pour éviter les doublons).
- Le formulaire n'envoie plus rien à Unbounce : la conversion « formulaire Unbounce » de Google Ads doit être remplacée par celle-ci au moment de la bascule.
