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
  },
);
