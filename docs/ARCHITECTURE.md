# Architecture et documentation technique

Ce document reprend, en détail, ce que le [README](../README.md) résume : le contenu des navires et des avions, les dégâts, le son, la simulation,
l'organisation du code, les paramètres d'URL et la mise en place d'un poste de développement. Les crédits des plans et des photographies sont dans
[CREDITS.md](CREDITS.md).

## Utilisation

1. **Écran de composition** : choisissez un scénario ou composez vos équipes (nation, classe, nombre de navires,
   2 à 4 équipes, distance entre flottes, graine du combat).
2. **Faire apparaître les flottes** : les navires sont posés sur l'eau en formation, immobiles. Les modifications
   suivantes se voient immédiatement. Changez de caméra, regardez-les de près.
3. **Lancer le combat** : tout est autonome. Accélérez le temps (0,5× à 8×) ou mettez en pause.
4. À la fin, un écran de victoire résume les dégâts, tirs, touches et navires coulés.

| Composition des flottes | Impact sur le Yamato | Vue tactique |
|---|---|---|
| ![Composition des flottes](fleet.jpg) | ![Impact](action.jpg) | ![Tactique](tactical.jpg) |

### Caméras (touches 1 à 9)

| Touche | Caméra |
|---|---|
| 1 | **Auto** : un réalisateur suit l'action (navires touchés, salves, naufrages) et alterne les plans |
| 2 | **Poursuite** derrière le navire sélectionné (glisser : orbiter, molette : zoom) |
| 3 | **Orbite** lente autour du navire |
| 4 | **Passerelle** : vue depuis le pont de commandement |
| 5 | **Obus** : suit les obus tirés jusqu'à l'impact |
| 6 | **Tactique** : vue de dessus (glisser : déplacer, molette : altitude) |
| 7 | **Libre** : ZQSD / WASD, Espace / Ctrl pour monter / descendre, Maj = rapide |
| 8 | **Avions** : suit un avion. `V` change de vue : poursuite derrière l'appareil (le long de sa trajectoire, donc dans le piqué), passage devant l'avion, ou vue depuis le pont du navire attaqué. `N` / `B` : avion suivant / précédent. Après un écrasement, la caméra reste sur l'impact |
| 9 | **Cockpit** : vue du pilote (verrière ouverte), glisser pour regarder autour |

`J` (ou le bouton « Impacts ») : **journal des impacts** et étiquettes flottantes — type d'obus, calibre, angle d'attaque, épaisseur du blindage (et effective) contre pénétration, résultat (perce, traverse, ricochet, ne perce pas, éclate) et dégâts de chaque touche. `Tab` (maintenu) ou le bouton « Tableau » : **tableau de bord du combat en temps réel**, par équipe et par navire (navires coulés, avions abattus, obus tirés, touches, précision, torpilles, dégâts infligés, état, et les derniers naufrages). `N` / `B` : navire suivant / précédent (avion suivant / précédent en caméras 8 et 9). Le réalisateur automatique (touche 1) coupe aussi sur les largages de bombes et de torpilles et sur les avions touchés. Un clic sur un navire le sélectionne, ainsi qu'un clic dans la
liste des équipes. `Espace` : pause. `,` et `.` : ralentir / accélérer. `L` : plaques de nom. `H` : réglages de
l'océan, du ciel et de la qualité. `F1` : aide.

## Bande-annonce — version 0.1.0

[![Bande-annonce de la version 0.1.0 (aperçu animé)](trailer-v0.1.0.gif)](trailer-v0.1.0.mp4)

▶ [**Voir la bande-annonce complète** (MP4, 89 s, 1920×1080, **60 images/s**, 36 Mo)](trailer-v0.1.0.mp4)

Cette version montre les 30 navires et tous les avions relevés sur plans d'époque (tourelles, cheminées, mâts, ponts, hélices), deux batailles de flottes
(Atlantique, Méditerranée) avec dix navires chacune, les nouveaux effets de tir et 17 nouvelles familles de tourelles. Pour mesurer le chemin parcouru depuis la 0.0.1, une vidéo met les deux versions côte à côte, **mêmes scènes, mêmes graines
aléatoires** : ▶ [**Comparatif 0.0.1 / 0.1.0**](comparatif-0.0.1-0.1.0.mp4) (MP4, 48 s, 24 images/s, 20 Mo). La bande-annonce d'origine est conservée :
▶ [bande-annonce 0.0.1](trailer-v0.0.1.mp4) (48 s).

Toutes les images sont rendues par le jeu lui-même, image par image (environ 2 min de calcul par scène en 1080p 60 images/s avec une RTX 3080 : 35 min pour toute la vidéo ; plusieurs heures en rendu logiciel sans carte
graphique), les sons sont ceux du jeu et la musique est synthétisée par programme. Les plans sont cadrés par script (`js/trailerScenes.js`) ; pour deux
d'entre eux (la bombe sur le croiseur et la torpille sur le Takao), l'arme est placée près de sa cible pour que l'impact tombe dans le
champ de la caméra : l'impact lui-même est calculé par le vrai modèle de dégâts du jeu. Voir `tools/trailer/README.md` pour refaire la vidéo.

## Les navires

Chaque navire est un modèle 3D **construit par le programme à partir de la fiche technique du vrai bâtiment**
(longueur, largeur, tirant d'eau, tonnage, vitesse, position des tourelles / cheminées / mâts / îlot, calibres,
nombre de tubes lance-torpilles, blindage, balistique). Il n'y a aucun fichier de modèle 3D.

| Nation | Destroyer | Croiseur léger | Croiseur lourd | Cuirassé | Porte-avions |
|---|---|---|---|---|---|
| États-Unis | Fletcher | Cleveland | Baltimore | Iowa | Essex |
| Japon | Kagerō | Agano | Takao | Yamato | Shōkaku |
| Royaume-Uni | Tribal | Town (Belfast) | County (Norfolk) | King George V | Illustrious |
| Allemagne | Type 1936A (Mob) | Königsberg | Admiral Hipper | Bismarck | Graf Zeppelin |
| France | Le Fantasque | La Galissonnière | Algérie | Richelieu | Béarn |
| Italie | Soldati | Raimondo Montecuccoli | Zara | Littorio | Aquila |

