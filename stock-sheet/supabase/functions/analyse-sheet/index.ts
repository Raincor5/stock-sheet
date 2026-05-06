/**
 * Edge Function: Analyse Stock Sheet Image
 * Endpoint: POST /functions/v1/analyse-sheet
 * Requires: Authorization header (Bearer token)
 * Body: { imageBase64: string, mimeType: string }
 * Returns: { sheetTitle, columns: [{label}], products: [] }
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import OpenAI from 'npm:openai@^4.73.0';

interface AnalyseSheetRequest {
  imageBase64?: string;
  mimeType?: string;
}

interface SheetAnalysisResult {
  sheetTitle: string;
  columns: Array<{ label: string; fieldType?: 'number' | 'text' | 'boolean' }>;
  products: string[];
}

// Utility: Retry with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === maxAttempts) {
        break;
      }

      const delay = Math.pow(2, attempt) * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Maximum retries exceeded');
}

// Utility: Parse Bearer token
function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }
  return null;
}

// Utility: Create error response
function createErrorResponse(
  statusCode: number,
  message: string,
  logDetails?: unknown
): Response {
  if (logDetails) {
    console.error(`[${statusCode}] ${message}:`, logDetails);
  } else {
    console.error(`[${statusCode}] ${message}`);
  }

  const genericMessage =
    statusCode === 401 ? 'Unauthorised' : statusCode === 403 ? 'Forbidden' : 'Internal server error';

  return new Response(JSON.stringify({ error: genericMessage }), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

// Utility: Create success response
function createSuccessResponse<T>(data: T, statusCode = 200): Response {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

// AI Analysis: Call OpenAI API
async function analyseSheetWithOpenAI(
  imageBase64: string,
  mimeType: string
): Promise<SheetAnalysisResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  if (!apiKey.startsWith('sk-')) {
    throw new Error('OPENAI_API_KEY appears to be invalid (should start with sk-)');
  }

  const client = new OpenAI({ apiKey });

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

  const response = await client.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: analysisPrompt,
          },
        ],
      },
    ],
    max_tokens: 1024,
  });

  const textContent = response.choices[0]?.message?.content;
  if (!textContent || typeof textContent !== 'string') {
    throw new Error('No response from OpenAI');
  }

  const jsonStr = textContent.replace(/```json|\```/g, '').trim();
  const result = JSON.parse(jsonStr) as SheetAnalysisResult;

  if (!result.sheetTitle || !Array.isArray(result.columns) || !Array.isArray(result.products)) {
    throw new Error('Invalid response structure from OpenAI');
  }

  return result;
}

// Main edge function
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // 1. Authenticate the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createErrorResponse(401, 'Missing Authorization header');
    }

    const token = getBearerToken(authHeader);
    if (!token) {
      return createErrorResponse(401, 'Invalid Authorization header format');
    }

    // Create Supabase client with user's auth token
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return createErrorResponse(401, 'Invalid or expired token', authError);
    }

    // 2. Parse and validate request body
    let body: AnalyseSheetRequest;
    try {
      body = await req.json();
    } catch (err) {
      return createErrorResponse(400, 'Invalid JSON in request body', err);
    }

    if (!body.imageBase64) {
      return createErrorResponse(400, 'Missing required field: imageBase64');
    }

    if (!body.mimeType) {
      return createErrorResponse(400, 'Missing required field: mimeType');
    }

    if (typeof body.imageBase64 !== 'string' || body.imageBase64.length === 0) {
      return createErrorResponse(400, 'Invalid imageBase64: must be non-empty string');
    }

    if (typeof body.mimeType !== 'string' || body.mimeType.length === 0) {
      return createErrorResponse(400, 'Invalid mimeType: must be non-empty string');
    }

    console.info(`analyse-sheet initiated by user ${user.id}`, {
      imageSize: body.imageBase64.length,
      mimeType: body.mimeType,
    });

    // 3. Business logic: Analyse sheet with retry
    let result: SheetAnalysisResult;
    try {
      result = await withRetry(async () => {
        return await analyseSheetWithOpenAI(body.imageBase64, body.mimeType);
      });
    } catch (retryErr) {
      console.error('AI analysis failed after retries:', {
        error: retryErr instanceof Error ? retryErr.message : String(retryErr),
        stack: retryErr instanceof Error ? retryErr.stack : undefined,
      });
      return createErrorResponse(500, 'Failed to analyse sheet image', retryErr);
    }

    // 4. Log success
    console.info(`analyse-sheet completed for user ${user.id}`, {
      sheetTitle: result.sheetTitle,
      columnCount: result.columns.length,
      productCount: result.products.length,
    });

    // 5. Return result
    return createSuccessResponse(result);
  } catch (err) {
    console.error('analyse-sheet fatal error:', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    return createErrorResponse(500, 'Internal server error', err);
  }
});
