import { beforeAll, describe, expect, it } from 'vitest';
import { loadShowdownFormat, type ShowdownFormatData } from './source';

describe.each(['gen9championsvgc2026regmb'])(
  'loadShowdownFormat(%s) against the real pokemon-showdown package',
  (formatId) => {
    let data: ShowdownFormatData;

    beforeAll(() => {
      data = loadShowdownFormat(formatId);
    });

    it('reports where the data came from', () => {
      expect(data.formatName).toContain('Champions');
      expect(data.packageVersion).toMatch(/^\d+\.\d+\.\d+/);
      expect(data.mod).toMatch(/^champions/);
    });

    it('includes Incineroar with the right types', () => {
      expect(data.species.incineroar?.types).toEqual(['Fire', 'Dark']);
    });

    it('excludes species that are not legal in Champions', () => {
      expect(data.species.bulbasaur).toBeUndefined();
      expect(data.species.mew).toBeUndefined();
      expect(data.species.mewtwo).toBeUndefined();
    });

    it('has a plausible number of legal species', () => {
      const count = Object.keys(data.species).length;
      expect(count).toBeGreaterThan(150);
      expect(count).toBeLessThan(600);
    });

    it('gives Incineroar the moves real ladder teams run on it', () => {
      // Confirmed against Smogon gen9championsvgc2026regmb-1630 usage (2026-08): 99.8%, 93.8%, 88.8%, 41.2%.
      for (const move of ['fakeout', 'partingshot', 'flareblitz', 'throatchop']) {
        expect(data.learnsets.incineroar, move).toContain(move);
      }
    });

    it('gives battle-only formes the learnset of the form they change from, not their base species', () => {
      // Mega Floette (baseSpecies Floette, changesFrom Floette-Eternal) runs Light of Ruin in 58.1% of real
      // Smogon gen9championsvgc2026regmb-1630 sets (2026-08). Floette itself is non-standard here, so
      // inheriting from baseSpecies loses the move.
      expect(data.learnsets.floettemega).toContain('lightofruin');
    });

    it('has a learnset for every legal species, and every learnset move is in the moves table', () => {
      for (const id of Object.keys(data.species)) {
        expect(data.learnsets[id], `learnset for ${id}`).toBeDefined();
        for (const moveId of data.learnsets[id]) {
          expect(data.moves[moveId], `move ${moveId} (learned by ${id})`).toBeDefined();
        }
      }
    });

    it('reports level 50 flat rules', () => {
      expect(data.rules.ruleset).toContain('Flat Rules');
      expect(data.rules.adjustLevel).toBe(50);
    });

    it('has the legal Champions items with display names', () => {
      const count = Object.keys(data.items).length;
      expect(count).toBeGreaterThanOrEqual(100);
      expect(count).toBeLessThan(400);
      expect(data.items.sitrusberry).toEqual({ id: 'sitrusberry', name: 'Sitrus Berry' });
    });

    it('leaves out items that are not legal in Champions', () => {
      expect(data.items.assaultvest).toBeUndefined(); // marked Past in the Champions mod
    });

    it('ties a Mega stone to the species that can hold it, and only to legal species', () => {
      expect(data.items.staraptite?.usableBy).toContain('staraptor');
      for (const entry of Object.values(data.items)) {
        for (const speciesId of entry.usableBy ?? []) {
          expect(data.species[speciesId], `${entry.id} usableBy ${speciesId}`).toBeDefined();
        }
      }
    });

    it('warns about restricted-species entries it dropped and about required items that are not legal items', () => {
      // Light Ball lists 15 Pikachu forms that are not legal species here.
      expect(data.warnings.some((w) => w.startsWith('Dropped') && w.includes('lightball'))).toBe(true);
      // The package data lists three Ogerpon tera formes as legal but their masks are not legal items.
      // If a package update makes these consistent this test will fail: review, then update it.
      expect(
        data.warnings.some((w) => w.includes('ogerponwellspringtera') && w.includes('Wellspring Mask')),
      ).toBe(true);
    });
  },
);
