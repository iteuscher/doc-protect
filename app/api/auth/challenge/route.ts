import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const challenge = bufferToBase64Url(challengeBytes);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  return NextResponse.json({
    challenge,
    expiresAt
  });
}

function bufferToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

