// Document vault storage abstraction. The MVP ships a local-disk adapter;
// staging/production use an S3-compatible adapter behind the same interface.
// Documents are NEVER publicly reachable — access always flows through
// permission-checked API routes.

export interface StoredObject {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const DOCUMENT_TYPES = [
  'WDA', 'GDP_CERTIFICATE', 'GMP_CERTIFICATE', 'MARKETING_AUTHORIZATION',
  'IMPORT_LICENSE', 'PRODUCT_REGISTRATION', 'BATCH_RELEASE_CERTIFICATE',
  'CERTIFICATE_OF_ANALYSIS', 'PROOF_OF_OWNERSHIP', 'COMMERCIAL_INVOICE',
  'PACKING_LIST', 'CERTIFICATE_OF_ORIGIN', 'AIR_WAYBILL', 'TEMPERATURE_RECORD',
  'INSURANCE', 'CUSTOMS_DOCUMENT', 'IMPORT_PERMIT', 'PROOF_OF_DELIVERY', 'OTHER',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
