/**
 * AI Provider Interface - Implementation-agnostic adapter for sheet analysis
 * Implementations: ClaudeAdapter, OllamaAdapter
 * Environment variable: AI_PROVIDER (default: 'claude')
 */

export interface SheetAnalysisResult {
  sheetTitle: string;
  columns: Array<{
    label: string;
    fieldType?: 'number' | 'text' | 'boolean';
  }>;
  products: string[];
}

export interface AIAdapter {
  /**
   * Analyse a stock sheet image and extract structure
   * @param imageBase64 Image data as base64 string
   * @param mimeType Image MIME type (e.g., 'image/jpeg', 'image/png')
   * @returns Extracted sheet structure with title, columns, and product names
   * @throws Error if analysis fails or image is invalid
   */
  analyseSheetImage(imageBase64: string, mimeType: string): Promise<SheetAnalysisResult>;
}
