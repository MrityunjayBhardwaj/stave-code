/**
 * Asset provider registry — module-level singleton, same shape as
 * `panels/registry.ts` and `commands/registry.ts`. Providers register once
 * (typically in a `useEffect` in the app shell) and the Asset Library panel
 * enumerates them live; a lazily-filling provider calls
 * {@link notifyAssetProvidersChanged} so the panel re-lists.
 *
 * One provider per {@link AssetType}: registering a type that's already present
 * replaces it (last-writer-wins), which is how #820's real Sounds provider
 * supersedes the demo stub.
 */

import type { AssetProvider, AssetType } from "./types";

const providers = new Map<AssetType, AssetProvider>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

/** Register (or replace) the provider for its type. Returns an unregister fn. */
export function registerAssetProvider(provider: AssetProvider): () => void {
  providers.set(provider.type, provider);
  notify();
  return () => {
    // Only remove if this exact provider is still the registered one — guards
    // against a stale unregister clobbering a provider that replaced it.
    if (providers.get(provider.type) === provider) {
      providers.delete(provider.type);
      notify();
    }
  };
}

/** All registered providers, in stable registration order. */
export function listAssetProviders(): AssetProvider[] {
  return Array.from(providers.values());
}

export function getAssetProvider(type: AssetType): AssetProvider | undefined {
  return providers.get(type);
}

/**
 * Signal that a provider's catalog changed (e.g. sounds finished warming up).
 * The panel subscribes and re-lists; providers themselves also fire this.
 */
export function notifyAssetProvidersChanged(): void {
  notify();
}

export function subscribeToAssetProviders(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
