import OpenAI from 'openai';
import type { ProviderConfig } from './types';

// All presets above expose an OpenAI-compatible /chat/completions endpoint,
// so a single client factory covers every provider (built-in or custom).
export function createClient(config: ProviderConfig): OpenAI {
  return new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
}
