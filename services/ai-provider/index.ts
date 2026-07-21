export * from './types';
export * from './presets';
export * from './registry';
export * from './client';

import { ProviderRegistry } from './registry';

// Convenience singleton — import this directly in most apps
export const providerRegistry = new ProviderRegistry();