Les fiches sont dans `js/game/data/specs/` (avec leurs sources). Les champs que les sources ne donnaient pas
(positions précises des tourelles, hauteurs de mâts…) sont marqués `estimated` : ce sont des estimations d'après le
profil connu du navire, donc certains détails peuvent différer légèrement de l'original. Le *Graf Zeppelin* et
l'*Aquila* n'ont jamais été achevés ; ils sont modélisés d'après leur conception réelle.

**Détails visuels** (depuis la version 0.0.1) : occlusion ambiante précalculée dans les sommets, tôlerie en relief, **camouflages** selon les
livrées de chaque classe (dazzle, Admiralty, « sunburst » italien, taches japonaises), **pavillons nationaux** qui flottent au vent (le
pavillon allemand est la Reichskriegsflagge d'avant 1935, sans svastika), **numéros de coque** dessinés, tourelles, garde-corps,
canots sur bossoirs, radeaux, gréement et pavillons de signaux. Les détails fins ne sont dessinés que de près, les navires hors champ ne
sont pas dessinés et la qualité s'adapte à la machine (*Réglages* → « Qualité » : auto / haute / moyenne / basse).

**Lot 1 « fidélité »** (Iowa, Yamato, Bismarck, Essex), d'après des photographies et plans libres de droits :
- **Navires relevés sur plans** : positions des tourelles, cheminées, mâts, tours, pièces secondaires, directeurs de tir, catapultes et hangars,
  largeurs du pont et de la flottaison, francs-bords ; chaque plan est superposé au modèle pour vérifier (`tools/refs/overlay.py`).
- **Tourelles à dimensions réelles** (`js/game/model/mounts.js`) : triple 16"/50 Mk 7 de l'*Iowa* (longue et basse : 3,4 m de haut, entraxe des
  tubes 3,05 m), triple 46 cm Type 94 du *Yamato* (4,3 m de haut, 18,5 m de long, bouche claire), double 38 cm Drh LC/34 du *Bismarck*, triple
  15,5 cm du *Yamato* sur ses hautes barbettes, double 15 cm du *Bismarck*, double 5"/38 Mk 28 et simple Mk 30 de l'*Essex*. Chaque tube a sa vraie bouche, sa tige de piston de recul et sa position de départ du
  projectile ; le recul suit une courbe réelle (course rapide, retour hydraulique lent).
