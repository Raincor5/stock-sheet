# Supabase Edge Functions

Server-side API endpoints for the Stock Sheet Management System. All functions require authentication and use Deno runtime.

## Setup

```bash
cd stock-sheet

# Install Supabase CLI (if not already installed)
npm install -g supabase

# Start local development server
supabase functions serve

# Deploy to production
supabase functions deploy analyse-sheet
supabase functions deploy pos-webhook
```

## Environment Variables

### Local Development (.env.local)

```bash
# AI Provider configuration
AI_PROVIDER=claude                    # or 'ollama'
ANTHROPIC_API_KEY=sk-...              # Required if AI_PROVIDER=claude
OLLAMA_BASE_URL=http://localhost:11434 # Optional, used if AI_PROVIDER=ollama
OLLAMA_MODEL=llava                    # Optional, used if AI_PROVIDER=ollama

# POS Integration
POS_WEBHOOK_SECRET=your-secret-here   # Placeholder; will be store-specific
```

### Production (Supabase Dashboard)

Set the same variables in your Supabase project's Edge Function settings.

## Functions

### POST /functions/v1/analyse-sheet

**Authentication:** Bearer token (Supabase auth)

**Request:**
```json
{
  "imageBase64": "data:image/png;base64,...",
  "mimeType": "image/jpeg"
}
```

**Response:**
```json
{
  "sheetTitle": "Weekly Stock Count",
  "columns": [
    { "label": "Opening Stock", "type": "display" },
    { "label": "Received", "type": "additive" },
    { "label": "Sold", "type": "subtractive" }
  ],
  "products": ["Product A", "Product B"]
}
```

**Error Response:**
```json
{
  "error": "Internal server error"
}
```

**Implementation Details:**
- Uses AI adapter (Claude or Ollama) to analyse image
- Implements retry with exponential backoff (3 attempts)
- Logs analysis request and result for observability
- Returns generic error messages (details logged server-side)

---

### POST /functions/v1/pos-webhook/:storeId

**Authentication:** HMAC-SHA256 signature in `X-Signature` header

**Request:**
```json
{
  "timestamp": 1715000000,
  "items": [
    {
      "productName": "Widget",
      "productSku": "WID-001",
      "quantity": 10,
      "columnId": "sold"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "updatedEntries": 1,
  "skippedItems": 0,
  "errors": []
}
```

**Implementation Details:**
- Validates HMAC-SHA256 signature (constant-time comparison)
- Maps products by name or SKU
- Updates today's stock sheet entries (creates sheet if missing)
- Marks entries as `is_pos_populated=true`
- Implements retry for database operations
- Logs store ID, sheet ID, and results for audit trail

---

## Architecture

### AI Adapter Pattern (Satisfies NFR-SCALE-03)

All AI calls go through the `AIAdapter` interface:
- **ClaudeAdapter**: Uses Anthropic Claude API (production)
- **OllamaAdapter**: Uses self-hosted Ollama (local/private deployments)

Switch providers via `AI_PROVIDER` environment variable with zero code changes.

```typescript
import { getAIAdapter } from '../../src/lib/ai/index.ts'

const adapter = getAIAdapter()  // Returns ClaudeAdapter or OllamaAdapter based on env
const result = await adapter.analyseSheetImage(base64, mimeType)
```

### Retry Logic (Satisfies NFR-REL-04)

All external API calls use exponential backoff:
- **Max attempts:** 3
- **Base delay:** 500ms
- **Backoff formula:** 2^attempt * baseDelayMs

```typescript
import { withRetry } from './_shared/utils.ts'

const result = await withRetry(async () => {
  const ai = getAIAdapter()
  return await ai.analyseSheetImage(base64, mimeType)
})
```

### Webhook Security (Satisfies NFR-SEC-06)

HMAC-SHA256 validation with constant-time comparison:
```typescript
import { validateWebhookSignature } from './_shared/utils.ts'

const isValid = await validateWebhookSignature(
  payload,
  signatureFromHeader,
  storeWebhookSecret
)
```

## Development Workflow

1. **Write function** in `supabase/functions/your-function/index.ts`
2. **Test locally** with `supabase functions serve`
3. **Test in Supabase Studio** at http://127.0.0.1:54323
4. **Verify** error handling and authentication
5. **Deploy** with `supabase functions deploy your-function`

## Testing

Use curl or Postman to test functions locally:

```bash
# Analyse sheet
curl -X POST http://127.0.0.1:54321/functions/v1/analyse-sheet \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "imageBase64": "...",
    "mimeType": "image/jpeg"
  }'

# POS webhook
curl -X POST http://127.0.0.1:54321/functions/v1/pos-webhook/store-id-here \
  -H "X-Signature: hex-encoded-signature" \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": 1715000000,
    "items": []
  }'
```

## Logs

View function logs in Supabase Studio or via CLI:
```bash
supabase functions logs analyse-sheet --tail
```

## Requirements Satisfied

- **FR-AI-01 to FR-AI-07**: Image analysis pipeline with multiple columns and products
- **FR-POS-01 to FR-POS-05**: Webhook integration with product mapping
- **NFR-SCALE-03**: AI provider swappability via environment variable
- **NFR-SCALE-04**: POS system extensibility through mapper pattern
- **NFR-SEC-03**: API keys server-side only (never exposed to client)
- **NFR-SEC-06**: Webhook HMAC-SHA256 authentication with constant-time comparison
- **NFR-REL-04**: Retry with exponential backoff for external calls
- **NFR-OBS-02**: Structured logging for AI calls and webhook processing

## Next Steps

- [ ] Implement PDF generation function for printing stock sheets
- [ ] Add store_integrations table for webhook secret storage
- [ ] Implement Square, Toast, and Shopify POS mappers
- [ ] Add webhook signature secret rotation mechanism
- [ ] Set up monitoring and alerting for function errors
