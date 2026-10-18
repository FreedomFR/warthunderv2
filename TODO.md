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
- [x] **Vérification chiffrée** contre les plans (`tools/refs/check.mjs` + `silhouette.py`) : écart moyen du profil Iowa 1,5 m, Yamato 2,0 m
  (0,55 m sous l'eau), Bismarck 1,3 m (0,3 m sous l'eau) ; vue de dessus Iowa 0,7 m, Yamato 1,0 m. Le reste est surtout du gréement,
  des antennes et des mâts de charge que le modèle ne cherche pas à avoir.
- [x] **DCA, embarcations, passerelles, hélices et safrans** relevés sur les plans (Essex : d'après photos, estimé).
- [ ] **Machines** (chaufferies, turbines) : placées d'après les descriptions publiées, faute de plan de coupe libre ; à reprendre si
  un plan d'aménagement intérieur est trouvé.
- [ ] **Essex** : pas de plan libre trouvé (seul un avant-projet de 1939) ; profil d'après la photo du Ticonderoga, DCA estimée.
- [ ] **Iowa** : œuvres vives estimées (pas de plan de la carène), tirant d'eau du dessin inconnu.
- [ ] **Sources** : navsource.org ne répond pas (nom de domaine introuvable depuis ce poste) et history.navy.mil refuse le certificat ;
  Wikimedia Commons suffit pour l'instant (plans et profils listés dans `tools/refs/sources.jsonl`).
- [ ] *Bismarck* : pas de vue de dessus libre trouvée, les largeurs de coque restent celles du constructeur générique.

## 2. Lot 2 et suivants

Lot 2 (cuirassés et porte-avions des autres nations) : **fait, avec des réserves** ; même méthode (plans libres, vérification chiffrée). Résultats :

| Navire | Source des mesures | Écart moyen du profil |
|---|---|---|
| Littorio | feuille ONI 202 (profil + plan, échelle en pieds) | 2,5 m (plan : 0,2 m) |
| Richelieu | coupe longitudinale de la classe, CC BY-SA 4.0 | 1,3 m (0,3 m sous l'eau) |
| Shōkaku | profil + plan avec barre d'échelle de 50 m, CC BY-SA 3.0 | 0,6 m (plan : 2,9 m, tubs de DCA et mâts rabattus) |
| Illustrious | feuille ONI 201 (pont d'envol 40 ft, cheminée 91,5 ft) | 0,8 m |
| King George V | profil + plan de Manuel P. González López (© : mesures seulement, non redistribué) | 1,9 m (plan : 0,2 m) |

- [ ] **King George V** : DCA légère non mesurée (placement aléatoire), décalage transversal des arbres estimé ; le plan est protégé (© de l'auteur) : ne pas le redistribuer, ne pas le mettre dans le dépôt ; demander l'accord de l'auteur si le jeu devient public.
- [ ] **Richelieu, Littorio** : pas de vue de dessus du Richelieu (coupe centrale) ; largeurs de coque estimées ; pièces hors de l'axe estimées.
- [ ] **Shōkaku, Illustrious** : vue de dessus du Shōkaku à comparer en retirant les tubs de DCA ; pas de plan de l'Illustrious à l'échelle (la vue de dessus de la feuille est trop petite).
- [ ] **Autres porte-avions et classes** : voir le tableau ci-dessous ; les croiseurs lourds, croiseurs légers et destroyers restent à faire.

| Nation | Destroyer | Croiseur léger | Croiseur lourd | Cuirassé | Porte-avions |
|---|---|---|---|---|---|
| États-Unis | Fletcher (5"/38 Mk 30 déjà) | Cleveland | Baltimore | **Iowa ✔** | **Essex ✔** |
| Japon | Kagerō | Agano | Takao | **Yamato ✔** | **Shōkaku ✔** |
| Royaume-Uni | Tribal | Belfast | Norfolk | **King George V ✔** | **Illustrious ✔** |
| Allemagne | Type 1936A (Mob) | Königsberg | Admiral Hipper | **Bismarck ✔** | **Graf Zeppelin ✔** |
| France | Le Fantasque | La Galissonnière | Algérie | **Richelieu ✔** | **Béarn ✔** (photo) |
| Italie | Soldati | Montecuccoli | Zara | **Littorio ✔** | **Aquila ✔** |

- [x] **Porte-avions restants** : Graf Zeppelin (feuille ONI 204, reconstruction), Aquila (dessin partagé, auteur inconnu : mesures seulement), Béarn (photo de 1927, ±1,5 m, pas de plan).
- [ ] **Béarn** : trouver un plan ; coque générique, ascenseurs et casemates de 155 mm estimés. **Graf Zeppelin** : le pont est mesuré mais l'îlot reste approximatif (feuille de 1942, pas de plan de construction).
- [ ] **Avions** : les empennages étaient deux fois trop petits (corrigé) ; SBD, B5N, Skua, TBF et D3A comparés à leurs dessins, Swordfish et Stuka (empennage mesuré) corrigés ; Fi 167, LN.401, PL.10 et Re.2001 restent à comparer (dessins fournis par le propriétaire du projet : © éditeur, mesures seulement) (empennage estimé à 0,33 de l'envergure) ; profils (hauteur) non vérifiés (les dessins ont des fils et des roues qui faussent la boîte englobante).
- [ ] **Priorité proposée** : croiseurs lourds, croiseurs légers, destroyers.
- [ ] Pour chaque classe : chercher les plans libres (`tools/refs/search.py`, feuilles ONI sur Commons), créer les familles de tourelles manquantes, refaire les superstructures, la livrée d'époque.
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
