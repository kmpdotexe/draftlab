export interface FormatConfig {
  /** Showdown format id, e.g. "gen9championsvgc2026regmb". Also the data directory name. */
  id: string;
  label: string;
  /** Smogon stats format ids in priority order; the first with published stats wins. */
  statsFormatIds: string[];
  /** Rating cutoff of the chaos file to use (0, 1500, 1630, or 1760). */
  cutoff: number;
}

// Only formats the installed pokemon-showdown release knows about can be listed here.
// Reg M-C is not in 0.11.11; when a release (or pinned build) has it, add:
//   { id: 'gen9championsvgc2026regmc', label: 'Champions VGC 2026 Reg M-C',
//     statsFormatIds: ['gen9championsvgc2026regmc', 'gen9championsvgc2026regmb'], cutoff: 1630 }
// (the first-choice stats id has no published stats yet, so usage falls back to Reg M-B).
export const FORMATS: FormatConfig[] = [
  {
    id: 'gen9championsvgc2026regmb',
    label: 'Champions VGC 2026 Reg M-B',
    statsFormatIds: ['gen9championsvgc2026regmb'],
    cutoff: 1630,
  },
];
