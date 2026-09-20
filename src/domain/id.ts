export type ID = string;

/** Showdown-style id: lowercase, letters and digits only. */
export function toID(text: unknown): ID {
  if (typeof text !== 'string' && typeof text !== 'number') return '';
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '');
}
