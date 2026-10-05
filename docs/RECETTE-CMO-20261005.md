# Recette avant bascule — 5 octobre 2026

Correctifs préparés sur branche de revue, sans bascule DNS ni publication GTM.

## Mesure A/B
- Séparer les formulaires acceptés par le relais HTTP et les clics téléphone. Un clic ne prouve ni un appel reçu ni un nouveau patient.
- Exclure les essais et les expériences précédentes.
- Le taux de formulaire utilise les visiteurs-jours ayant une visite préalable et un formulaire accepté le même jour, sur la même page, expérience et variante. Plusieurs formulaires du même visiteur-jour ne comptent qu'une fois dans ce taux; le compteur brut reste visible.
- Les ventilations par source et appareil exigent une visite correspondante.
- Le pseudonyme tourne chaque jour : il ne déduplique pas une personne sur plusieurs jours. Les comparaisons statistiques restent indicatives; aucune recommandation automatique de bascule à 100 %.
- Une réponse HTTP 2xx ne prouve pas la création du contact, de l'opportunité ou la réception des messages dans HighLevel.

## Isolation
- Un aperçu QA ou LEAD_DRY_RUN=1 ne doit jamais atteindre le webhook, même si celui-ci est configuré.
- Le navigateur doit afficher une confirmation d'essai sans promettre un rendez-vous ou envoyer une conversion.

## Conditions encore à vérifier dans les outils natifs
- Version Cloudflare déployée exactement égale au code relu; variables et secrets propres à chaque clinique.
- Formulaire réel, bonne opportunité, tags, workflow, courriel et SMS reçus, sans doublon : test explicite et coordonné, pas de faux patient.
- Appel réel vers la bonne clinique, numéro HighLevel et identité du compte vérifiés.
- GTM/GA4/Ads : événement unique sur succès accepté; aucun événement en QA ou après erreur; conserver les identifiants existants.
- Relecture Claude indépendante sur les deux branches et captures desktop/mobile.
- Même URL, TLS, redirections validées et procédure de retour arrière documentée.
- Aucun changement DNS, domaine, publication GTM ou fusion main sans décision explicite de Malek.
