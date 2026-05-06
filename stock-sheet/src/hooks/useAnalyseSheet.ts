/**
 * AI Analysis Query Hooks
 * TanStack Query wrappers for sheet analysis operations
 */

import { useMutation } from '@tanstack/react-query';
import { analyseSheetImage } from '@/lib/api/ai';
import type { SheetAnalysisResult } from '@/lib/ai/types';

/**
 * Analyse a stock sheet image using AI
 * Sends to edge function which routes to Claude or Ollama
 * @returns Mutation for sheet analysis
 */
export function useAnalyseSheet() {
  return useMutation({
    mutationFn: async (params: { imageBase64: string; mimeType: string }): Promise<SheetAnalysisResult> => {
      return analyseSheetImage(params.imageBase64, params.mimeType);
    },
    onError: (error) => {
      console.error('Failed to analyse sheet:', error);
    },
    retry: 3,
  });
}
