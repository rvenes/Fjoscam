import type { FjoscamApi } from '../preload/preload';

declare global {
  interface Window {
    fjoscam: FjoscamApi;
  }
}
