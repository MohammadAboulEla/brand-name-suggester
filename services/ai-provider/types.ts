export interface ProviderPreset {
  id: string;
  label: string;
  baseURL: string;
  model: string;
  envVar: string;
}

// Fully resolved provider, ready to build a client from
export interface ProviderConfig extends ProviderPreset {
  apiKey: string;
  isCustom: boolean;
}

// Shape used when a user manually adds/edits a provider
export interface CustomProviderInput {
  id: string;
  label: string;
  baseURL: string;
  model: string;
  envVar?: string; // defaults to `${ID}_API_KEY`
  apiKey?: string; // set directly instead of using an env var
}
