import { PROVIDER_PRESETS } from './presets';
import type { ProviderPreset, ProviderConfig, CustomProviderInput } from './types';

export class ProviderNotFoundError extends Error {
  constructor(id: string) {
    super(`Provider "${id}" not found`);
    this.name = 'ProviderNotFoundError';
  }
}

export class ProviderKeyMissingError extends Error {
  constructor(id: string, envVar: string) {
    super(`No API key for provider "${id}" (checked explicit apiKey and env var "${envVar}")`);
    this.name = 'ProviderKeyMissingError';
  }
}

export class ProviderRegistry {
  private readonly presets = new Map<string, ProviderPreset>(PROVIDER_PRESETS.map((p) => [p.id, p]));
  private readonly custom = new Map<string, ProviderPreset>();
  private readonly customApiKeys = new Map<string, string>(); // only used when a custom provider sets apiKey directly

  list(): ProviderPreset[] {
    return [...this.presets.values(), ...this.custom.values()];
  }

  get(id: string): ProviderPreset | undefined {
    return this.custom.get(id) ?? this.presets.get(id);
  }

  isCustom(id: string): boolean {
    return this.custom.has(id);
  }

  // Add a fully user-defined provider (any base URL, model, key handling)
  addCustom(input: CustomProviderInput): ProviderPreset {
    const envVar = input.envVar ?? `${input.id.toUpperCase()}_API_KEY`;
    const preset: ProviderPreset = { id: input.id, label: input.label, baseURL: input.baseURL, model: input.model, envVar };
    this.custom.set(input.id, preset);
    if (input.apiKey) this.customApiKeys.set(input.id, input.apiKey);
    return preset;
  }

  updateCustom(id: string, patch: Partial<CustomProviderInput>): ProviderPreset {
    const existing = this.custom.get(id);
    if (!existing) throw new ProviderNotFoundError(id);
    const merged: ProviderPreset = { ...existing, ...patch, id };
    this.custom.set(id, merged);
    if (patch.apiKey) this.customApiKeys.set(id, patch.apiKey);
    return merged;
  }

  removeCustom(id: string): boolean {
    this.customApiKeys.delete(id);
    return this.custom.delete(id);
  }

  // Resolve a provider id into a ready-to-use config, pulling the API key from
  // (in order): explicit override -> stored custom key -> process.env[envVar]
  resolve(id: string, overrideApiKey?: string): ProviderConfig {
    const preset = this.get(id);
    if (!preset) throw new ProviderNotFoundError(id);

    const apiKey = overrideApiKey ?? this.customApiKeys.get(id) ?? process.env[preset.envVar];
    if (!apiKey) throw new ProviderKeyMissingError(id, preset.envVar);

    return { ...preset, apiKey, isCustom: this.isCustom(id) };
  }
}
