# Client-Side Integration Layer

Server state management through TanStack Query (React Query) and typed Supabase calls. All communication with the backend happens through this layer.

## Architecture

```
┌─────────────────────────────────────┐
│  UI Components (screens/features)   │
├─────────────────────────────────────┤
│  React Query Hooks                  │
│  (src/hooks/*.ts)                   │
├─────────────────────────────────────┤
│  API Helpers                        │
│  (src/lib/api/*.ts)                 │
├─────────────────────────────────────┤
│  Supabase Client                    │
│  (src/lib/auth/client.ts)           │
├─────────────────────────────────────┤
│  ↓ PostgreSQL / Edge Functions      │
│  Supabase Backend                   │
└─────────────────────────────────────┘
```

### Layer Responsibilities

- **API Helpers** (`src/lib/api/`): Plain async functions, no React, no hooks
- **React Query Hooks** (`src/hooks/`): Wrap API calls, manage loading/error/data states
- **UI Components**: Use hooks via `const { data, isLoading, error } = useMyHook()`

## API Helpers

Plain async functions for all database and edge function calls. No caching, retry, or React.

### Sheets (`src/lib/api/sheets.ts`)

```typescript
// Fetch a sheet by date
export async function fetchSheetForDate(storeId: string, date: string): Promise<SheetWithEntries | null>

// Auto-creates today's sheet if missing
export async function fetchTodaySheet(storeId: string, templateId: string): Promise<SheetWithEntries>

// Get history for a range
export async function fetchSheetHistory(storeId: string, startDate: string, endDate: string): Promise<SheetRow[]>

// Save single or batch entries
export async function saveSheetEntry(entry: SheetEntryInsert): Promise<SheetEntryRow>
export async function batchSaveEntries(entries: SheetEntryInsert[]): Promise<SheetEntryRow[]>

// Lock/unlock/archive
export async function lockSheet(sheetId: string): Promise<SheetRow>
export async function unlockSheet(sheetId: string): Promise<SheetRow>
export async function archiveSheet(sheetId: string): Promise<SheetRow>
export async function restoreSheet(sheetId: string): Promise<SheetRow>
```

### Products (`src/lib/api/products.ts`)

```typescript
export async function fetchProducts(storeId: string): Promise<ProductRow[]>
export async function fetchProductById(productId: string): Promise<ProductRow | null>
export async function fetchLowStockProducts(storeId: string): Promise<ProductRow[]>

// CRUD (manager only via RLS)
export async function createProduct(product: ProductInsert): Promise<ProductRow>
export async function updateProduct(productId: string, updates: ProductUpdate): Promise<ProductRow>
export async function archiveProduct(productId: string): Promise<ProductRow>
export async function restoreProduct(productId: string): Promise<ProductRow>
```

### Stores (`src/lib/api/stores.ts`)

```typescript
export async function fetchMyStores(): Promise<StoreRow[]>
export async function fetchStoreById(storeId: string): Promise<StoreRow | null>
export async function getUserRoleInStore(storeId: string, userId: string): Promise<'manager' | 'staff' | null>

export async function fetchStoreMembers(storeId: string): Promise<StoreMemberRow[]>
export async function addStoreMember(member: StoreMemberInsert): Promise<StoreMemberRow>
export async function updateStoreMemberRole(memberId: string, role: 'manager' | 'staff'): Promise<StoreMemberRow>
export async function removeStoreMember(memberId: string): Promise<void>
```

### AI (`src/lib/api/ai.ts`)

```typescript
// Call the analyse-sheet edge function
export async function analyseSheetImage(imageBase64: string, mimeType: string): Promise<SheetAnalysisResult>
```

## React Query Hooks

All async operations are wrapped in typed React Query hooks. Components use these directly.

### useSheet.ts

```typescript
// Queries
useSheetByDate(storeId, date)           // Fetch by specific date
useTodaySheet(storeId, templateId)      // Auto-create today's sheet
useSheetHistory(storeId, start, end)    // History for date range

// Mutations
useSaveSheetEntry()                     // Save one entry
useBatchSaveEntries()                   // Batch save entries
useLockSheet()                          // Lock sheet (manager)
useUnlockSheet()                        // Unlock sheet (manager)
useArchiveSheet()                       // Archive sheet
useRestoreSheet()                       // Restore sheet
```

### useProducts.ts

```typescript
// Queries
useProducts(storeId)                    // All active products
useProduct(productId)                   // Single product
useLowStockProducts(storeId)            // Below threshold

// Mutations
useCreateProduct()                      // Create (manager)
useUpdateProduct()                      // Update (manager)
useArchiveProduct()                     // Archive (manager)
useRestoreProduct()                     // Restore (manager)
```

### useStores.ts

```typescript
// Queries
useMyStores()                           // All stores user belongs to
useStore(storeId)                       // Single store
useUserRoleInStore(storeId, userId)     // User's role
useStoreMembers(storeId)                // All members

// Mutations
useAddStoreMember()                     // Add member (manager)
useUpdateStoreMemberRole()              // Change role (manager)
useRemoveStoreMember()                  // Remove member (manager)
```

