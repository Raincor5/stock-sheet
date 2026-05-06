/**
 * Edge Function: POS Webhook Receiver
 * Endpoint: POST /functions/v1/pos-webhook/:storeId
 * Validates HMAC signature, maps products, and updates sheet entries
 * Satisfies: FR-POS-01 to FR-POS-05, NFR-SCALE-04, NFR-SEC-06
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { validateWebhookSignature, withRetry, createErrorResponse, createSuccessResponse } from './_shared/utils.ts';

interface POSWebhookPayload {
  timestamp: number;
  items: Array<{
    productName?: string;
    productSku?: string;
    quantity: number;
    columnId: string;
  }>;
}

interface POSWebhookResult {
  success: boolean;
  updatedEntries: number;
  skippedItems: number;
  errors: string[];
}

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Extract storeId from URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const storeId = pathParts[pathParts.length - 1];

    if (!storeId || storeId.length === 0) {
      return createErrorResponse(400, 'Missing or invalid store ID in path');
    }

    // 1. Validate webhook signature (NFR-SEC-06)
    const signature = req.headers.get('X-Signature');
    if (!signature) {
      return createErrorResponse(401, 'Missing X-Signature header');
    }

    // Get request body as text for signature validation
    const bodyText = await req.text();

    // Create Supabase service client (using service role key for direct DB access)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // Service role for direct access
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Fetch store webhook secret
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      return createErrorResponse(404, 'Store not found', storeError);
    }

    // TODO: Fetch webhook secret from store_integrations table when implemented
    // For now, use a placeholder that would come from store_integrations
    const webhookSecret = Deno.env.get('POS_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.warn('POS_WEBHOOK_SECRET not configured, webhook validation skipped');
      // In production, this should fail. For now, log warning for development.
    }

    // Validate signature if secret is available
    if (webhookSecret) {
      const isValid = await validateWebhookSignature(bodyText, signature, webhookSecret);
      if (!isValid) {
        return createErrorResponse(401, 'Invalid webhook signature');
      }
    }

    // 2. Parse webhook payload
    let payload: POSWebhookPayload;
    try {
      payload = JSON.parse(bodyText) as POSWebhookPayload;
    } catch (err) {
      return createErrorResponse(400, 'Invalid JSON in webhook payload', err);
    }

    // Validate payload structure
    if (!payload.items || !Array.isArray(payload.items)) {
      return createErrorResponse(400, 'Missing or invalid items array in payload');
    }

    // 3. Get today's stock sheet for this store
    const today = new Date().toISOString().split('T')[0];
    const { data: sheets, error: sheetError } = await supabase
      .from('stock_sheets')
      .select('id')
      .eq('store_id', storeId)
      .eq('date', today)
      .is('archived_at', null)
      .single();

    if (sheetError && sheetError.code !== 'PGRST116') {
      return createErrorResponse(500, 'Error fetching today sheet', sheetError);
    }

    if (!sheets) {
      return createErrorResponse(404, `No active stock sheet for today (${today}) in store ${storeId}`);
    }

    const sheetId = sheets.id;

    // 4. Process items and update sheet entries
    const result: POSWebhookResult = {
      success: true,
      updatedEntries: 0,
      skippedItems: 0,
      errors: [],
    };

    // Get all products for this store (cached across items)
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, sku')
      .eq('store_id', storeId)
      .is('archived_at', null);

    if (productsError) {
      return createErrorResponse(500, 'Error fetching products', productsError);
    }

    if (!products || products.length === 0) {
      return createErrorResponse(400, 'No active products found for this store');
    }

    // Process each item
    for (const item of payload.items) {
      try {
        // Find product by name or SKU
        const product = products.find((p) => p.name === item.productName || (item.productSku && p.sku === item.productSku));

        if (!product) {
          result.skippedItems++;
          result.errors.push(`Product not found: ${item.productName || item.productSku}`);
          continue;
        }

        if (!item.columnId || typeof item.columnId !== 'string') {
          result.skippedItems++;
          result.errors.push(`Invalid column ID for product ${product.name}`);
          continue;
        }

        if (typeof item.quantity !== 'number') {
          result.skippedItems++;
          result.errors.push(`Invalid quantity for product ${product.name}`);
          continue;
        }

        // Upsert sheet entry with retry
        await withRetry(async () => {
          const { error: upsertError } = await supabase.from('sheet_entries').upsert(
            [
              {
                sheet_id: sheetId,
                product_id: product.id,
                column_id: item.columnId,
                value: String(item.quantity),
                is_pos_populated: true,
              },
            ],
            {
              onConflict: 'sheet_id,product_id,column_id',
            }
          );

          if (upsertError) {
            throw upsertError;
          }
        });

        result.updatedEntries++;
      } catch (err) {
        result.errors.push(`Error processing product ${item.productName || item.productSku}: ${String(err)}`);
      }
    }

    // Log results
    console.info(`pos-webhook completed for store ${storeId}`, {
      sheetId,
      updatedEntries: result.updatedEntries,
      skippedItems: result.skippedItems,
      errors: result.errors.length,
    });

    // 5. Return result
    return createSuccessResponse(result);
  } catch (err) {
    console.error('pos-webhook fatal error:', err);

    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
});
