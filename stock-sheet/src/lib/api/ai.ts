/**
 * AI Edge Function API
 * Calls the analyse-sheet edge function to extract sheet structure from images
 */

import { supabase } from '@/lib/auth/client';
import type { SheetAnalysisResult } from '@/lib/ai/types';

/**
 * Analyse a stock sheet image using AI
 * Sends to edge function which routes to Claude or Ollama based on config
 * @param imageBase64 Base64-encoded image data
 * @param mimeType Image MIME type (image/jpeg, image/png, etc.)
 * @returns Extracted sheet structure with title, columns, and products
 * @throws Error if analysis fails or image is invalid
 */
export async function analyseSheetImage(
  imageBase64: string,
  mimeType: string
): Promise<SheetAnalysisResult> {
  try {
    const { data, error } = await supabase.functions.invoke('analyse-sheet', {
      body: {
        imageBase64,
        mimeType,
      },
    });

    if (error) {
      console.error('Edge Function error response:', {
        message: error.message,
        status: (error as any).context?.status,
        body: (error as any).context?._bodyInit,
      });
      throw new Error(`Failed to analyse sheet image: ${error.message}`);
    }

    if (!data) {
      throw new Error('No response from sheet analysis');
    }

    // Validate response structure
    if (!data.sheetTitle || !Array.isArray(data.columns) || !Array.isArray(data.products)) {
      console.error('Invalid response structure:', data);
      throw new Error('Invalid response from sheet analysis: missing required fields');
    }

    return data as SheetAnalysisResult;
  } catch (err) {
    // Log full error for debugging
    console.error('analyseSheetImage error:', err instanceof Error ? err.message : String(err));
    throw err;
  }
}