### useAnalyseSheet.ts

```typescript
// Mutation
useAnalyseSheet()                       // Call edge function to analyse image
```

### useRealtime.ts

```typescript
// Subscriptions
useSheetRealtime(sheetId, storeId)      // Live entry updates
useProductsRealtime(storeId)            // Live product changes
useStoreMembersRealtime(storeId)        // Live member changes
```

## Hook Usage Pattern

Every hook returns React Query's standard object:

```typescript
// Query hook
const { data, isLoading, error } = useSheet(storeId, date)

if (isLoading) return <LoadingSpinner />
if (error) return <ErrorMessage error={error} />

// Render data...

// Mutation hook
const { mutate, isPending, error } = useSaveEntry()

const handleSave = () => {
  mutate({ sheet_id, product_id, column_id, value })
}
```

## Query Key Convention

All query keys follow a hierarchical pattern for proper invalidation:

```typescript
['sheet', storeId, date]                    // Single sheet by date
['sheet', storeId, 'today']                 // Today's sheet
['sheets', 'history', storeId, start, end]  // Sheet history
['sheet']                                   // Invalidate all sheets

['products', storeId]                       // All products for store
['product', productId]                      // Single product
['products']                                // Invalidate all products

['stores', 'my']                            // My stores
['store', storeId]                          // Single store
['store', storeId, 'members']               // Store members
```

## Cache Times

- **Sheets**: 1 minute (stale)
- **Products**: 5 minutes (stale)
- **Stores**: 5 minutes (stale)
- **Analysis**: No cache (one-time mutation)

All queries retry 3 times on failure automatically.

## Error Handling

- **API helpers**: Throw typed `Error` objects
- **React Query**: Exposes `error` state in every hook
- **Components**: Use `error` prop to display generic message
- **Console**: Full errors logged server-side, generic messages to client

```typescript
const { error } = useSheet(storeId, date)

// Display generic message, never the raw error
if (error) return <ErrorMessage message="Failed to load sheet. Please try again." />
```

## Real-time Updates

Subscribe to live changes for multi-user scenarios:

```typescript
// Use in a sheet screen
useSheetRealtime(sheetId, storeId)      // Auto-invalidates when entries change

// Components watching the sheet query will refetch automatically
```

## Typed Responses

All responses are fully typed via `Database` type from `src/types/supabase.ts`:

```typescript
type SheetRow = Database['public']['Tables']['stock_sheets']['Row']
type ProductInsert = Database['public']['Tables']['products']['Insert']
```

## File Structure

```
src/
├── lib/
│   ├── auth/
│   │   └── client.ts          ← Supabase singleton
│   └── api/
│       ├── ai.ts              ← Edge function calls
│       ├── sheets.ts          ← Sheet queries
│       ├── products.ts        ← Product queries
│       ├── stores.ts          ← Store queries
│       └── index.ts           ← Barrel export
└── hooks/
    ├── useSheet.ts            ← Sheet queries/mutations
    ├── useProducts.ts         ← Product queries/mutations
    ├── useStores.ts           ← Store queries/mutations
    ├── useAnalyseSheet.ts     ← AI analysis mutation
    ├── useRealtime.ts         ← Real-time subscriptions
    └── index.ts               ← Barrel export
```

## Best Practices

- ✅ Use hooks in components, never API helpers directly
- ✅ All mutation invalidations use specific query keys
- ✅ Real-time subscriptions for collaborative features
- ✅ Type all responses with `Database` types
- ✅ Let React Query handle retry and loading states
- ✅ Log errors to console, return generic messages to UI
- ✅ Use `enabled` prop to conditionally run queries
- ✅ Validate inputs in API helpers, not components

## Example: Complete Sheet Screen

```typescript
import { useSheetByDate, useSaveSheetEntry, useSheetRealtime } from '@/hooks'
import { useAuth } from '@/context/AuthContext'

export function SheetScreen({ date }: Props) {
  const { storeId, userId } = useAuth()
  
  // Fetch sheet
  const { data: sheet, isLoading, error } = useSheetByDate(storeId, date)
  
  // Setup real-time updates
  useSheetRealtime(sheet?.id ?? null, storeId)
  
  // Save mutation
  const { mutate: saveEntry } = useSaveSheetEntry()
  
  if (isLoading) return <Spinner />
  if (error) return <Error message="Failed to load sheet" />
  
  const handleCellChange = (entry: SheetEntryInsert) => {
    saveEntry(entry)
  }
  
  return (
    <SheetView
      sheet={sheet!}
      onCellChange={handleCellChange}
    />
  )
}
```

## Requirements Satisfied

- ✅ NFR-REL-04: Retry logic (3 attempts automatic)
- ✅ NFR-OBS-01: Generic error messages to UI
- ✅ NFR-OBS-02: Full logging server-side
- ✅ FR-SHEET-01 to 05: Complete sheet CRUD via queries
- ✅ FR-SYNC-01: Real-time updates via Realtime subscriptions
- ✅ FR-COLLAB-01: Live collaboration through invalidation
