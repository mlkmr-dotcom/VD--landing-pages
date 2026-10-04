# Journal des tests A/B

Chaque test est consigné **avant** son lancement. La règle de décision est dans `docs/PLAN-MESURE.md` (§ 6) et s'affiche dans `/stats`.

| Champ | À remplir |
| --- | --- |
| Identifiant | `src/config.js` → `test.id` |
| Hypothèse | « Si … alors … parce que … » |
| Critère principal | Demandes reçues ÷ visiteurs (sauf exception notée) |
| Garde-fous | Envois échoués = 0 · partage du trafic conforme · taux de RDV pris (HighLevel) pas inférieur |
| Dates | Début (= `TEST_START`) · revue à 14 jours · limite à 8 semaines |
| Décision | B gagne / A gagne / non concluant, avec les chiffres de `/stats` |
| Apprentissage | Ce qu'on retient pour le test suivant |

---

## vd-iberville-2026-10 — barre d'action fixe

- **Hypothèse :** si on ajoute une barre fixe « Appeler / Prendre rendez-vous » et le numéro sous le bouton du haut, plus de visiteurs nous contactent, parce que l'action reste à portée de pouce, surtout sur téléphone.
- **Variantes :**
  - A = nouvelle page (structure gagnante de Confort) ;
  - B = A + barre fixe + numéro sous le bouton du haut.
- **Critère principal :** demandes reçues ÷ visiteurs.
- **Critère secondaire :** contacts (demandes + clics téléphone, puis appels CallRail).
- **Garde-fous :** voir plus haut.
- **Même hypothèse que** `general-2026-10` (Confort) : lecture combinée à la fin.
- **Dates :** début à la bascule DNS ; revue à 14 jours ; limite à 8 semaines.
- **Décision :** —
- **Apprentissage :** —

## Prochain test proposé

À choisir dans la file d'attente de `docs/PLAN-MESURE.md` (§ 6) après lecture des sessions Clarity, par exemple : preuve sociale et équipe en haut de page, ou prise de rendez-vous en ligne.
