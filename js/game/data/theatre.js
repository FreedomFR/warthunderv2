// The great war: two sides on one very large sea, the Axis (Japan, Germany, Italy) against the Allies (USA, United Kingdom, France). Every nation has a home among the islands, with
// two airfields (a large one and a medium one), ports where its ships take on shells and fuel and are repaired, coastal batteries, and its own fleets: the ships each navy had
// at sea together at the time, in the proportions of the real navies (the nations are NOT made equal: the United States had far more than France, Germany far fewer big ships
// than Japan). `estimated` marks a guess of the layout (the geography is imaginary); the strengths come from the navies' order of battle of 1941-43 (Wikipedia, Conway's All the
// World's Fighting Ships) and are given in task forces.
//
//   map            the sea: x from -w/2 to w/2 (west to east), z from -h/2 to h/2 (north to south), metres
//   sides          the teams
//   nations        home (centre of the nation's islands), its task forces: { name, role, ships: [{ id, count }], from: 'port index' }
export const THEATRE = {
  map: { w: 190000, h: 120000 },
  sides: [
    { name: 'Axe', rgb: [225, 70, 60], nations: ['Japan', 'Germany', 'Italy'] },
    { name: 'Alliés', rgb: [60, 130, 235], nations: ['USA', 'UK', 'France'] },
  ],
  // the islands of each nation's home (a large one for the large airfield, small ones for the medium airfield, the ports and the batteries, rocks) and of the open sea
  cluster: ['large', 'large', 'small', 'small', 'small', 'rock', 'rock'],
  open: ['large', 'large', 'large', 'large', 'small', 'small', 'small', 'small', 'small', 'small', 'small', 'rock', 'rock', 'rock', 'rock', 'rock', 'rock', 'rock'],
  homeRadius: 16000,
  nations: {
    Japan:   { home: { x: -66000, z: 0 },      side: 0 },
    Germany: { home: { x: -50000, z: -38000 }, side: 0 },
    Italy:   { home: { x: -50000, z: 38000 },  side: 0 },
    USA:     { home: { x: 66000, z: 0 },       side: 1 },
    UK:      { home: { x: 50000, z: -38000 },  side: 1 },
    France:  { home: { x: 50000, z: 38000 },   side: 1 },
  },
};

/**
 * The task forces of each nation (a big navy has more of them). Each is a fleet that sails, fights and goes back to a port as one: `role` 'battle' (the line), 'carrier' (an air group
 * with its escort), 'cruiser' (cruisers and destroyers: raiding and scouting), 'raider' (a few ships alone), 'escort' (destroyers).
 */
export const TASK_FORCES = {
  USA: [
    { name: 'Task Force 58', role: 'carrier', ships: [{ id: 'essex', count: 2 }, { id: 'baltimore', count: 1 }, { id: 'cleveland', count: 1 }, { id: 'fletcher', count: 4 }] },
    { name: 'Task Force 34', role: 'battle', ships: [{ id: 'iowa', count: 2 }, { id: 'baltimore', count: 1 }, { id: 'fletcher', count: 3 }] },
    { name: 'Task Group 77', role: 'cruiser', ships: [{ id: 'cleveland', count: 2 }, { id: 'fletcher', count: 2 }] },
  ],
  Japan: [
    { name: 'Kidō Butai', role: 'carrier', ships: [{ id: 'shokaku', count: 2 }, { id: 'takao', count: 1 }, { id: 'agano', count: 1 }, { id: 'kagero', count: 3 }] },
    { name: 'Force principale', role: 'battle', ships: [{ id: 'yamato', count: 1 }, { id: 'takao', count: 1 }, { id: 'kagero', count: 3 }] },
    { name: 'Force de croiseurs', role: 'cruiser', ships: [{ id: 'agano', count: 1 }, { id: 'kagero', count: 1 }] },
  ],
  UK: [
    { name: 'Force H', role: 'carrier', ships: [{ id: 'illustrious', count: 1 }, { id: 'norfolk', count: 1 }, { id: 'tribal', count: 2 }] },
    { name: 'Home Fleet', role: 'battle', ships: [{ id: 'kgv', count: 1 }, { id: 'belfast', count: 1 }, { id: 'tribal', count: 2 }] },
  ],
  Germany: [
    { name: 'Flotte de bataille', role: 'battle', ships: [{ id: 'bismarck', count: 1 }, { id: 'tirpitz', count: 1 }, { id: 'admiral_hipper', count: 1 }, { id: 'type1936a_mob', count: 2 }] },
    { name: 'Croiseurs', role: 'cruiser', ships: [{ id: 'koenigsberg', count: 1 }, { id: 'type1936a_mob', count: 1 }] },
  ],
  Italy: [
    { name: 'Squadra da battaglia', role: 'battle', ships: [{ id: 'littorio', count: 1 }, { id: 'zara', count: 2 }, { id: 'soldati', count: 2 }] },
    { name: 'Incrociatori', role: 'cruiser', ships: [{ id: 'montecuccoli', count: 1 }] },
  ],
  France: [
    { name: 'Force de Raid', role: 'battle', ships: [{ id: 'richelieu', count: 1 }, { id: 'algerie', count: 1 }, { id: 'fantasque', count: 2 }] },
  ],
};
