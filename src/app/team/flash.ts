import { useEffect, useState } from 'react';

/** How long a short confirmation ("Copied.") stays on screen. */
export const FLASH_MS = 4000;

/** A message that clears itself after `FLASH_MS`; a new message restarts the clock. */
export function useFlash(): [string, (message: string) => void] {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (message === '') return;
    const timer = setTimeout(() => setMessage(''), FLASH_MS);
    return () => clearTimeout(timer);
  }, [message]);
  return [message, setMessage];
}

/** Copies `text` and reports the outcome in plain words. */
export async function copyWithMessage(copy: (text: string) => Promise<boolean>, text: string, flash: (message: string) => void) {
  flash((await copy(text)) ? 'Copied.' : "Couldn't copy: use Download instead.");
}
