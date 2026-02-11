import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { demoBundleStore } from '@/lib/demo/bundle-store';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const SUPABASE_BUNDLE_BUCKET = process.env.SUPABASE_BUNDLE_BUCKET ?? 'bundles';
const HOURLY_UPLOAD_LIMIT = 10;

const isDemoMode = !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY;

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const ownerIdentity = url.searchParams.get('ownerIdentity');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 50);

    if (isDemoMode) {
      let bundles = Array.from(demoBundleStore.values())
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
        .map(({ data: _data, ...rest }) => rest); // strip binary blob

      if (ownerIdentity) {
        bundles = bundles.filter(b => b.owner_identity === ownerIdentity);
      }

      return NextResponse.json({ bundles, demo: true });
    }

    const supabase = getSupabaseClient();
    let query = supabase
      .from('bundles')
      .select('id, owner_identity, file_name, mime_type, encrypted_size, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (ownerIdentity) {
      query = query.eq('owner_identity', ownerIdentity);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bundles: data ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Multipart form data is required.' },
        { status: 415 }
      );
    }

    const formData = await request.formData();
    const bundleFile = formData.get('bundle') as File | null;
    const ownerIdentity = formData.get('ownerIdentity')?.toString();
    const manifestRaw = formData.get('manifest')?.toString();

    if (!bundleFile || !ownerIdentity || !manifestRaw) {
      return NextResponse.json(
        { error: 'bundle, manifest, and ownerIdentity are required.' },
        { status: 400 }
      );
    }

    const manifest = JSON.parse(manifestRaw);

    if (isDemoMode) {
      // Simulate a brief processing delay so the UI feels realistic
      await new Promise(resolve => setTimeout(resolve, 600));

      const id = crypto.randomUUID();
      const buffer = Buffer.from(await bundleFile.arrayBuffer());
      const objectKey = `demo/${ownerIdentity}/${id}.rico`;

      demoBundleStore.set(id, {
        id,
        owner_identity: ownerIdentity,
        file_name: bundleFile.name,
        mime_type: bundleFile.type || 'application/zip',
        encrypted_size: bundleFile.size,
        manifest,
        storage_key: objectKey,
        created_at: new Date().toISOString(),
        downloads: 0,
        data: buffer,
      });

      return NextResponse.json({ bundle: { id, owner_identity: ownerIdentity, file_name: bundleFile.name, mime_type: bundleFile.type || 'application/zip', encrypted_size: bundleFile.size, manifest, storage_key: objectKey, created_at: new Date().toISOString(), downloads: 0 }, demo: true }, { status: 201 });
    }

    const supabase = getSupabaseClient();
    await enforceRateLimit(supabase, ownerIdentity);

    const buffer = Buffer.from(await bundleFile.arrayBuffer());
    const objectKey = `bundles/${ownerIdentity}/${crypto.randomUUID()}.rico`;
    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUNDLE_BUCKET)
      .upload(objectKey, buffer, {
        contentType: bundleFile.type || 'application/zip',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data, error: insertError } = await supabase
      .from('bundles')
      .insert({
        owner_identity: ownerIdentity,
        file_name: bundleFile.name,
        mime_type: bundleFile.type || 'application/zip',
        encrypted_size: bundleFile.size,
        manifest,
        storage_key: objectKey
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ bundle: data }, { status: 201 });
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

async function enforceRateLimit(supabase: ReturnType<typeof getSupabaseClient>, owner: string) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('bundles')
    .select('*', { count: 'exact', head: true })
    .eq('owner_identity', owner)
    .gte('created_at', oneHourAgo);

  if (error) {
    throw new Error(error.message);
  }

  if ((count ?? 0) >= HOURLY_UPLOAD_LIMIT) {
    throw new Error('Upload limit reached for this hour. Please try again later.');
  }
}
