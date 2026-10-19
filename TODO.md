# Reste à faire

État au 19 octobre 2026 : **version 0.1.1** (flottes qui naviguent en formation, chasseurs et groupes aériens, pont d'envol animé, tirs et DCA calculés sur la géométrie des navires, sillages, livrées vérifiées ; la 0.1.0 : les 30 navires et tous les avions relevés sur plans).
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
- [ ] **Autres porte-avions et classes** : voir le tableau ci-dessous ; les croiseurs et les destroyers sont faits.

| Nation | Destroyer | Croiseur léger | Croiseur lourd | Cuirassé | Porte-avions |
|---|---|---|---|---|---|
| États-Unis | **Fletcher ✔** | **Cleveland ✔** | **Baltimore ✔** | **Iowa ✔** | **Essex ✔** |
| Japon | **Kagerō ✔** | **Agano ✔** | **Takao ✔** | **Yamato ✔** | **Shōkaku ✔** |
| Royaume-Uni | **Tribal ✔** | **Belfast ✔** (planche Profile Publications) | **Norfolk ✔** (notice Hasegawa 1/700) | **King George V ✔** | **Illustrious ✔** |
| Allemagne | **Type 1936A (Mob) ✔** (petit trois-vues) | **Königsberg ✔** | **Admiral Hipper ✔** | **Bismarck ✔** | **Graf Zeppelin ✔** |
| France | **Le Fantasque ✔** | **La Galissonnière ✔** | **Algérie ✔** | **Richelieu ✔** | **Béarn ✔** (photo) |
| Italie | **Soldati ✔** | **Montecuccoli ✔** | **Zara ✔** | **Littorio ✔** | **Aquila ✔** |

- [x] **Porte-avions restants** : Graf Zeppelin (feuille ONI 204, reconstruction), Aquila (dessin partagé, auteur inconnu : mesures seulement), Béarn (photo de 1927, ±1,5 m, pas de plan).
- [ ] **Béarn** : trouver un plan ; coque générique, ascenseurs et casemates de 155 mm estimés. **Graf Zeppelin** : le pont est mesuré mais l'îlot reste approximatif (feuille de 1942, pas de plan de construction).
- [ ] **Avions** : les empennages étaient deux fois trop petits (corrigé) ; SBD, B5N, Skua, TBF et D3A comparés à leurs dessins, Swordfish, Stuka (empennage mesuré), Fi 167, LN.401 (double dérive) et Re.2001 corrigés ; PL.10 : le trois-vues fourni a des proportions (longueur / envergure 0,68) qui ne correspondent pas à la fiche (0,77), identité à confirmer ; LN.401, PL.10 et Re.2001 restent à comparer (dessins fournis par le propriétaire du projet : © éditeur, mesures seulement) (empennage estimé à 0,33 de l'envergure) ; profils (hauteur) non vérifiés (les dessins ont des fils et des roues qui faussent la boîte englobante).
- [ ] **Croiseurs (lot 4)** : *Cleveland*, *Baltimore*, *Agano*, *Belfast* et *Norfolk* sont mesurés sur des dessins partagés (Colosseum, Pit-Road, Shipbucket, TZoli, Profile Publications, Hasegawa : © de leurs auteurs, mesures seulement, non redistribués ; à contacter si le jeu devient public). *Norfolk* et *Algérie*, *La Galissonnière* : dessins de 2-5 px/m (±0,6 à 1 m). Positions des 127 mm, 100 mm, 90 mm, 102 mm et de la DCA légère estimées, sauf *Baltimore* (plan TZoli), *Zara* et *Algérie* (plan ONI).
- [ ] **Destroyers (lot 5)** : *Fletcher*, *Tribal*, *Mob* sont mesurés sur des dessins partagés (© de leurs auteurs, mesures seulement, non redistribués) ; *Kagerō* sur un dessin CC BY-SA 4.0 ; *Le Fantasque* sur une feuille partagée (profil + plan, ±0,5 m) ; *Soldati* sur un petit dessin partagé (±0,6 m) ; tubes du *Fantasque* lus sur le plan mais les affûts de bord sont dessinés sur l'axe.
- [ ] Pour chaque classe : chercher les plans libres (`tools/refs/search.py`, feuilles ONI sur Commons), créer les familles de tourelles manquantes, refaire les superstructures, la livrée d'époque.
- [ ] Contrôler chaque tir en plein jeu (scène `firetest` : `node tools/trailer/record.mjs firetest <dossier> --q ship=<id>`).
- [ ] **Chasseurs (limites)** : les bombardiers ne manœuvrent pas pour éviter la chasse (ils se resserrent mais n'esquivent pas) et ne se mettent à l'abri des navires amis qu'au retour, pas avant l'attaque (leur flotte est trop loin) ; la route d'approche évite la DCA mais pas les patrouilles de chasse ; pas de mitraillage des navires ni des avions au sol ; pas de manœuvre d'évitement des bombardiers ; un seul type de chasseur par nation (D.520 et MC.202 estimés pour le *Béarn* et l'*Aquila*, qui n'ont pas eu de groupe de chasse de ce type) ; vitesse et manœuvrabilité simplifiées (roulis limité, pas de décrochage) ; les chasseurs ne reviennent pas sur un porte-avions détruit (ils amerrissent).
- [ ] **Peintures (limites)** : les teintes viennent des valeurs Munsell / RAL publiées et sont approchées en sRGB (le rendu éclaircit tout : à juger côte à côte, pas en absolu) ; non trouvé dans les sources : le motif exact du *Yukikaze* en 1945 (le gris de Kure avec taches vertes est une hypothèse), les gris français (« gris clair ») et leurs marques de reconnaissance (Vichy), les gris des arsenaux japonais (Kure, Sasebo, Maizuru, Yokosuka sont distincts mais un seul est modélisé) ; les marques d'identification aérienne allemandes ne sont pas dessinées : le *Bismarck* les a fait recouvrir avant le 24 mai 1941 (état modélisé), et pour les autres navires on ne trouve que la teinte unie des dessus de tourelles adoptée après l'hiver 1939-40 ; le *Yamato* n'a pas sa tourelle n° 1 noircie (toutes les tourelles d'une classe partagent le même modèle) ; les dessus de tourelles sombres ne sont documentés que pour le *Bismarck*.
- [ ] **Tactique de flotte (limites)** : la flotte tourne autour de l'ennemi à une distance fixe ; pas de manœuvre d'ensemble pour croiser le T, pas de division en deux escadres, pas de retraite de la flotte entière quand elle est dominée (seuls les navires gravement touchés rompent), pas de reconnaissance ni de porte-avions qui vire face au vent pour lancer ses avions ; l'escorte des porte-avions est toujours de deux destroyers par porte-avions (aucun si la flotte en a trop peu) ; les croiseurs ne font pas d'écran de DCA autour du porte-avions.
- [ ] **Îles (limites)** : pas de végétation, de bâtiments ni de ports (un sol coloré par altitude et pente, avec du grain dans le shader) ; les avions ne peuvent ni se poser ni se réfugier sur une île ; les navires ne font pas de bombardement côtier (les obus ne visent que des navires) ; le sol est une carte de hauteurs (pas de falaises en surplomb ni de grottes) et le plateau est une pente régulière de 12 % ; l'IA contourne une île par un seul point de passage (une baie fermée entre deux îles proches peut la faire tourner un moment) ; ni vent ni ombre portée de l'île sur la mer.
- [ ] **Végétation (limites)** : huit espèces génériques (pas d'espèces propres à chaque île réelle), pas de sous-bois herbacé en volume (l'herbe est dans le shader du sol), pas de fleurs ni de lianes ; les arbres sont purement visuels (pas d'effet sur la simulation : obus, avions et navires les ignorent) et ne brûlent pas sous les obus ; les ombres des arbres ne sont tracées que près des navires suivis (la carte d'ombre est centrée sur eux) ; les passages d'un niveau de détail à l'autre se voient un peu (changement brusque à 105 m, 300 m et 1 km, sans fondu) ; saison unique (été), pas de neige en altitude ; le vent est une rafale unique, sans lien avec la mer.
- [ ] **Zones de touche (limites)** : les obus sont arrêtés par les blocs, prismes et cylindres du modèle (les mâts en tripode, les rambardes, les haubans, les canons et les affûts légers de moins de 0,15 m ne comptent pas : 3 % des trajectoires traversent un volume dessiné sans être arrêtées) ; les tourelles sont des boîtes (un obus qui frôle un angle arrondi ou la pente d'un toit de tourelle peut éclater 2 à 10 m trop tôt) ; la coque est la forme analytique du modèle, pas le maillage ; les avions gardent leur ancienne boîte.
- [ ] **Zones de touche des avions (limites)** : l'avion est un ellipsoïde (fuselage), deux plans (ailes, empennage) et une dérive, dont on prend la surface vue de la ligne de tir (pas un maillage) ; les tirs de DCA et de mitrailleuses ne sont pas des projectiles suivis un à un (on calcule, pour chaque tir, la chance qu'un obus touche à partir de la visée réelle de l'arme et de la position de l'avion à l'arrivée) ; la trace lumineuse n'est donc pas reliée à un impact précis sur la cellule ; l'avion est supposé garder sa trajectoire pendant le temps de vol ; le roulis de l'avion ne change pas sa surface ; les avions ne se touchent pas entre eux.
- [ ] **Cockpit et effets (limites)** : le cockpit est un modèle par type d'avion (cadrans lisibles mais sans chiffres, pas de verrière en verre ni de saleté, pas de mains du pilote, pas de siège visible) ; les ombres du cockpit sont celles du ciel (le soleil y est réduit) ; la chaleur ne déforme pas l'air derrière les feux (il faudrait une passe de post-traitement) ; les flammes n'éclairent pas le pont ni la mer autour (pas de lumières dynamiques) : seul le dessous de la fumée est orangé ; les gerbes d'obus ne se mêlent pas aux vagues (pas de collision avec la houle).
- [ ] **Secteurs de tir (limites)** : calculés sur les boîtes englobantes des superstructures (contour exact pour les prismes et les cylindres, mais pas pour les mâts et les haubans, ni les petits équipements de moins de 1,3 m) ; les casemates dans la coque ne sont pas testées ; les tubes lance-torpilles n'ont pas de secteur propre (±65° du travers) ; la zone d'ombre d'une tourelle sur sa voisine ne dépend pas de l'orientation de celle-ci (cylindre) ; les mêmes boîtes servent à la DCA, dont le volume de feu réel n'est donc qu'approché.
- [ ] **Opérations aériennes (limites)** : le rassemblement dure une à trois minutes (de 15 min à plus d'une heure en vrai) ; les vitesses d'approche, de montée et de circuit sont des estimations (1,2 fois la vitesse de décrochage) faute de chiffres publiés ; aucun temps de virage à 360° publié pour ces avions ; le Ju 87 C, le Bf 109 T et le PL.10 de série n'ont pas de fiche de performances ; pas de vent (la vitesse sur le pont vient seulement de celle du navire) ; l'arrêt par brin est adouci par rapport aux brins de l'époque (2 à 3 g de crête) pour la lisibilité ; pas de catapulte ni de décollage à l'accélérateur ; la caméra de pont est fixe (pas d'officier d'appontage).
- [ ] **Pont d'envol (limites)** : pas de personnel de pont (aiguilleur, officier d'appontage avec ses raquettes), pas de barrière de sécurité ni de catapulte (course de 100 m), pas de miroir ni de feux de pente ; le vent relatif n'est pas modélisé (le circuit est dans le repère du navire, avec un vent nul) ; les ascenseurs sont ceux des carrés peints (positions de `tweaks.js`) ; sur l'*Aquila*, aucun n'est derrière le départ de la course : ses avions qui ne sont pas au parc apparaissent directement dans la file. Les avions du parc sont tous du même type (le bombardier en piqué de la nation).
- [ ] *Graf Zeppelin* et *Aquila* n'ont jamais été achevés : décider quelle configuration de projet représenter.

## 3. Effets et rendu (tous navires)

- [ ] **Lumière du tir** : le flash n'éclaire pas la coque ni l'eau alentour (pas de lumière dynamique) ; surtout visible la nuit.
- [ ] **Onde de choc** visible sur l'eau (anneau de souffle) en plus de l'écume.
- [ ] **Tir de nuit** : flamme plus longue et plus rouge, éclairage des tourelles (le tir de jour est le seul contrôlé).
- [ ] **Performance réelle** : mesurer une bordée de 9 tubes à plusieurs navires, avec les qualités haute / moyenne / basse (le GPU est maintenant disponible : RTX 3080 ; le test de fumée tourne à environ 60 images/s).

## 4. Vidéo et version

- [x] **Bande-annonce 0.1.0** faite (`docs/trailer-v0.1.0.mp4`, 89 s, 1080p 60 images/s : deux batailles de flottes, 26 navires, tirs) + comparatif côte à côte avec la 0.0.1 (`docs/comparatif-0.0.1-0.1.0.mp4`) ; l'ancienne est conservée.
- [ ] **Tags** : l'environnement refuse de pousser les tags. À faire de votre côté après le merge : `git tag v0.1.1 && git push origin v0.1.1` (ou créer une version sur GitHub). Idem `v0.0.1` : `git tag v0.0.1 c22a94c`.
- [x] **CHANGELOG** : la section est passée en « 0.1.0 ».
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
