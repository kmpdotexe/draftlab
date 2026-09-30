/** Side effects the app needs from the browser. Passed into <App> so tests can replace them. */
export interface BrowserActions {
  /** Offers `text` to the user as a file download. */
  download(filename: string, text: string): void;
  /** Asks a yes/no question; true for yes. */
  confirm(message: string): boolean;
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
};

/** A file name made from a league name: letters, digits and dashes only. */
export function exportFileName(leagueName: string): string {
  const base = leagueName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'draft'}.draftlab.json`;
}
