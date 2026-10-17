// Ready-made fleet compositions for the setup screen.
export const PRESETS = [
  {
    id: 'duel', name: 'Duel de cuirassés : USA contre Japon',
    teams: [
      { name: 'Bleus', entries: [{ id: 'iowa', count: 1 }, { id: 'baltimore', count: 1 }, { id: 'fletcher', count: 2 }] },
      { name: 'Rouges', entries: [{ id: 'yamato', count: 1 }, { id: 'takao', count: 1 }, { id: 'kagero', count: 2 }] },
    ],
  },
  {
    id: 'atlantic', name: 'Atlantique : Royal Navy contre Kriegsmarine',
    teams: [
      { name: 'Bleus', entries: [{ id: 'kgv', count: 1 }, { id: 'norfolk', count: 1 }, { id: 'belfast', count: 1 }, { id: 'tribal', count: 2 }] },
      { name: 'Rouges', entries: [{ id: 'bismarck', count: 1 }, { id: 'admiral_hipper', count: 1 }, { id: 'koenigsberg', count: 1 }, { id: 'type1936a_mob', count: 2 }] },
    ],
  },
  {
    id: 'carriers', name: 'Pacifique : groupes aéronavals',
    teams: [
      { name: 'Bleus', entries: [{ id: 'essex', count: 1 }, { id: 'cleveland', count: 2 }, { id: 'fletcher', count: 3 }] },
      { name: 'Rouges', entries: [{ id: 'shokaku', count: 1 }, { id: 'agano', count: 2 }, { id: 'kagero', count: 3 }] },
    ],
  },
  {
    id: 'med', name: 'Méditerranée : France contre Italie',
    teams: [
      { name: 'Bleus', entries: [{ id: 'richelieu', count: 1 }, { id: 'algerie', count: 1 }, { id: 'la_galissoniere', count: 1 }, { id: 'fantasque', count: 2 }] },
      { name: 'Rouges', entries: [{ id: 'littorio', count: 1 }, { id: 'zara', count: 1 }, { id: 'montecuccoli', count: 1 }, { id: 'soldati', count: 2 }] },
    ],
  },
  {
    id: 'allies', name: 'Grande bataille : Alliés contre Axe',
    teams: [
      { name: 'Bleus', entries: [{ id: 'iowa', count: 1 }, { id: 'kgv', count: 1 }, { id: 'richelieu', count: 1 }, { id: 'baltimore', count: 1 }, { id: 'belfast', count: 1 }, { id: 'essex', count: 1 }, { id: 'fletcher', count: 2 }, { id: 'tribal', count: 1 }] },
      { name: 'Rouges', entries: [{ id: 'yamato', count: 1 }, { id: 'bismarck', count: 1 }, { id: 'littorio', count: 1 }, { id: 'takao', count: 1 }, { id: 'admiral_hipper', count: 1 }, { id: 'shokaku', count: 1 }, { id: 'kagero', count: 2 }, { id: 'soldati', count: 1 }] },
    ],
  },
  {
    id: 'ffa', name: 'Mêlée à quatre équipes',
    teams: [
      { name: 'Bleus', entries: [{ id: 'iowa', count: 1 }, { id: 'fletcher', count: 2 }] },
      { name: 'Rouges', entries: [{ id: 'yamato', count: 1 }, { id: 'kagero', count: 2 }] },
      { name: 'Verts', entries: [{ id: 'bismarck', count: 1 }, { id: 'type1936a_mob', count: 2 }] },
      { name: 'Jaunes', entries: [{ id: 'kgv', count: 1 }, { id: 'tribal', count: 2 }] },
    ],
  },
];
