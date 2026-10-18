# Reste à faire

État au 18 octobre 2026 : version 0.0.1 + **lot 1 « fidélité »** (Iowa, Yamato, Bismarck, Essex) fusionnés dans `main`.
Cases cochées = fait et vérifié ; cases vides = à faire. Les points marqués *(limite)* sont des choses que je ne sais pas faire
(ou pas vérifier) depuis l'environnement de développement actuel.

## 1. Lot 1 — ce qu'il reste sur Iowa, Yamato, Bismarck, Essex

Fait : tourelles à dimensions relevées sur photos (Mk 7, Type 94, Drh LC/34, 5"/38 Mk 28 / Mk 30), recul, bouche de chaque tube,
effets de bouche (éclair, boules de feu, nuage de poudre, écume), ponts de l'Iowa / pagode du Yamato / tour du Bismarck / îlot de
l'Essex, livrées dazzle 1944 (Iowa, Essex). Filmé et contrôlé : tir de l'Iowa, du Bismarck et de l'Essex.

- [ ] **Coques** : évasement (flare) et tonture de l'Iowa et de l'Essex, étrave de l'Essex ; comparer avec les plans, pas seulement les photos.
- [ ] **Essex** : îlot plus fin et plus haut, cheminée, mâts radar ; sponsons de 5" à comparer aux photos.
- [ ] **Iowa** : tour arrière et roufle devant la cheminée, à vérifier sur les photos ; directeurs de tir.
- [ ] **Yamato** : vérifier cheminée inclinée et tourelles secondaires triples de 15,5 cm ; **rendu de tir du 46 cm pas encore filmé** (seul le calcul de taille est fait).
- [ ] **Bismarck** : hangar et catapultes au milieu du navire, tourelles secondaires de 15 cm ; vérifier la tour après les derniers changements d'étages.
- [ ] **Pièces secondaires** : les 5"/38 de l'Iowa et les 15 cm du Bismarck n'ont pas été regardées de près en plein tir.
- [ ] **Champs `estimated`** des fiches (`js/game/data/specs/*.js`, 6 à 7 par nation) : positions de tourelles et hauteurs de mâts à confirmer avec des plans.
- [ ] **Sources** : refaire un passage avec d'autres photos si possible (*limite* : navsource.org et history.navy.mil sont bloqués ici ; seul Wikimedia Commons répond, avec limitation de débit).

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
- [ ] **Performance réelle** : tout a été mesuré en rendu logiciel (SwiftShader), jamais sur un vrai GPU. Mesurer une bordée de 9 tubes à plusieurs navires, avec les qualités haute / moyenne / basse (*limite* : pas de GPU dans l'environnement).

## 4. Vidéo et version

- [ ] **Refaire la bande-annonce** avec les nouveaux effets de tir et les nouvelles tourelles (`docs/trailer-v0.0.1.mp4` date d'avant le lot 1), puis la nommer v0.0.2 (ou v0.1.0) et mettre à jour la section du README, l'affiche et le GIF.
- [ ] **Tag `v0.0.1`** : il n'existe que sur la machine de développement (l'environnement refuse de pousser les tags). À faire de votre côté : `git tag v0.0.1 c22a94c && git push origin v0.0.1` (ou créer une version sur GitHub). Pour le lot 1, un nouveau tag sur `main` serait plus juste.
- [ ] **CHANGELOG** : passer la section « Unreleased » à un numéro de version quand elle sera publiée.
- [ ] **Dépôt public** : il est toujours privé (*limite* : je ne peux pas changer la visibilité). À faire de votre côté : *Settings → General → Danger Zone → Change visibility*.

## 5. Jeu

- [ ] **Contrôle manuel** : prévu dès le départ (`ShipCommand`, `controllers/manual.js`, testé par `test/manual.mjs`) mais pas encore branché à l'interface : prise de contrôle d'un navire, barre, régime moteur, visée, tir, avions.

## 6. Outils et tests

- [ ] **Outils de références** : les scripts qui téléchargent les photos et fabriquent les planches de comparaison (téléchargement Wikimedia, `shots.mjs`, `views*.json`, planches) sont encore dans le dossier de travail temporaire ; les ranger dans `tools/refs/` pour que le travail du lot 2 soit reproductible.
- [ ] **Test de fumée en mode à l'écran** : il échoue dans Chromium sans GPU (« swap chain »), seul le mode `?offscreen=1` passe. À essayer sur une machine avec GPU.
- [ ] **Intégration continue** : aucun test ne tourne automatiquement sur GitHub ; ajouter un workflow qui lance `npm test` et `npm run check:shaders`.
- [ ] Tests visuels automatisés : comparer des captures de chaque navire à des images de référence pour repérer une régression de modèle.

## 7. Limites connues

- Les modèles sont **construits par le programme** (formes simples, pas de sculpture à la main) : ils suivront de près les proportions, mais ne seront jamais aussi détaillés qu'un modèle fait sous Blender.
- Les références viennent uniquement de **Wikimedia Commons** (domaine public, Bundesarchiv CC BY-SA 3.0 de) ; les mesures sont relevées à l'œil sur des photos, donc approximatives.
- Le rendu a été contrôlé en **rendu logiciel** seulement.
