import { toID, type ID } from '../../domain/id';
import type { Problem } from '../../domain/problem';
import type { PokemonSet } from '../../domain/set';
import type { MatchTeam, RosterSets } from '../../domain/team';
import type { Snapshot } from '../../domain/types';

export type ProblemSnapshot = Pick<Snapshot, 'species' | 'moves' | 'items'>;

const speciesName = (id: string, snapshot: ProblemSnapshot): string =>
  Object.hasOwn(snapshot.species, id) ? snapshot.species[id].name : id;
const moveName = (id: string, snapshot: ProblemSnapshot): string => (Object.hasOwn(snapshot.moves, id) ? snapshot.moves[id].name : id);
const itemName = (id: string, snapshot: ProblemSnapshot): string => (Object.hasOwn(snapshot.items, id) ? snapshot.items[id].name : id);

function abilityName(set: PokemonSet, snapshot: ProblemSnapshot): string {
  const ability = set.ability ?? '';
  const species = Object.hasOwn(snapshot.species, set.species) ? snapshot.species[set.species] : null;
  return species?.abilities.find((name) => toID(name) === ability) ?? ability;
}

/**
 * One plain sentence for a problem with a set, using display names. The problem's path says which field it is
 * about (`….ability`, `….moves[i]`, `….item`, `….points`); anything not recognised keeps the domain's message.
 */
export function setProblemText(problem: Problem, set: PokemonSet, snapshot: ProblemSnapshot): string {
  const species = speciesName(set.species, snapshot);
  const { path, message } = problem;

  if (path.endsWith('.ability') && message.includes('is not an ability of')) {
    return `${species} can't have the ability ${abilityName(set, snapshot)}.`;
  }
  const move = /\.moves\[(\d+)\]$/.exec(path);
  if (move && message.includes('is not a legal move')) {
    const id = set.moves?.[Number(move[1])] ?? '';
    return `${species} can't learn ${moveName(id, snapshot)} in this format.`;
  }
  if (path.endsWith('.item')) {
    const item = itemName(set.item ?? '', snapshot);
    if (message.includes('is not a legal item')) return `${item} isn't a legal item in this format.`;
    if (message.includes('can only be held by')) return `${species} can't hold ${item}.`;
    const required = / must hold (.+)$/.exec(message);
    if (required) return `${species} must hold ${required[1]}.`;
  }
  const total = /^total (\d+) is over the (\d+)-point limit$/.exec(message);
  if (path.endsWith('.points') && total) return `Stat points add up to ${total[1]}; the limit is ${total[2]}.`;
  return message;
}

/**
 * One plain sentence for a problem from `validateTeam`. Clause problems name both Pokémon; a member's set
 * problem is prefixed with the member's name. Anything not recognised keeps the domain's message.
 */
export function teamProblemText(problem: Problem, team: MatchTeam, sets: RosterSets, snapshot: ProblemSnapshot): string {
  const { path, message } = problem;
  const name = (id: string) => speciesName(id, snapshot);

  const size = /^at most (\d+) members/.exec(message);
  if (path.endsWith('.members') && size) return `A team has at most ${size[1]} Pokémon.`;

  const species = /^"([^"]+)" and "([^"]+)" are the same Pokémon \(dex number \d+\); Species Clause$/.exec(message);
  if (species) return `Species Clause: ${name(species[2])} and ${name(species[1])} are the same Pokémon.`;

  const item = /^"([^"]+)" and "([^"]+)" both hold (.+); Item Clause$/.exec(message);
  if (item) return `Item Clause: ${name(item[2])} and ${name(item[1])} both hold ${item[3]}.`;

  const member = /\.members\[(\d+)\](\..+)?$/.exec(path);
  if (member) {
    const id: ID = team.members[Number(member[1])] ?? '';
    if (message.endsWith('is not on your roster')) return `${name(id)} is not on your roster.`;
    if (member[2] !== undefined) {
      const set = Object.hasOwn(sets, id) ? sets[id] : { species: id };
      return `${name(id)}: ${setProblemText(problem, set, snapshot)}`;
    }
  }
  return message;
}
