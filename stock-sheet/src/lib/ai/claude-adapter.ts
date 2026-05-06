/**
 * Claude AI Adapter - Anthropic implementation
 * Uses claude-opus-4-5 model for sheet analysis
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import Anthropic from 'npm:@anthropic-ai/sdk@^0.28.0';
import type { AIAdapter, SheetAnalysisResult } from './types.ts';

export class ClaudeAdapter implements AIAdapter {
  private client: Anthropic;

  constructor() {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set. Please set it in your .env.local file.');
    }

    if (!apiKey.startsWith('sk-ant-')) {
      throw new Error('ANTHROPIC_API_KEY appears to be invalid (should start with sk-ant-)');
    }

    this.client = new Anthropic({ apiKey });
  }

  async analyseSheetImage(
    imageBase64: string,
    mimeType: string
  ): Promise<SheetAnalysisResult> {
    // Validate inputs
    if (!imageBase64) {
      throw new Error('Image data (base64) is required');
    }

    if (!mimeType || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
      throw new Error('Invalid or unsupported MIME type');
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
      const message = await this.client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType as
                    | 'image/jpeg'
                    | 'image/png'
                    | 'image/gif'
                    | 'image/webp',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: analysisPrompt,
              },
            ],
          },
        ],
      });

      // Extract text content from response
      const textContent = message.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('');

      if (!textContent) {
        throw new Error('No response from Claude');
      }

      // Parse JSON (strip markdown code blocks if present)
      const jsonStr = textContent.replace(/```json|\```/g, '').trim();
      const result = JSON.parse(jsonStr) as SheetAnalysisResult;

      // Validate response structure
      if (!result.sheetTitle || !Array.isArray(result.columns) || !Array.isArray(result.products)) {
        throw new Error('Invalid response structure from Claude');
      }

      return result;
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`Failed to parse Claude response as JSON: ${err.message}\nThis usually means Claude returned something other than JSON`);
      }

      // Handle Anthropic API errors
      if (err instanceof Error) {
        if (err.message.includes('401') || err.message.includes('Unauthorized')) {
          throw new Error('Anthropic API authentication failed. Check your ANTHROPIC_API_KEY.');
        }
        if (err.message.includes('429') || err.message.includes('rate limit')) {
          throw new Error('Anthropic API rate limit exceeded. Try again in a moment.');
        }
        if (err.message.includes('timeout')) {
          throw new Error('Anthropic API request timed out. Try again with a smaller image.');
        }
      }

      throw err;
    }
  }
}
