import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const SUPABASE_BUNDLE_BUCKET = process.env.SUPABASE_BUNDLE_BUCKET ?? 'bundles';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseClient();
    const params = await context.params;

    const { data, error } = await supabase
      .from('bundles')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Bundle not found' }, { status: 404 });
    }

    const signedUrl = await createSignedDownloadUrl(supabase, data.storage_key);
    await supabase.from('bundle_access_logs').insert({
      bundle_id: params.id,
      event: 'download',
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    });

    return NextResponse.json({
      bundle: {
        id: data.id,
        owner_identity: data.owner_identity,
        file_name: data.file_name,
        mime_type: data.mime_type,
        encrypted_size: data.encrypted_size,
        created_at: data.created_at,
        manifest: data.manifest
      },
      downloadUrl: signedUrl
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are not configured');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

async function createSignedDownloadUrl(
  supabase: ReturnType<typeof getSupabaseClient>,
  storageKey: string
) {
  const { data, error } = await supabase.storage
    .from(SUPABASE_BUNDLE_BUCKET)
    .createSignedUrl(storageKey, 60);

  if (error) {
    throw new Error(error.message);
  }

  return data?.signedUrl ?? null;
}