- **Superstructures** : ponts successifs du château de l'*Iowa* (7 niveaux), pagode à 9 étages du *Yamato*, tour du *Bismarck*, îlot de l'*Essex* ;
  livrées « dazzle » de 1944 pour l'*Iowa* et l'*Essex*. Les teintes ont été recoupées avec les références publiées (valeurs Munsell des peintures de l'US Navy, gris 507A/507C de la Royal Navy, cartes RAL de la Kriegsmarine) : par exemple la coque *Dunkelgrau* 51 et les superstructures *Hellgrau* 50 allemandes, le gris *Home Fleet* sombre du *Norfolk*, le gris clair méditerranéen de l'*Illustrious* ; les ponts d'envol ont la couleur de leur marine. Les navires italiens de 1940-42 portent leurs **bandes de reconnaissance rouges et blanches** (pont avant et arrière, dessus des tourelles), le *Yamato* son pont de bois teint en noir et le *Bismarck* ses dessus de tourelles gris foncé.
- **Effets de tir** : flamme de bouche en trois temps (éclair blanc, boule de feu orange à cœur blanc qui refroidit et s'éteint, anneau de fumée
  brune puis nuage de poudre), souffle qui creuse l'écume et soulève l'eau sous la volée, gîte du navire sous l'effet du recul. Les boules de feu
  sont des particules à part (`FIREBALL`), les particules ne sont plus coupées net par la surface de la mer, et le rendu s'adapte au calibre
  (de 5" à 46 cm) et à la distance.


## Les avions

Chaque porte-avions embarque les appareils de sa nation, modélisés d'après les avions réels : **SBD Dauntless** et
**TBF Avenger** (USA), **Aichi D3A « Val »** et **Nakajima B5N « Kate »** (Japon), **Skua** et **Swordfish** biplan (Royaume-Uni),
**Ju 87 Stuka** (avec sa sirène) et **Fi 167** (Allemagne), **LN.401** et **PL.10** (France), **Re.2001** (Italie).
Les croiseurs et cuirassés ont aussi leur hydravion sur la catapulte (Kingfisher, Walrus, Arado 196...).

| Les appareils (SBD, TBF, Swordfish, Stuka) | Torpilleur à basse altitude | Bombardiers en piqué, DCA et fumée de combat |
|---|---|---|
| ![Appareils](planes.jpg) | ![Torpilleur](air.jpg) | ![DCA](aa.jpg) |

- **Pont d'envol** : un avion sort du parc ou monte de l'hangar sur un **ascenseur** (plateforme qui émerge du pont), déplie ses ailes, démarre son moteur
  (fumée d'échappement, hélice qui prend ses tours), roule jusqu'au bout de la file et fait sa course de décollage : la queue se lève, puis le nez. Les avions
  du parc, ailes repliées sur trois rangs, partent les premiers ; entre deux vagues l'équipage **regarnit le parc** depuis l'hangar. Sorti du pont, l'avion **monte droit devant lui** jusqu'à avoir dépassé l'étrave de 150 m et pris 60 m, puis tourne en **cercle d'assemblage** au-dessus de la mer devant le porte-avions (rayon et altitude selon le type) **jusqu'à ce que toute la vague, escorte comprise, ait décollé** ; alors les sections se forment derrière leurs chefs et partent. Au retour, le parc est
  descendu avant le premier appontage, puis chaque avion suit le **circuit** (vent arrière du côté opposé à l'îlot, virage en descente, dernière ligne
  droite sur une pente de 3,5°), crosse et train sortis. Les suivants **tournent en attente** (un cercle) tant que la ligne droite n'est pas libre. Les roues
  touchent le pont derrière les brins, la **crosse accroche un brin** qui se dévide et arrête l'avion progressivement (traction qui monte puis retombe, 0,7 à 1 g au plus, sur 20 à 70 m, en 2,5 à 4 s ; nez qui plonge, étincelles) ; la caméra de l'avion se place alors **sur le pont, à côté des brins** ; une crosse qui
  rate les brins donne un *bolter* : plein gaz et nouveau tour. Ailes repliées, l'avion roule jusqu'à un ascenseur qui le redescend. Un porte-avions dont le
  pont est détruit ne peut plus lancer ni récupérer ses avions (ils amerrissent). Sons : démarrage du moteur, moteur d'ascenseur, impact des roues, brin.
- **Vitesses** (`sim/airperf.js`) : chaque type vole à sa vitesse, tirée des performances publiées : croisière de frappe (Swordfish et PL.10 vers 165 km/h, Dauntless et Avenger 280 km/h, Skua et Val 300 km/h), vitesse de lancement de la torpille ou de piqué, montée, circuit d'appontage, approche et vitesse de décollage ; le rayon du circuit, la longueur de la branche vent arrière et la vitesse d'arrivée sur le pont en découlent (voir le tableau dans le CHANGELOG).
- **Chasseurs** : un quart du groupe aérien (Hellcat, Zéro, Fulmar, Bf 109 T, D.520, MC.202). Chaque raid part avec 2 à 4 chasseurs d'**escorte** (au-dessus et en avant des bombardiers) ; quand des
  avions ennemis approchent de la flotte, une **patrouille** décolle et tourne au-dessus des navires. Le chasseur choisit la cible la plus menaçante (les bombardiers qui vont larguer, les chasseurs adverses),
  la poursuit avec anticipation et tire en rafales (traçantes, impacts, bruit des mitrailleuses) ; il se dégage quand un chasseur ennemi est sur sa queue ; le mitrailleur arrière des bombardiers biplaces
  riposte. Les chasseurs d'escorte s'attaquent d'abord aux chasseurs ennemis qui en veulent à leurs bombardiers et ne s'en éloignent pas. Un bombardier pourchassé sur le chemin du retour **va tourner autour du navire ami le mieux armé en DCA** (à moins de 28 km) jusqu'à ce que les chasseurs lâchent prise. Une section attaquée par des chasseurs **se resserre** (les mitrailleurs se couvrent mutuellement) puis reprend sa formation normale quand ils sont partis. Chaque raid choisit, à 24 km, la **route d'approche la moins défendue** (la DCA
  vivante de chaque navire ennemi, là où ils seront à l'arrivée) et les sections d'un raid arrivent par des axes différents ; un navire isolé et peu armé est une meilleure cible qu'un navire au milieu de l'écran. Un chasseur blessé, sans munitions ou à court d'essence rentre et apponte comme les autres.
- **Bombardiers en piqué** : montée vers l'objectif, mise en piqué sur le dos, piqué à environ 60°, largage vers 500 m, ressource à 4,5 g puis
  retrait à basse altitude. La bombe est un vrai corps balistique : c'est l'endroit où elle tombe qui décide des dégâts.
- **Torpilleurs** : descente progressive jusqu'à 50 m, approche par des azimuts différents autour de la cible (tenaille), passe rectiligne,
  torpille larguée à environ 1 000 m (visible en chute, gerbe à l'amerrissage), dégagement au ras des flots.
- **DCA** : chaque affût est un objet du navire (Oerlikon, Bofors, pom-pom, Type 96...) qui se tourne vers l'avion, tire en rafales avec traceuses,
  et les pièces à double usage (5 pouces, 105 mm...) tirent des obus fusants qui explosent en nuages noirs. Un affût détruit ne tire plus.
- **Avions touchés** : fumée, puis flammes, puis l'avion s'écrase **de façon visible** : vrille, pilote tué qui pique, aile arrachée (la pièce tombe
  séparément), moteur coupé et amerrissage plané, ou désintégration en vol d'un avion chargé. L'impact fait une gerbe, une boule de feu et une nappe de
  carburant qui brûle sur l'eau ; un avion qui tombe sur un navire lui cause de vrais dégâts.


## Dégâts : là où ça touche

| Cheminées détruites sur le Norfolk : l'épave remplace la pièce | Torpille sur le Takao : colonne d'eau contre la coque | Plan des dégâts du navire sélectionné |
|---|---|---|
| ![Cheminée](funnel.jpg) | ![Torpille](torpedo.jpg) | ![Plan des dégâts](damage-plan.jpg) |

Un navire n'a **pas de points de vie** : il est perdu quand il ne peut plus flotter (l'eau a pris sa réserve de flottabilité, il chavire, se brise ou explose) ou quand il n'a plus assez d'équipage pour le servir. Il est fait de **modules** placés là où ils sont sur le modèle 3D : chaufferies et salles des machines,
soutes à munitions sous chaque tourelle, appareil à gouverner, lignes d'arbres, passerelle, directeurs de tir, radars, cheminées, mâts, tubes
lance-torpilles, catapultes, hangar, soute à essence et pont d'envol des porte-avions, chaque affût de DCA, plus des **compartiments étanches**.

- Un impact est suivi à travers le navire : touche une tourelle, un affût, une cheminée, la passerelle, la superstructure, le pont ou la coque.
  Le blindage et l'obliquité décident si l'obus pénètre ; un obus perforant éclate après son retard de fusée, donc **à l'intérieur** si la coque est
  assez profonde (il traverse un destroyer sans éclater), un obus explosif éclate sur la surface (ou juste derrière une tôle mince).
- L'explosion endommage chaque module selon sa distance au point d'éclatement et selon qu'il est protégé (machines sous le pont blindé) ou exposé
  (DCA, directeurs, mâts) : un 5 pouces tue une DCA, pas une tourelle ; un 406 mm dans la chaufferie la détruit.
- Effets : machines perdues (vitesse), ligne d'arbre perdue (le navire tire d'un bord), gouvernail bloqué (il tourne en rond), directeurs et radar
  détruits (tir moins précis), passerelle détruite (commandement dégradé), cheminée perdue (vitesse), tourelle enrayée ou sans munitions,
  tubes lance-torpilles qui explosent, hangar en feu, DCA qui se tait.
- **Éléments détruits visibles** : cheminées, mâts, passerelle, directeurs, radars, catapultes, tubes et tourelles sont remplacés par leur épave
  (souche calcinée, tourelle tordue) et leurs morceaux **volent** et retombent à la mer. Chaque impact laisse une **cicatrice** sur la coque.
- **Voies d'eau** (`js/game/sim/hull.js`) : chaque coup porté à la coque (obus, torpille, bombe, souffle, abordage) ouvre un **trou** à l'endroit touché, grand ou petit selon le coup. Un trou ne laisse entrer l'eau que s'il est **sous la flottaison** : un trou d'obus à six mètres au-dessus de l'eau ne fuit pas, jusqu'à ce que le navire s'enfonce ou gîte jusqu'à lui. Les chocs fatiguent aussi la structure du compartiment (`struct`) : tous les quarts de rupture, un joint cède et fuit à la flottaison.
- **Inondation** : 8 à 18 compartiments par navire. L'eau entre par les trous, remplit le compartiment du côté touché, puis passe aux voisins quand il est plein (plus vite quand les cloisons sont brisées) : gîte, assiette (par l'avant ou par l'arrière), enfoncement. L'équipe de sécurité colmate peu à peu les trous qui fuient, et noie du côté haut pour redresser un navire qui gîte. **Le navire est perdu quand l'eau atteint sa réserve de flottabilité** (30 % du volume pour un destroyer, 50 % pour un cuirassé), ou qu'il gîte trop longtemps (il chavire), ou qu'il se brise (deux compartiments voisins au milieu, brisés et noyés).
- **Équipage** : chaque poste a ses hommes (tourelles, DCA, chaufferies, passerelle) et chaque compartiment ses équipes de sécurité. Les explosions les tuent selon la distance et selon l'abri (l'équipage d'une tourelle est à l'abri d'un éclatement sur son toit, pas d'un obus qui éclate dedans), les incendies et l'eau aussi. Une pièce qui n'a plus que 20 % de son équipage ne tire plus ; les équipes de sécurité envoient du monde aux postes qui ont perdu le leur. Un navire qui n'a presque plus personne est **abandonné puis sabordé** ; un navire qui n'a plus ni canon, ni torpille, ni moyen d'avancer est sabordé après un moment.
- **Un navire qui coule continue de tirer** : tant que la tourelle ou la DCA est hors de l'eau, que la gîte ne bloque pas le pointage, qu'il reste du monde et des obus. Les navires dont la soute explose ne tirent plus.
- **Incendies** : ils chauffent les soutes voisines et brûlent l'équipage des postes voisins ; l'équipe de sécurité les noie... ou pas.
- Le panneau du navire sélectionné montre un **plan des dégâts** : modules en vert / orange / rouge, compartiments inondés en bleu, structure fissurée, trous (bleu: l'eau entre), incendies,
  tourelles enrayées, équipage de chaque tourelle (anneau jaune puis rouge), DCA restante ; au-dessus, la **flottabilité** restante et l'**équipage** à bord, et un mot sur l'état du navire (à flot, voie d'eau, gîte, en feu, équipage réduit, immobilisé, désarmé, abandonné).
- **Les avions n'ont pas de points de vie non plus** (`planedamage.js`) : ailes gauche et droite, empennage, fuselage, moteurs, réservoirs, pilote et commandes. Chaque impact touche une pièce (le nez de face, l'empennage de derrière, les ailes de côté) et ce qu'elle protège (le fuselage, le pilote ; l'aile, son réservoir). Une aile arrachée, l'empennage coupé, le pilote tué, le fuselage brisé ou un incendie qui dure font tomber l'avion ; une aile touchée fait voler moins bien (moins de portance, roulis plus lent, une aile qui tombe), des commandes touchées lâchent quelques secondes après, un réservoir percé brûle (ou s'éteint si le pilote pique), un moteur perdu réduit la poussée.


## Explosions et naufrages

| Explosion de munitions | Le croiseur Zara ravagé : cheminées détruites, incendies |
|---|---|
| ![Explosion](explosion.jpg) | ![Dégâts](damage.jpg) |

- **Explosion de munitions** : éclair, boule de feu, onde de choc sur l'eau (anneau d'embruns et d'écume), colonne de fumée en champignon, **tourelles
  projetées** hors du navire, pièces enflammées qui retombent, **explosions secondaires** le long de la coque, puis **la coque se brise en deux** et
  les deux sections coulent chacune à leur manière. Les navires voisins et les avions proches sont touchés par le souffle.
- Les naufrages « normaux » se terminent par des explosions de chaudières et de munitions, des craquements de coque, de l'eau qui s'engouffre, puis
  une nappe de mazout qui brûle longtemps à la surface.


## Le son

Tous les sons sont **synthétisés par le programme** (pas de fichiers audio) et joués en 3D : atténuation avec la distance, filtrage des aigus, retard du
son (343 m/s), position stéréo selon la caméra, écho sur la mer. Canons principaux, moyens et petits (chacun son timbre), DCA légère par calibre,
éclatements d'obus antiaériens, sifflement des obus et des bombes qui passent, gerbes, impacts (explosifs, perforants, ricochets, obus qui traversent),
torpilles, explosions de munitions, avaries (structures qui s'effondrent, vapeur des chaudières, étincelles, voies d'eau, craquements de coque),
moteurs d'avions avec effet Doppler, sirène du Stuka en piqué, avion qui tombe, brin d'arrêt, incendies et machines des navires proches.
`M` coupe le son. Le son est coupé au-delà de 2,5× de vitesse du temps.


## La simulation

- **Balistique** : obus avec traînée dépendant de l'altitude, étalonnée pour que la portée à l'élévation maximale
  corresponde à la portée réelle de chaque canon ; tables de tir inversées ; temps de vol réels (≈ 34 s à 20 km
  pour un 406 mm).
- **Conduite de tir** : anticipation du mouvement de la cible *et* du navire tireur, tourelles qui tournent à leur
  vitesse réelle dans leurs secteurs de tir (calculés sur la géométrie du navire : un canon ne tire pas à travers la
  passerelle ni une cheminée, relève le tube pour passer au-dessus d'un obstacle bas, et la DCA sous un pont d'envol ne peut pas se lever), dispersion et conduite de tir propres à chaque marine (voir « Détection et précision du tir » ci-dessous).
- **Dégâts** : obliquité et pénétration face au blindage (ceinture, pont, tourelles), obus AP ou explosifs, incendies,
  voies d'eau et gîte, tourelles détruites, avaries de machines et de gouvernail, explosions de soute, naufrage
  (chavirement, par la poupe ou par l'étrave).
- **Torpilles** (destroyers, croiseurs) avec sillage visible, et **frappes aériennes** des porte-avions (voir plus haut).
- **IA** : choix des cibles, distance de combat selon la classe, circulation, zigzag, évitement des collisions,
  attaques à la torpille, repli quand le navire est en perdition, porte-avions qui se tiennent à distance.
- **Flottes et tactique** (`sim/fleet.js`) : chaque flotte a un ordre de bataille et le garde. Le **vaisseau amiral** (le plus gros de la ligne) mène ;
  la **ligne** (cuirassés, puis croiseurs lourds, puis croiseurs légers) le suit en colonne, à un intervalle qui dépend de la longueur des navires, et
  tourne avec lui ; les **destroyers** font l'**écran**, devant la ligne et sur les deux bossoirs (un destroyer le quitte pour lancer ses torpilles, puis y revient) ;
  les **porte-avions** naviguent derrière la ligne, du côté opposé à l'ennemi, avec deux destroyers d'escorte. Toute la flotte tourne autour de l'ennemi dans
  le même sens, à la distance que tient le navire de la ligne qui tire le moins loin, et pas plus vite que le plus lent d'entre eux ; la ligne se
  partage une **cible commune** (celle que le plus grand nombre de canons atteint, la plus précieuse et déjà touchée). Un navire gravement touché ou privé de
  machines quitte la formation et se débrouille seul ; il ne règle plus l'allure de la flotte. Les flottes sont posées sur l'eau dans cet ordre.
- **Îles** (`sim/terrain.js`) : des rochers, de petites îles vallonnées et de grandes îles montagneuses (jusqu'à 560 m, certaines avec un cratère) sont tirées de la graine ; la case « Îles » du menu (ou `?islands=0|1|2`) choisit aucune, quelques-unes ou un archipel. Les flottes de départ et l'axe qui les joint restent dégagés. Les navires s'**échouent** là où l'eau est moins profonde que leur tirant d'eau, les obus éclatent sur les pentes et les torpilles sur le rivage, la **ligne de vue** et l'arc de chaque canon sont testés contre le relief (on ne tire pas à travers une colline), l'IA contourne les îles et reste en eau profonde, les avions prennent de l'altitude devant une montagne et s'écrasent s'ils la touchent. À l'écran : relief maillé depuis la même fonction de hauteur, matière de sol, lignes d'écume au rivage, impacts avec poussière et éclats de terre.
- **Végétation** (`model/vegetation.js`, `model/treeMeshes.js`, `render/vegetationVisual.js`) : chênes, sapins, cocotiers, arbres de canopée tropicale, acacias, cyprès, buissons et rochers poussent selon le climat de l'île (tempéré avec des conifères en altitude, tropical avec des palmiers sur la plage, savane aride, îles rocheuses nues, broussailles volcaniques), moins serrés en altitude et sur les fortes pentes, avec des clairières ; environ un végétal pour 50 m² de forêt, tiré de la graine (la même bataille a les mêmes forêts). Chaque végétal est un modèle procédural (tronc effilé, branches récursives, houppier en touffes de feuillage et cartes de feuilles découpées : folioles, aiguilles, palmes) à quatre niveaux de détail ; le shader use le bord des houppiers en feuilles, les éclaire par transparence, creuse l'écorce, mouchette les rochers de mousse, et une rafale traverse l'île en faisant bouger le feuillage. De près (105 m) chaque arbre est une instance, au-delà il est assemblé par carrés de 80 m puis de 640 m. `?trees=0` supprime les végétaux.
- **Mer** : les navires flottent sur la houle FFT (roulis, tangage, pilonnement) et laissent un sillage d'écume (vague d'étrave, ligne d'écume à la flottaison, remous des hélices puis longue traînée blanche, d'autant plus marquée que le navire va vite).

## La grande guerre : un théâtre d'opérations

Le bouton **« Grande guerre : Axe contre Alliés »** (ou `?scenario=war&start=1`) lance une guerre sur une mer de 190 × 120 km parsemée de 60 îles : l'**Axe** (Japon, Allemagne, Italie) contre les **Alliés**
(États-Unis, Royaume-Uni, France). Rien n'est rendu égal : les flottes ont les proportions des vraies marines (57 navires en tout : 18 américains, 14 japonais, 8 britanniques, 7 allemands, 6 italiens, 4 français ; `js/game/data/theatre.js`).

- **Chaque nation a son foyer** : un archipel (une grande île, deux grandes, des petites, des rochers) avec **un grand aérodrome** (piste de 2 000 m, quatre rangées d'avions) **et un aérodrome moyen** (piste de 1 300 m), des **ports**, deux batteries
  côtières et ses **escadres** (task forces) : des groupes aéronavals, des lignes de bataille, des divisions de croiseurs. Les bases gardent le style de leur nation (peintures, DCA, canons côtiers).
- **Les ports** (`sim/ports.js`, `model/basePort.js`) : une jetée de 500 m avec un quai des deux côtés, un mouillage, des entrepôts, des réservoirs, des soutes, des arsenaux et des grues. Un navire **qui n'a presque plus d'obus** (un cinquième de sa
  batterie principale, ou les avions d'un porte-avions) **ou qui est trop touché** (eau dans la coque, voies d'eau, machines, canons, équipage, pont d'envol) **fait route vers le port allié le plus proche**, est pris en charge par les remorqueurs,
  amarré, **réarmé et réparé** (incendies éteints, eau pompée, brèches colmatées, machines, tourelles, directeurs et radars remis en état, postes regarnis, torpilles, missiles et avions restitués) au rythme du chantier, puis relâché. **Le temps est
  comprimé** (15 minutes pour refaire les munitions d'un cuirassé, 25 pour le réparer s'il est dévasté, au lieu de jours et de semaines) ; un grand port répare deux fois plus vite qu'un moyen, le chantier travaille à hauteur de ce qui reste debout de ses
  bâtiments, le mouillage sert deux fois moins vite. Les Alliés se servent de leurs ports respectifs. (Le carburant n'est pas simulé : sur 190 km, aucun navire n'en manque ; les autonomies réelles vont de 3 000 à 15 000 milles.)
- **Le brouillard** : personne ne voit ce qu'aucun navire, avion, radar ou tour de son camp ne voit (`sim/detect.js` sur `sim/sensors.js` : l'horizon du mât et de la cible, la visibilité du jour, les radars de chaque navire, les îles qui cachent). Les avions de
  patrouille des aérodromes et des porte-avions balaient la mer autour d'eux (leurs vols ne sont pas dessinés). Les capitaines ne tirent que sur ce qu'ils suivent ; les raids aériens partent contre les navires que leur camp a repérés récemment.
- **Le commandement** (`sim/theatre.js`) : chaque escadre a un but (patrouille, contact à intercepter, base ennemie à bombarder, retour au port quand elle a perdu plus de 60 % de sa force), file à 22 nœuds dans son ordre de bataille, et combat quand un ennemi est à
  portée (`sim/fleet.js` : plusieurs flottes par camp, `cruise`). Tests : `test/ports.mjs`, `test/theatre.mjs`.

## Détection et précision du tir

Deux modules sans équilibrage entre nations : chaque canon et chaque système de conduite de tir vaut ce que disent les sources (`data/gunnery.js`, les valeurs
marquées `estimated` sont des lectures de descriptions, pas des chiffres publiés ; à confirmer comme les autres jeux de données).

- **Ce que l'on voit** (`sim/sensors.js`, remplace l'ancien `visualRange` constant de 32 km) : horizon radio `4,12 (√h1 + √h2)` km (3,86 pour l'œil), hauteur de l'œil =
  haut du directeur principal du modèle, hauteur de la cible = tête de mât ; visibilité de la mer `world.visibility` (28 km par défaut, pour la silhouette d'un
  cuirassé, un peu moins pour un destroyer) ; radars de chaque navire (SG, SK, Mk 3 / 8 / 13, Type 284, FuMO 22 / 23 / 27, Type 21 / 22 / 13, SF / SA-2…, avec leur
  année et leur portée par classe de cible, coupée par l'horizon radar), perdus quand toutes leurs antennes sont détruites ; îles qui coupent la vue
  (`terrain.blocks`). `canDetect(world, observateur, cible)` donne `{ visual, radar, range }` pour navires, avions et bases (un avion à 2 500 m voit un navire à
  40-60 km, un navire voit un chasseur à 15 km). `engageRange` / `gunRange` / `maxReach` disent jusqu'où une pièce peut être pointée : œil jusqu'à l'horizon et à la
  brume, radar jusqu'à sa portée, ou sans limite avec un hydravion de réglage (`ship.spotter` : aucun hydravion ne vole encore dans la simulation, le crochet est
  seulement lu).
- **Où va chaque obus** (`sim/accuracy.js`) : trois sortes d'erreurs. (1) Celle que **toute la salve partage** : la solution de tir (télémètre optique, erreur
  `portée² × acuité / base`, ou radar à erreur fixe, les deux combinés ; corrections balistiques ; retard de l'estimation de cap et de vitesse de la cible, qui
  oublie un changement de route en `tau` secondes : un but qui tourne ou zigzague est manqué), un biais qui **se corrige en observant les gerbes** (réglage par
  fourchette : un obus tombé loin de la cible corrige le biais d'une part `gain / nombre de tubes`, seulement si la gerbe est visible à l'œil ou au radar qui
  la voit), un bruit de lecture d'une salve à l'autre, l'erreur de pointage du directeur (stabilisé gyroscopiquement ou non : ×R/tan(angle de chute)
  en portée). (2) Celle que partagent **les tubes d'une même tourelle**. (3) Celle de **chaque obus** : dispersion du canon en portée et en direction
  (% de la distance), dispersion de vitesse initiale. Le système met un temps (`lock`, 6 à 30 s) pour trouver portée et vitesse avant la première salve.
  Quelques chiffres : 16"/50 américain 0,38 % en portée et 0,13 % en direction (essais de 1987 : 0,36 % obus à obus) ; 38 cm allemand 0,35 % ; 381 mm
  italien 0,55 % (gerbes de 200 à 300 m à 20-30 km, bien plus larges que celles des autres) ; 380 mm français 0,60 % avec une salve divisée en deux paires ; la
  Mk 8 américaine mesure à 14 m près, le Type 22 japonais à 120 m près et ne voit pas les gerbes ; l'Italie n'a aucun radar de tir avant 1943.
- **Étalonnage** : cible qui garde cap et vitesse, cuirassé américain contre cuirassé à 9 / 18 / 27 km : 60 / 20 / 6 % (les estimations de 1944 du rapport AMP 79.2R :
  33 / 10,5 / 2,7 %) ; duels de l'IA qui virent et zigzaguent : 3 % entre 16 et 22 km, 6 % entre 10 et 16 km (Denmark Strait 3 à 5 %, Calabre et Matapan bien moins de
  1 %) ; `test/dispersion.mjs`. Les batteries côtières des bases (`sim/baseops.js`) gardent leur propre dispersion constante.

## Contrôle manuel (préparé, pas encore branché)

Un navire n'a pas de logique propre : il exécute une `ShipCommand` (`js/game/sim/ship.js`) écrite par un
*contrôleur*. L'IA (`controllers/ai.js`) et le futur contrôleur manuel (`controllers/manual.js`) écrivent exactement
la même commande : régime moteur, barre ou cap, cible / point de visée par groupe d'armes, tir, torpilles, avions.
Prendre le contrôle d'un navire se résume à :

```js
ship.controller = new ManualController(etatDesEntrees);
```

Les tourelles, la conduite de tir, les rechargements et les salves sont déjà gérés par le navire.


## Organisation du code

Le plan complet, **un fichier par ligne** (ce qu'il fait, sa taille, ce qu'il exporte, qui l'importe), est généré dans [CODEMAP.md](CODEMAP.md) (`npm run map` ; `node tools/codemap.mjs --find mot` pour chercher un sujet). Le tableau ci-dessous donne le découpage par grands blocs.

| Chemin | Contenu |
|---|---|
| `index.html` | Page, interface (CSS) |
| `js/engine.js` | Moteur d'océan réutilisable (crochets de jeu, sonde de hauteur d'eau, tampons d'écume, ombres, capture) |
| `js/wgsl/` | Shaders : océan, ciel, post-traitement (du projet *web-ocean*) + navires, particules, ombres |
| `js/game/data/` | Fiches des navires (6 nations) |
| `js/game/model/` | Constructeur de maillages procéduraux : coque loftée, superstructures, tourelles, mâts… |
| `js/game/model/planes.js` | Générateur des avions (fuselage loftée, ailes, hélice, train, bombes, torpilles) |
| `js/game/sim/` | Simulation pure (sans GPU) : monde, navires, îles (`terrain.js`), armes, balistique, aviation (`aircraft.js` l'aviation embarquée, `planeaa.js` la DCA des navires, `planedamage.js` les dégâts et la mort des avions, `flight.js` la dynamique de vol), modules et dégâts (`modules.js`, `damage.js`), explosions (`explosions.js`), débris (`debris.js`), contrôleurs |
| `js/game/render/` | Rendu des navires (`shipVisual.js`), des avions (`aircraftVisual.js`), particules, effets, ombres |
| `js/game/audio/` | Synthèse des sons (`synth.js`) ; `js/game/audio.js` : lecture en 3D |
| `js/game/ui/` | Interface, caméras, plan des dégâts |
| `js/trailer.js`, `js/trailerScenes.js`, `js/trailerMusic.js`, `tools/trailer/` | Bande-annonce : réalisateur et scènes (`?trailer=1`), partition synthétisée, enregistreur image par image et montage ffmpeg (voir `tools/trailer/README.md`) |
| `test/` | `tests.json` (la liste des tests, lue par `tools/runtests.mjs` qui les lance en parallèle), `codemap.mjs` (le plan du code est à jour), `lint.mjs` (ESLint), `models.mjs` (30 modèles), `damage.mjs` (dégâts localisés, explosions), `air.mjs` (aviation), `audio.mjs` (moteur sonore avec une API Web Audio factice), `manual.mjs` (pilotage manuel via ShipCommand), `battle.mjs` / `preset.mjs` (une bataille), `fuzz.mjs` (batailles aléatoires), `islands.mjs` (îles : génération, ligne de vue, échouage, impacts, batailles), `vegetation.mjs` (végétation : placement, climats, modèles, assemblage) |
| `viewer.html`, `js/viewer.js`, `js/viewer/` | Visualiseur 3D : `scene.js` (modèle, caméra orbitale, soleil, ombres), `controls.js` (souris, tactile, clavier), `panel.js` (interface), `state.js` (état et « lien de débogage »), `subjects.js` (les 54 modèles) |
| `wiki.html`, `js/wiki.js`, `js/wiki/` | Wiki : `data.js` (adaptateur des fiches techniques), `tiers.js` et `layout.js` (arbre technologique), `tree.js`, `card.js`, `compare.js`, `aircraft.js`, `profile.js` (silhouettes dessinées d'après les fiches), `flags.js`, `styles.js` |

## Paramètres d'URL

Paramètres d'URL utiles : `?scenario=duel&start=1` (démarrage direct), `seed=123` (combat reproductible),
`mode=orbit`, `speed=4`, `scale=0.7` (résolution de rendu), `shadows=0`, `preview=iowa,yamato,plane:sbd` (aperçu de navires et d'avions ; `ruin=1`, `scars=30`, `split=20`, `parked=6` montrent les états endommagés), `quality=low|medium|high` (qualité graphique), `fft=128` et `grid=16` (océan allégé pour les machines lentes), `ocean=0` (sans océan : aperçus de modèles plus rapides), `islands=0|1|2` (aucune île, quelques-unes, archipel), `trees=0` (sans végétation).

Visualiseur : `viewer.html?m=iowa` (identifiant d'un navire, `plane:sbd` pour un avion, `float:UK` pour un hydravion) puis `az`, `el`, `d` (distance), `tx ty tz` (point regardé), `l` (lumière : jour, matin, coucher, couvert, nuit), `oc=0` (sans océan), `sh=0` (sans ombres), `dm` (none, scars, ruin, split), `tr` et `gu` (rotation et élévation des canons), `pk` (avions sur le pont), `embed=1` (interface réduite) ; le bouton « Lien de débogage » les écrit pour vous (`js/viewer/state.js`).

## Poste de développement et outils

```
git clone https://github.com/FreedomFR/warthunderv2 && cd warthunderv2
git checkout main && git pull          # ou la branche de travail
npm install                            # seulement pour les outils (playwright-core, esbuild)
npm start                              # http://localhost:8080/
npm test                               # sans carte graphique, en parallèle (moins de 2 minutes) ; npm run test:fast : environ 25 s
npm run lint                           # ESLint (noms inexistants) ; npm run map : docs/CODEMAP.md
```

- **Outils dans le navigateur** (`npm run check:shaders`, `npm run smoke`, `tools/trailer`, `tools/refs`) : ils pilotent Chrome en mode
  sans fenêtre. Par défaut ils utilisent le rendu logiciel (SwiftShader : marche partout mais lent) ; avec une carte graphique, lancer
  avec `GPU=hardware` (par exemple `GPU=hardware npm run smoke`, sous Windows `set GPU=hardware` avant la commande). `CHROME=chemin`
  choisit un autre navigateur. Mode matériel vérifié sur une RTX 3080 (Windows + WSL2) : environ 60 images/s au lieu de 10 à 25 s par image.
- **Sous WSL2** : le Chrome Linux n'y voit pas la carte graphique (pas de pilote Vulkan pour D3D12 dans Mesa sous Debian), il retombe sur
  SwiftShader. Garder le serveur dans WSL et lancer les outils avec le Node **Windows**, qui pilote le Chrome Windows (D3D12) et atteint
  `localhost:8080` dans WSL :
  `GPU=hardware WSLENV=GPU "/mnt/c/Program Files/nodejs/node.exe" tools/smoke.mjs` (de même pour `tools/wgslcheck.mjs`, `tools/trailer/record.mjs`…).
- La bande-annonce (`tools/trailer`) demande aussi `ffmpeg` ; les planches de comparaison (`tools/refs/sheet.py`) demandent Python et Pillow.
- Pour reprendre avec Claude Code : le fichier `CLAUDE.md` décrit le projet, les commandes, l'organisation du code et la méthode des lots
  « fidélité » ; `TODO.md` liste ce qu'il reste à faire.

## Sur téléphone

Sur un appareil dont le pointeur principal est tactile, téléphone ou tablette (`js/game/device.js`, `?mobile=1` / `?mobile=0` pour forcer), `body.mobile` active l'interface tactile ; l'interface de bureau n'est pas modifiée.

- **Interface** (`ui/mobile.js`, style dans `ui/mobileStyle.js`) : barre compacte (pause, vitesse, horloge, menu ☰), menu en grille (flottes, fiche du navire, équipes, impacts, noms, tableau, son, réglages, plein écran, aide, wiki, visualiseur), caméras en une rangée qui défile, panneaux d'information ouverts à la demande, configuration des flottes en plein écran.
- **Gestes** : un doigt fait tourner la caméra, deux doigts zooment (pincement), un appui sélectionne un navire. En caméra libre et en vue tactique, un **joystick** à gauche déplace la caméra (il appuie sur les touches `W A S D` de la caméra), et trois boutons montent, descendent, accélèrent.
- **Performance** : densité de pixels plafonnée à 1,5 (un téléphone en annonce 3 à 4), qualité de départ « moyenne » (la qualité automatique monte ou descend ensuite), 20 000 particules au plus par défaut.
- **Plein écran** : bouton du menu (verrouille le paysage quand le navigateur l'autorise) ; l'écran reste allumé en combat (Wake Lock). Un conseil s'affiche une fois quand le téléphone est tenu droit.
- **Installation** : `manifest.webmanifest` et les icônes permettent « Ajouter à l'écran d'accueil » dans Chrome : le jeu s'ouvre alors en plein écran, en paysage.
- **Test** : `test/mobile.mjs` (détection, plafond de densité, touches du joystick). Les gestes et la mise en page ont été vérifiés avec l'émulation d'un S24 Ultra (tactile, 915×412 et 412×915) sur une carte graphique de bureau : la vitesse réelle d'un téléphone n'a pas pu être mesurée.

## Publier le site

Le jeu tourne entièrement dans le navigateur du visiteur : un hébergement de fichiers statiques suffit (GitHub Pages), sans programme serveur. Deux versions sont en ligne : `main` (stable) à la racine et `dev` (en cours de validation) dans `/dev/`, avec un badge « Version dev » en bas à gauche.

- `node tools/site.mjs` assemble `_site/` pour ce dossier : `index.html` (le jeu, la page unique minifiée `naval.html`, construite avec `npm run build`, **non commitée** : trop grosse pour GitHub, le workflow la construit), `wiki.html`, `viewer.html` et `js/` (sans les fichiers de la bande-annonce). Avec `--main <dossier> --dev <dossier>`, il assemble les deux versions comme le fait le workflow. Pour l'essayer : `cd _site && python3 -m http.server 8095`.
- `.github/workflows/pages.yml` publie les deux versions à chaque modification de `main` ou de `dev` : il lance `npm test` sur la branche modifiée (rien n'est publié si un test échoue) puis déploie. Il peut aussi être lancé à la main (onglet Actions). Le workflow fait `npm install` puis `npm run build` dans chaque version avant d'assembler le site : `naval.html` n'est pas dans le dépôt (il dépassait 90 Mio, la limite de GitHub est de 100 Mio par fichier), il est dans `.gitignore`.
- Réglages faits une seule fois : *Settings → Pages → Source : GitHub Actions*, et l'environnement `github-pages` autorise les branches `main` et `dev`.
- Adresses : `https://freedomfr.github.io/warthunderv2/` (main) et `https://freedomfr.github.io/warthunderv2/dev/` (dev). Il faut un navigateur avec WebGPU (Chrome ou Edge récent) ; GitHub Pages sert en HTTPS, ce que WebGPU exige.
