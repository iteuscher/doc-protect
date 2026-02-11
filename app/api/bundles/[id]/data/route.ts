import { NextRequest, NextResponse } from 'next/server';
import { demoBundleStore } from '@/lib/demo/bundle-store';

export const runtime = 'nodejs';

/**
 * Serves the raw encrypted bundle bytes from the in-memory demo store.
 * This endpoint is only used when Supabase is not configured (demo mode).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const bundle = demoBundleStore.get(params.id);

  if (!bundle) {
    return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
  }

  return new NextResponse(bundle.data.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': bundle.mime_type || 'application/zip',
      'Content-Disposition': `attachment; filename="${bundle.file_name}"`,
      'Content-Length': String(bundle.data.length),
    },
  });
}
