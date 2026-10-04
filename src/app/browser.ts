/** Side effects the app needs from the browser. Passed into <App> so tests can replace them. */
export interface BrowserActions {
  /** Offers `text` to the user as a file download. */
  download(filename: string, text: string): void;
  /** Asks a yes/no question; true for yes. */
  confirm(message: string): boolean;
  /** Puts `text` on the clipboard; false when the browser refuses or has no clipboard. */
  copy(text: string): Promise<boolean>;
}

export const browserActions: BrowserActions = {
  download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
  confirm: (message) => window.confirm(message),
  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
};

/** A file name made from a league name: letters, digits and dashes only. */
export function exportFileName(leagueName: string): string {
  return `${fileBase(leagueName)}.draftlab.json`;
}

/** A name as a file name part: lower-case letters, digits and dashes ("Test League" → "test-league"). */
export function fileBase(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'draft';
}
