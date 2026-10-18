# Reste à faire

État au 18 octobre 2026 : version 0.0.1 + **lot 1 « fidélité »** (Iowa, Yamato, Bismarck, Essex), second passage sur plans terminé.
Cases cochées = fait et vérifié ; cases vides = à faire. Les points marqués *(limite)* sont des choses que je ne sais pas faire
(ou pas vérifier) depuis l'environnement de développement actuel.

## 1. Lot 1 — Iowa, Yamato, Bismarck, Essex : terminé

Fait : tourelles à dimensions relevées (Mk 7, Type 94, Drh LC/34, 15,5 cm Type 3, 15 cm du Bismarck, 5"/38 Mk 28 / Mk 30), recul, bouche de
chaque tube, effets de bouche, livrées dazzle 1944 (Iowa, Essex). Second passage sur plans (octobre 2026) : chaque navire est superposé à un
plan (`tools/refs/overlay.py`) et tout a été repositionné.

- [x] **Coques** : largeurs du pont et de la flottaison relevées en plan (Iowa, Yamato), francs-bords (Iowa, Yamato, Bismarck), étrave clipper
  de l'Essex à coque longue, pavois limité à l'avant.
- [x] **Essex** : îlot plus fin et bien plus en avant (38,6 % de la longueur), cheminée à 18,7 m au-dessus du pont d'envol, mât et radar à
  35,8 m, directeurs Mk 37 ; tourelles doubles de 5" par paires sur le pont d'envol, devant et derrière l'îlot, tirant par-dessus le pont.
- [x] **Iowa** : roufles par niveaux, bloc autour de la cheminée avant, tour arrière et directeur Mk 38, quatre directeurs Mk 37, catapultes de
  plage arrière.
- [x] **Yamato** : cheminée inclinée, tourelles de 15,5 cm sur leurs barbettes, affûts de 12,7 cm de 1945 ; **tir du 46 cm filmé**.
- [x] **Bismarck** : hangars et catapulte transversale au milieu, tourelles de 15 cm hors du roof, tour étagée avec ses télémètres.
- [x] **Pièces secondaires en plein tir** (5"/38, 15 cm) : boule de feu et nuage de poudre réduits pour les calibres moyens.
- [x] **Champs `estimated`** : positions des quatre navires mesurées (le champ `measured` de chaque fiche dit d'où) ; restent estimés les
  10,5 cm et 3,7 cm du Bismarck, les affûts simples de 5" de l'Essex et quelques valeurs hors positions.
- [ ] **Sources** : navsource.org ne répond pas (nom de domaine introuvable depuis ce poste) et history.navy.mil refuse le certificat ;
  Wikimedia Commons suffit pour l'instant (plans et profils listés dans `tools/refs/sources.jsonl`).
- [ ] *Bismarck* : pas de vue de dessus libre trouvée, les largeurs de coque restent celles du constructeur générique.

## 2. Lot 2 et suivants — les 26 autres navires

Seuls les 4 navires du lot 1 ont des familles de tourelles et des superstructures relevées sur photos. Les autres sont construits
d'après leur fiche technique, avec des réglages à la main pour certains (`js/game/model/tweaks.js`).

| Nation | Destroyer | Croiseur léger | Croiseur lourd | Cuirassé | Porte-avions |
|---|---|---|---|---|---|
| États-Unis | Fletcher (5"/38 Mk 30 déjà) | Cleveland | Baltimore | **Iowa ✔** | **Essex ✔** |
| Japon | Kagerō | Agano | Takao | **Yamato ✔** | Shōkaku |
| Royaume-Uni | Tribal | Belfast | Norfolk | King George V | Illustrious |
| Allemagne | Type 1936A (Mob) | Königsberg | Admiral Hipper | **Bismarck ✔** | Graf Zeppelin |
| France | Le Fantasque | La Galissonnière | Algérie | Richelieu | Béarn |
| Italie | Soldati | Montecuccoli | Zara | Littorio | Aquila |

- [ ] **Priorité proposée** : cuirassés et porte-avions des autres nations (King George V, Richelieu, Littorio, Shōkaku, Illustrious), puis croiseurs lourds, croiseurs légers, destroyers.
- [ ] Pour chaque classe : chercher les photos libres, relever les proportions de tourelle, créer les familles de tourelles manquantes (quadruples et doubles du KGV, quadruples du Richelieu, triples du Littorio, doubles de 20 cm des croiseurs lourds, triples de 6" et 8" américains, etc.), refaire les superstructures, la livrée d'époque.
- [ ] Contrôler chaque tir en plein jeu (scène `firetest` : `node tools/trailer/record.mjs firetest <dossier> --q ship=<id>`).
- [ ] *Graf Zeppelin* et *Aquila* n'ont jamais été achevés : décider quelle configuration de projet représenter.

## 3. Effets et rendu (tous navires)

- [ ] **Lumière du tir** : le flash n'éclaire pas la coque ni l'eau alentour (pas de lumière dynamique) ; surtout visible la nuit.
- [ ] **Onde de choc** visible sur l'eau (anneau de souffle) en plus de l'écume.
- [ ] **Tir de nuit** : flamme plus longue et plus rouge, éclairage des tourelles (le tir de jour est le seul contrôlé).
- [ ] **Performance réelle** : mesurer une bordée de 9 tubes à plusieurs navires, avec les qualités haute / moyenne / basse (le GPU est maintenant disponible : RTX 3080 ; le test de fumée tourne à environ 60 images/s).

## 4. Vidéo et version

- [ ] **Refaire la bande-annonce** avec les nouveaux effets de tir et les nouvelles tourelles (`docs/trailer-v0.0.1.mp4` date d'avant le lot 1), puis la nommer v0.0.2 (ou v0.1.0) et mettre à jour la section du README, l'affiche et le GIF.
- [ ] **Tag `v0.0.1`** : il n'existe que sur la machine de développement (l'environnement refuse de pousser les tags). À faire de votre côté : `git tag v0.0.1 c22a94c && git push origin v0.0.1` (ou créer une version sur GitHub). Pour le lot 1, un nouveau tag sur `main` serait plus juste.
- [ ] **CHANGELOG** : passer la section « Unreleased » à un numéro de version quand elle sera publiée.
- [ ] **Dépôt public** : il est toujours privé (*limite* : je ne peux pas changer la visibilité). À faire de votre côté : *Settings → General → Danger Zone → Change visibility*.

## 5. Jeu

- [ ] **Contrôle manuel** : prévu dès le départ (`ShipCommand`, `controllers/manual.js`, testé par `test/manual.mjs`) mais pas encore branché à l'interface : prise de contrôle d'un navire, barre, régime moteur, visée, tir, avions.

## 6. Outils et tests

- [x] **Outils de références** rangés dans `tools/refs/` (téléchargement Wikimedia, vues standard, captures, planches ; voir son README) et `CLAUDE.md` pour reprendre le travail depuis un autre poste.
- [x] **`GPU=hardware`** : vérifié sur la RTX 3080 (adaptateur `nvidia` / `ampere`), shaders et test de fumée OK, environ 60 images/s. Sous WSL2 il faut lancer les outils avec le Node Windows (voir `CLAUDE.md`).
- [x] **Test de fumée en mode à l'écran** : passe avec le GPU (sans `?offscreen=1`).
- [ ] **Intégration continue** : aucun test ne tourne automatiquement sur GitHub ; ajouter un workflow qui lance `npm test` et `npm run check:shaders`.
- [ ] Tests visuels automatisés : comparer des captures de chaque navire à des images de référence pour repérer une régression de modèle.

## 7. Limites connues

- Les modèles sont **construits par le programme** (formes simples, pas de sculpture à la main) : ils suivront de près les proportions, mais ne seront jamais aussi détaillés qu'un modèle fait sous Blender.
- Les références viennent uniquement de **Wikimedia Commons** (domaine public, Bundesarchiv CC BY-SA 3.0 de) ; les mesures sont relevées à l'œil sur des photos, donc approximatives.
- Le rendu a été contrôlé en **rendu logiciel** seulement.
