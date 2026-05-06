/**
 * Shared utilities for Supabase Edge Functions
 * Includes retry logic, HMAC validation, and error handling
 */

/**
 * Retry with exponential backoff
 * Satisfies NFR-REL-04: Retry mechanisms
 * @param fn Function to retry
 * @param maxAttempts Maximum number of attempts (default: 3)
 * @param baseDelayMs Base delay in milliseconds (default: 500)
 */
export async function withRetry<T>(
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

      // Exponential backoff: 2^attempt * baseDelayMs
      const delay = Math.pow(2, attempt) * baseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Maximum retries exceeded');
}

/**
 * Validate HMAC-SHA256 signature for webhook authentication
 * Satisfies NFR-SEC-06: Webhook authentication
 * @param payload Request body as string or bytes
 * @param signature Signature from X-Signature header (hex string)
 * @param secret Shared secret for HMAC (typically from store_integrations)
 */
export async function validateWebhookSignature(
  payload: string | Uint8Array,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // Convert payload to bytes if string
    const payloadBytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;

    // Convert secret to bytes
    const secretBytes = new TextEncoder().encode(secret);

    // Import HMAC key
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ]);

    // Generate signature
    const signatureBytes = await crypto.subtle.sign('HMAC', key, payloadBytes);

    // Convert to hex string
    const computed = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison to prevent timing attacks
    return timingSafeEqual(computed, signature);
  } catch (err) {
    console.error('Signature validation error:', err);
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Parse Authorization header and return the token
 */
export function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }

  return null;
}

/**
 * Create standardized error response
 * Logs error server-side but returns generic message to client
 * Satisfies NFR-SEC-02: Error message sanitization
 */
export function createErrorResponse(
  statusCode: number,
  message: string,
  logDetails?: unknown
): Response {
  // Log full details server-side
  if (logDetails) {
    console.error(`[${statusCode}] ${message}:`, logDetails);
  } else {
    console.error(`[${statusCode}] ${message}`);
  }

  // Return generic message to client
  const genericMessage = statusCode === 401 ? 'Unauthorised' : statusCode === 403 ? 'Forbidden' : 'Internal server error';

  return new Response(JSON.stringify({ error: genericMessage }), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create standardized success response
 */
export function createSuccessResponse<T>(data: T, statusCode = 200): Response {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
