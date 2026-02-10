/**
 * In-memory bundle store used when Supabase is not configured.
 *
 * This allows the full link-sharing and cloud-storage UX to be experienced
 * without any external services. Data is held in process memory and cleared
 * when the dev server restarts.
 */

export interface DemoBundle {
  id: string;
  owner_identity: string;
  file_name: string;
  mime_type: string;
  encrypted_size: number;
  manifest: unknown;
  storage_key: string;
  created_at: string;
  downloads: number;
  /** Raw bytes of the encrypted .rico bundle */
  data: Buffer;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

/**
 * Singleton Map stored on `globalThis` so that Next.js hot-module reloads
 * in development don't wipe accumulated demo bundles.
 */
if (!g.__ricoDemoBundles) {
  g.__ricoDemoBundles = new Map<string, DemoBundle>();
}

export const demoBundleStore: Map<string, DemoBundle> = g.__ricoDemoBundles;
