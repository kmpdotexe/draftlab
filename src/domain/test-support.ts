import type { LeagueConfig, LegalSpeciesSource } from './league';
import type { ItemEntry, MoveEntry, SpeciesEntry, StatTable } from './types';
import type { SetSnapshot } from './set-check';

/** Species ids in the default test snapshot. Note: 'h' has no price and 'e' is banned in leagueOf(). */
export const SPECIES_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Default prices: 'h' is deliberately absent (unpriced) and 'g' costs 0. */
export const PRICES: Record<string, number> = { a: 30, b: 20, c: 10, d: 5, e: 5, f: 1, g: 0 };

/** A snapshot slice whose species table holds only keys; the draft logic never reads the values. */
export function snapshotOf(ids: string[] = SPECIES_IDS): LegalSpeciesSource {
  return {
    formatId: 'fmt',
    species: Object.fromEntries(ids.map((id) => [id, {} as SpeciesEntry])),
  };
}

/** A valid 3-drafter snake league of 2 rounds and a budget of 50. Override any field. */
export function leagueOf(overrides: Partial<LeagueConfig> = {}): LeagueConfig {
  return {
    name: 'Test League',
    formatId: 'fmt',
    drafters: ['Ana', 'Ben', 'Cy'],
    order: 'snake',
    rounds: 2,
    me: 1,
    budget: 50,
    prices: { ...PRICES },
    extraBans: ['e'],
    ...overrides,
  };
}

const FLAT_BASE: StatTable = { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 };

/** A complete species entry with harmless defaults. */
export function speciesEntry(id: string, name: string, overrides: Partial<SpeciesEntry> = {}): SpeciesEntry {
  return {
    id,
    name,
    num: 1,
    types: ['Normal'],
    baseStats: { ...FLAT_BASE },
    abilities: ['Pressure'],
    tags: [],
    baseSpecies: name,
    forme: '',
    requiredItem: null,
    ...overrides,
  };
}

export function moveEntry(id: string, name: string): MoveEntry {
  return { id, name, type: 'Normal', category: 'Physical', basePower: 40, accuracy: 100, priority: 0, target: 'normal', flags: [] };
}

export function itemEntry(id: string, name: string, usableBy?: string[]): ItemEntry {
  return usableBy ? { id, name, usableBy } : { id, name };
}

/** A small hand-built snapshot for set and team tests: ten species (three of them Mega forms), ten moves, seven items. */
export function setSnapshot(): SetSnapshot {
  return {
    formatId: 'fmt',
    species: {
      incineroar: speciesEntry('incineroar', 'Incineroar', {
        num: 727,
        abilities: ['Blaze', 'Intimidate'],
        baseStats: { hp: 95, atk: 115, def: 90, spa: 80, spd: 90, spe: 60 },
      }),
      staraptor: speciesEntry('staraptor', 'Staraptor', { num: 398, abilities: ['Intimidate', 'Reckless'] }),
      staraptormega: speciesEntry('staraptormega', 'Staraptor-Mega', {
        num: 398,
        abilities: ['Intimidate'],
        baseSpecies: 'Staraptor',
        forme: 'Mega',
        requiredItem: 'Staraptite',
      }),
      charizard: speciesEntry('charizard', 'Charizard', { num: 6, abilities: ['Blaze', 'Solar Power'] }),
      charizardmegax: speciesEntry('charizardmegax', 'Charizard-Mega-X', {
        num: 6,
        abilities: ['Tough Claws'],
        baseSpecies: 'Charizard',
        forme: 'Mega-X',
        requiredItem: 'Charizardite X',
      }),
      floetteeternal: speciesEntry('floetteeternal', 'Floette-Eternal', { num: 670, abilities: ['Flower Veil'] }),
      floettemega: speciesEntry('floettemega', 'Floette-Mega', {
        num: 670,
        abilities: ['Fairy Aura'],
        baseSpecies: 'Floette',
        forme: 'Mega',
        requiredItem: 'Floettite',
      }),
      kingambit: speciesEntry('kingambit', 'Kingambit', { num: 983, abilities: ['Defiant', 'Supreme Overlord', 'Pressure'] }),
      garchomp: speciesEntry('garchomp', 'Garchomp', { num: 445, abilities: ['Sand Veil', 'Rough Skin'] }),
      sinistcha: speciesEntry('sinistcha', 'Sinistcha', { num: 1013, abilities: ['Hospitality', 'Heatproof'] }),
    },
    moves: {
      fakeout: moveEntry('fakeout', 'Fake Out'),
      flareblitz: moveEntry('flareblitz', 'Flare Blitz'),
      partingshot: moveEntry('partingshot', 'Parting Shot'),
      throatchop: moveEntry('throatchop', 'Throat Chop'),
      bravebird: moveEntry('bravebird', 'Brave Bird'),
      closecombat: moveEntry('closecombat', 'Close Combat'),
      suckerpunch: moveEntry('suckerpunch', 'Sucker Punch'),
      kowtowcleave: moveEntry('kowtowcleave', 'Kowtow Cleave'),
      earthquake: moveEntry('earthquake', 'Earthquake'),
      lightofruin: moveEntry('lightofruin', 'Light of Ruin'),
    },
    learnsets: {
      incineroar: ['fakeout', 'flareblitz', 'partingshot', 'throatchop'],
      staraptor: ['bravebird', 'closecombat'],
      staraptormega: ['bravebird', 'closecombat'],
      charizard: ['flareblitz'],
      charizardmegax: ['flareblitz'],
      floetteeternal: ['lightofruin'],
      floettemega: ['lightofruin'],
      kingambit: ['suckerpunch', 'kowtowcleave'],
      garchomp: ['earthquake'],
      sinistcha: [],
    },
    items: {
      sitrusberry: itemEntry('sitrusberry', 'Sitrus Berry'),
      passhoberry: itemEntry('passhoberry', 'Passho Berry'),
      leftovers: itemEntry('leftovers', 'Leftovers'),
      choicescarf: itemEntry('choicescarf', 'Choice Scarf'),
      staraptite: itemEntry('staraptite', 'Staraptite', ['staraptor']),
      charizarditex: itemEntry('charizarditex', 'Charizardite X', ['charizard']),
      floettite: itemEntry('floettite', 'Floettite', ['floetteeternal']),
    },
  };
}
