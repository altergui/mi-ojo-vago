// Minimal ambient declaration for the one Workers runtime API this worker uses,
// so the worker stays free of the @cloudflare/workers-types dependency.
interface KVNamespacePutOptions {
  expirationTtl?: number;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
}
