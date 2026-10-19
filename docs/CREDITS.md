# Crédits et licence

Les plans et photographies ne sont **pas** dans le dépôt : ils ont été consultés pour relever des mesures (positions, hauteurs, largeurs) et chaque modèle
est vérifié en mètres contre ses plans. Les droits restent ceux de leurs auteurs. Tout ce qui suit est repris tel quel de l'ancien README.

Le moteur d'océan (vagues FFT, ciel physique, post-traitement, shaders WGSL) vient de
[Noniv/web-ocean](https://github.com/Noniv/web-ocean) (licence MIT, voir `LICENSE` et `NOTICE.md`) ; il a été adapté
ici pour accueillir le jeu. Les caractéristiques des navires proviennent de Wikipédia, NavWeaps et Navypedia.
Pour le lot « fidélité » (Iowa, Yamato, Bismarck, Essex), les proportions des tourelles, des superstructures et des effets de tir ont été relevées
(mesures et observations seulement : aucune image n'est copiée dans le dépôt) sur des photographies de Wikimedia Commons : domaine public pour les
photographies de l'US Navy (*Iowa*, *Essex*) et du *Yamato*, Bundesarchiv (CC BY-SA 3.0 de) pour le *Bismarck*. Les positions, hauteurs et
largeurs ont ensuite été relevées sur des plans : profil et vue de dessus de la classe *Iowa* (domaine public), plans du constructeur du
*Yamato* (NH 111711, domaine public) et profil du *Yamato* en 1945 par Alexpl (CC BY-SA 3.0, d'après les photographies du musée de Kure),
profil du *Bismarck* « Battleship Bismark.svg » (CC0), photographie de profil de l'*USS Ticonderoga* du 5 novembre 1944 (domaine public).
Les hélices de l'*Iowa* d'après les photographies de l'*USS Missouri* en cale sèche (domaine public). Chaque modèle est vérifié en mètres
contre ses plans (`tools/refs/check.mjs`, `silhouette.py`).

- Lot 2 : feuilles ONI 201 (*Illustrious*) et 202 (*Littorio*) du Division of Naval Intelligence (domaine public), coupe longitudinale de la classe *Richelieu* (CC BY-SA 4.0) et profil + plan du *Shōkaku* (CC BY-SA 3.0, Snow Cloud in Summer) ; pour le *King George V*, le profil et le plan « King George V 1941 / Duke of York 1945 » de Manuel P. González López (© tous droits réservés : consulté pour relever des mesures uniquement, l'image n'est pas dans le dépôt ; à contacter pour toute publication).
- Lot 3 : feuille ONI 204 (*Graf Zeppelin*), profil de l'*Aquila* partagé sans source (mesures uniquement), photographie du *Béarn* de 1927 (domaine public), trois-vues du SBD-3 (CC BY-SA 3.0), du B5N (CC BY-SA 3.0) et du Skua (L'Aérophile 1939, domaine public).
- Lot 4 (croiseurs) : feuilles ONI du *Takao* (classe Atago), de l'*Admiral Hipper* / *Prinz Eugen* et du *Köln* (ONI 204), du *Montecuccoli* (ONI 202), du *Zara*, de la *La Galissonnière* et de l'*Algérie* (domaine public), profil de l'*Agano-kai* (CC BY 3.0, Snow Cloud in Summer) ; pour le *Cleveland* (Colosseum, Pit-Road) le *Baltimore* (Shipbucket d'Ian B. Roberts, TZoli), l'*Agano*, la *Belfast* (James Goulding, Profile Publications) et le *Norfolk* (notice Hasegawa 1/700) : dessins partagés par le propriétaire du projet, © de leurs auteurs, consultés pour des mesures uniquement (non présents dans le dépôt ; à contacter pour toute publication).
- Lot 5 (destroyers) : dessin des *Kagerō* (MacMoreno, CC BY-SA 4.0) ; *Fletcher* (monographie), *Tribal* (TZoli) et *Type 1936A* (trois-vues) *Le Fantasque* (feuille profil + plan en pieds) et *Soldati* (profil + plan du Camicia Nera) : dessins partagés par le propriétaire du projet, © de leurs auteurs, consultés pour des mesures uniquement (non présents dans le dépôt ; à contacter pour toute publication) ; livret ONI 203 (photos du *Fantasque*) et photographies du *Legionario* : domaine public. 
La liste complète des sources est dans `tools/refs/sources.jsonl`.
Végétation : l'approche (tronc effilé, branches récursives avec tropisme, feuillage porté par des cartes à découpe, niveaux de détail, forêts instanciées) s'inspire de projets libres : [EZ-Tree](https://github.com/dgreenheck/ez-tree) de Dan Greenheck (MIT), [proctree.js](https://github.com/supereggbert/proctree.js) de Paul Brunt et les forêts WebGPU « LAAS » et « Procedural Instanced Forest » présentées sur le forum Three.js ; aucun code ni modèle n'en est repris : tous les arbres sont générés par `treeMeshes.js`.
Effets : les recettes de feu, de fumée et d'éclaboussures s'inspirent de ressources publiques (formule des pulsations d'un feu d'hydrocarbure f = 1,5 / √D, panache de Briggs, GPU Gems chapitre 6 « Fire in the Vulcan demo », fiches d'effets de la communauté RealtimeVFX, notes de la marine américaine sur les gerbes d'obus) ; aucun code n'en est repris.
Code sous licence MIT.

## Sources du modèle de dégâts

Pénétration (formule de De Marre calée sur les tables publiées), incidence, blindages inclinés, fusées, soutes et protection contre les torpilles (`js/game/sim/penetration.js`, `damage.js`, `js/game/data/protection.js`). Les valeurs marquées `estimated` sont des estimations.

- [NavWeaps](https://www.navweaps.com) : fiches du 16"/50 Mk 7 (US), du 18"/45 Type 94 (Japon), du 15 cm SK C/34 et du 15"/52 allemands (pénétrations, vitesses, retard de fusée), du 8"/55 Mk 12-15 ; pages « Base fuze plate thickness minimums » (épaisseur minimale d'armement d'une fusée de culot, environ 0,07 × calibre), « Penetration index » et « tech-041 » (fusées japonaises).
- [Nathan Okun, Warship Armor](https://www.navweaps.com/index_nathan.php) : indices de pénétration et blindage.
- [Naval Gazing](https://www.navalgazing.net) : « Armor, Part 2 » (la vitesse nécessaire augmente avec l'obliquité), « Fuzes, Part 3 » (retards des fusées américaines), « Powder, Part 4 » (cordite contre poudres sans fumée, risque de flash).
- Articles de Wikipédia sur le *Hood*, le *Taihō*, le *Shinano*, le *Musashi*, les classes *Iowa*, *Yamato*, *Bismarck*, *King George V*, *Littorio* et *Richelieu*, et sur la dernière bataille du *Bismarck* (comment un cuirassé finit par couler : noyage progressif, explosions, chavirement).
- National WWII Museum (Guadalcanal), history.navy.mil (Samar), Air Force Times (*Johnston*) : comportement des destroyers et des croiseurs sous le feu.
- Forums de modélistes et pages de contrôle des avaries : seulement des extraits ; les valeurs de contrôle des avaries (`dc`) sont des estimations.

## Sources des effets visuels et sonores (shaders des navires, son)

- Anti-scintillement spéculaire : Kaplanyan *et al.*, [« Filtering Distributions of Normals for Shading Antialiasing »](https://research.nvidia.com/sites/default/files/pubs/2016-06_Filtering-Distributions-of/NDFFiltering.pdf) (NVIDIA, 2016) et [la présentation GDC 2016](https://developer.download.nvidia.com/gameworks/events/GDC2016/akaplanyan_specular_aa.pdf) ; Toksvig (2004).
- Vieillissement des coques : conseils de modélistes navals (salissure à la flottaison, coulures de rouille dans la zone d'éclaboussures, anneau d'algues ; « mieux vaut en faire trop peu »), usure des arêtes et saleté dans les creux guidées par la courbure et l'occlusion.
- Son : forme d'onde de souffle de Friedlander et onde en N d'un projectile supersonique (littérature d'acoustique des armes) ; conception d'explosions en couches (claquement, corps, grondement grave ; la distance supprime d'abord les aigus et le front) ; spatialisation Web Audio (PannerNode HRTF, [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics)).
