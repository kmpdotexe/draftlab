export interface Problem {
  /** Where the problem is, e.g. "league.drafters[2]", "picks[3]" or "line 4". */
  path: string;
  message: string;
}
