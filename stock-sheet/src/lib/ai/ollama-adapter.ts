/**
 * Ollama AI Adapter - Self-hosted open-source LLM implementation
 * Supports any Ollama-compatible model with vision capabilities
 * Requires: OLLAMA_BASE_URL (default: http://localhost:11434) and OLLAMA_MODEL (default: llava)
 */

import type { AIAdapter, SheetAnalysisResult } from './types.ts';

interface OllamaGenerateResponse {
  response: string;
  model: string;
  created_at: string;
  done: boolean;
}

export class OllamaAdapter implements AIAdapter {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = (Deno.env.get('OLLAMA_BASE_URL') ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = Deno.env.get('OLLAMA_MODEL') ?? 'llava';
  }

  async analyseSheetImage(
    imageBase64: string,
    _mimeType: string
  ): Promise<SheetAnalysisResult> {
    // Validate inputs
    if (!imageBase64) {
      throw new Error('Image data (base64) is required');
    }

    const analysisPrompt = `You are a stock sheet analysis expert. Analyse the provided stock sheet image and extract:
1. The sheet title or header
2. The column labels
3. All product names/items visible

Return ONLY a valid JSON object (no markdown, no extra text) with this exact structure:
{
  "sheetTitle": "string",
  "columns": [
    { "label": "string", "fieldType": "number" | "text" | "boolean" }
  ],
  "products": ["string"]
}

Use "boolean" for yes/no, pass/fail, or checked/not checked fields. Use "text" only for clearly free-text columns such as notes, comments, reasons, or descriptions. Use "number" for count, quantity, or measured numeric fields. Be concise with product names and column labels.`;

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: analysisPrompt,
          images: [imageBase64],
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as OllamaGenerateResponse;

      if (!data.response) {
        throw new Error('No response from Ollama');
      }

      // Parse JSON (strip markdown code blocks if present)
      const jsonStr = data.response.replace(/```json|\```/g, '').trim();
      const result = JSON.parse(jsonStr) as SheetAnalysisResult;

      // Validate response structure
      if (!result.sheetTitle || !Array.isArray(result.columns) || !Array.isArray(result.products)) {
        throw new Error('Invalid response structure from Ollama');
      }

      return result;
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(`Connection failed to Ollama at ${this.baseUrl}: ${err.message}`);
      }
      if (err instanceof SyntaxError) {
        throw new Error(`Failed to parse Ollama response: ${err.message}`);
      }
      throw err;
    }
  }
}
