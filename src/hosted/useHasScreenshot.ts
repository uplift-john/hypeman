import { useSyncExternalStore } from 'react';
import { screenshots } from './hosted';

export function useHasScreenshot(): boolean {
  return useSyncExternalStore(screenshots.subscribe, () => screenshots.get() !== null);
}
