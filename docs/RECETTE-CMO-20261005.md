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

## Derniers contrôles
- En aperçu (QA, variante forcée ou dry run), une politique CSP empêche scripts, connexions et frames externes; la production conserve ses balises.
- Les événements internes sont marqués QA par le serveur en dry run, même si le navigateur omet son marqueur.
- Tests locaux et build : 48/48 pour Iberville. Numéro HighLevel 450 390-3135 repris sur les deux variantes, la confidentialité et le secours 404; renvoi réel encore à tester.

## Contre-vérification Claude — 5 octobre
Revue indépendante des versions b1ad9cc (DC) et 5bfb317 (VD) : affichage A/B desktop/mobile, formulaires acceptés/rejetés, event_id, absence de données personnelles en mesure et isolation QA validés sur faux webhook. Aucun envoi patient.

Retouches A1/A2 intégrées après cette revue : même hostname référent pour la visite et sa demande organique; toute URL dont le hostname diffère de SITE.host est isolée (CSP, aucun webhook et événements QA), sans dépendre d’un paramètre de test. Régression serveur sans marqueur, attribution organique et navigateur Iberville. Tests finaux : 51/51; build A/B réussi.

La recette réelle Cloudflare/HighLevel/GTM, l’appel réel et l’approbation DNS restent nécessaires. Iberville conserve LEAD_DRY_RUN=1 dans cette branche.

## Protection des replays — préparation du branchement
DEDUPE_REQUIRED=1 ajouté dans la configuration de branche. Une table D1 privée lead_receipts ne contient que la référence technique, l’état et deux timestamps. INSERT OR IGNORE réserve la référence avant tout webhook; un replay retourne409 sans nouvelle conversion ni relais, même après500/timeout. D1 absent/indisponible entraîne503 avant relais. Pas de réservation en QA/dryrun. Une reprise manuelle identique conserve son event_id en mémoire de page; contenu modifié = nouvelle référence. Pas de retry automatique ni de suppression automatique du registre. Le statut accepted signifie HTTP2xx du relais, pas réception CRM ni livraison SMS. Un crash conserve pending, bloqué jusqu’à réconciliation humaine. Tests SQLite concurrents, échec/replay, absence de données contact et runtime de reprise; aucune requête réelle.
Le registre ne déduplique pas des demandes volontairement nouvelles avec un nouvel identifiant et ne remplace pas le contrôle des workflows CRM. Prévoir une gestion de rétention du registre ultérieurement, sans ajouter de collecte patient.

## UX après panne — retours Claude corrigés
La panne ne propose plus de réessayer une référence volontairement bloquée. Le message409 est réinitialisé à chaque nouvelle tentative; un contenu modifié puis une nouvelle panne affiche le texte prudent standard. Confort rejette une référence invalide en422avant D1 quand la garde est activée. Dernier lot 63/63tests etbuild A/B réussis. Vérifier DEDUPE_REQUIRED=1 etDBsur la version prévue au branchement.
