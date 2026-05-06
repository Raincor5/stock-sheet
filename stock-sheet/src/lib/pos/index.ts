/**
 * POS Integration Mapping Logic
 * Supports multiple POS systems through standardized webhook format
 * Satisfies: FR-POS-01 to FR-POS-05, NFR-SCALE-04
 */

export interface POSProductReference {
  productName?: string;
  productSku?: string;
  quantity: number;
  columnId: string;
}

export interface POSSystemMapping {
  name: string;
  version: string;
  lastUpdated: Date;
  supportedFields: string[];
}

/**
 * Map raw POS data to standardized webhook format
 * Each POS system has its own data structure; this maps to our common format
 */
export class POSMapper {
  /**
   * Map Square POS system data to standardized format
   */
  static mapSquareData(squareData: unknown): POSProductReference[] {
    // TODO: Implement Square POS mapping
    // Square exports: item_name, item_sku, quantity, transaction_timestamp
    throw new Error('Square POS mapping not yet implemented');
  }

  /**
   * Map Toast POS system data to standardized format
   */
  static mapToastData(toastData: unknown): POSProductReference[] {
    // TODO: Implement Toast POS mapping
    // Toast exports: item_name, item_number (SKU), sales_qty
    throw new Error('Toast POS mapping not yet implemented');
  }

  /**
   * Map Shopify inventory data to standardized format
   */
  static mapShopifyData(shopifyData: unknown): POSProductReference[] {
    // TODO: Implement Shopify mapping
    // Shopify exports: product_name, sku, sold_quantity
    throw new Error('Shopify POS mapping not yet implemented');
  }

  /**
   * Generic mapper for custom POS systems
   * Expects a standardized field mapping configuration
   */
  static mapCustomData(
    rawData: unknown,
    fieldMapping: {
      productName?: string;
      productSku?: string;
      quantity: string;
      columnId: string;
    }
  ): POSProductReference[] {
    if (!Array.isArray(rawData)) {
      throw new Error('Expected array of items');
    }

    return rawData.map((item) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error('Invalid item structure');
      }

      const itemObj = item as Record<string, unknown>;

      return {
        productName: fieldMapping.productName ? String(itemObj[fieldMapping.productName] ?? '') : undefined,
        productSku: fieldMapping.productSku ? String(itemObj[fieldMapping.productSku] ?? '') : undefined,
        quantity: Number(itemObj[fieldMapping.quantity] ?? 0),
        columnId: String(itemObj[fieldMapping.columnId] ?? ''),
      };
    });
  }
}

/**
 * Track supported POS integrations
 */
export const SUPPORTED_POS_SYSTEMS: Record<string, POSSystemMapping> = {
  square: {
    name: 'Square',
    version: '1.0.0',
    lastUpdated: new Date('2026-01-01'),
    supportedFields: ['item_name', 'item_sku', 'quantity', 'transaction_timestamp'],
  },
  toast: {
    name: 'Toast',
    version: '1.0.0',
    lastUpdated: new Date('2026-01-01'),
    supportedFields: ['item_name', 'item_number', 'sales_qty'],
  },
  shopify: {
    name: 'Shopify',
    version: '1.0.0',
    lastUpdated: new Date('2026-01-01'),
    supportedFields: ['product_name', 'sku', 'sold_quantity'],
  },
};

/**
 * Validate POS webhook payload structure
 */
export function validatePOSPayload(payload: unknown): payload is {
  timestamp: number;
  items: Array<{
    productName?: string;
    productSku?: string;
    quantity: number;
    columnId: string;
  }>;
} {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.timestamp !== 'number') {
    return false;
  }

  if (!Array.isArray(p.items)) {
    return false;
  }

  return p.items.every((item) => {
    if (typeof item !== 'object' || item === null) {
      return false;
    }

    const i = item as Record<string, unknown>;

    // At least one of productName or productSku must be present
    const hasProductRef = i.productName !== undefined || i.productSku !== undefined;

    return hasProductRef && typeof i.quantity === 'number' && typeof i.columnId === 'string';
  });
}
