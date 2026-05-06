/**
 * AI Adapter Factory - Swap implementations via environment variable
 * Satisfies NFR-SCALE-03: Provider agnostic architecture
 */

import { ClaudeAdapter } from './claude-adapter.ts';
import { OllamaAdapter } from './ollama-adapter.ts';
import type { AIAdapter } from './types.ts';

/**
 * Get the configured AI adapter based on AI_PROVIDER env var
 * @returns Configured AIAdapter instance (ClaudeAdapter by default)
 */
export function getAIAdapter(): AIAdapter {
  const provider = (Deno.env.get('AI_PROVIDER') ?? 'claude').toLowerCase();

  switch (provider) {
    case 'ollama':
      return new OllamaAdapter();
    case 'claude':
    default:
      return new ClaudeAdapter();
  }
}

export type { AIAdapter, SheetAnalysisResult } from './types.ts';
export { ClaudeAdapter } from './claude-adapter.ts';
export { OllamaAdapter } from './ollama-adapter.ts';
