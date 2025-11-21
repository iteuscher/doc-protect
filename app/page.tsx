'use client';

/**
 * DocProtect Workspace UI
 *
 * Provides a single upload surface that automatically drives encryption or
 * decryption depending on the selected file. The UI intentionally keeps the
 * flow linear: upload/drag a file → authenticate with WebAuthn →
 * encrypt/decrypt and download the result.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type { PRFSupport, WebAuthnCredential, FallbackCredential } from '@/lib/types/credential';
import type { DocProtectBundle } from '@/lib/types/bundle';
import { detectPRFSupport } from '@/lib/auth/prf-detection';
import {
  createCredential,
  listUserCredentials
} from '@/lib/auth/webauthn';
import { encryptFile, decryptFile } from '@/lib/crypto/encryption';
import { parseBundle } from '@/lib/crypto/bundle';
import { resetAllData } from '@/lib/storage/reset';

interface WorkflowResult {
  kind: 'encrypted' | 'decrypted';
  fileName: string;
  url: string;
}

export default function Home() {
  const [prfSupport, setPrfSupport] = useState<PRFSupport | null>(null);
  const [credentials, setCredentials] = useState<Array<WebAuthnCredential | FallbackCredential>>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('Ready');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creatingCredential, setCreatingCredential] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [support, stored] = await Promise.all([
          detectPRFSupport(),
          listUserCredentials()
        ]);
        setPrfSupport(support);
        setCredentials(stored);
        if (stored.length && !selectedCredentialId) {
          setSelectedCredentialId(stored[0].credentialId);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to initialize DocProtect';
        setErrorMessage(message);
      }
    }

    bootstrap();
  }, [selectedCredentialId]);

  useEffect(() => {
    return () => {
      if (result?.url) {
        URL.revokeObjectURL(result.url);
      }
    };
  }, [result]);

  const selectedCredential = useMemo(
    () =>
      credentials.find((cred) => cred.credentialId === selectedCredentialId) ??
      null,
    [credentials, selectedCredentialId]
  );

  const runEncryptionWorkflow = useCallback(
    async (file: File) => {
      if (!selectedCredential) {
        throw new Error('Select a credential before encrypting.');
      }

      setStatusMessage('Authenticating with passkey to encrypt …');
      const bundle = await encryptFile({
        file,
        ownerCredential: selectedCredential
      });

      const downloadUrl = URL.createObjectURL(bundle.blob);
      setResult({
        kind: 'encrypted',
        fileName: `${file.name}.dpf`,
        url: downloadUrl
      });
      setStatusMessage('File encrypted successfully. Download ready.');
    },
    [selectedCredential]
  );

  const runDecryptionWorkflow = useCallback(
    async (file: File) => {
      if (!selectedCredential) {
        throw new Error('Select a credential to decrypt the bundle.');
      }

      setStatusMessage('Parsing bundle manifest …');
      const parsed = await parseBundle(file);
      const bundle: DocProtectBundle = {
        bundleId: parsed.bundleId || crypto.randomUUID(),
        blob: file,
        manifest: parsed.manifest,
        createdAt: new Date()
      };

      setStatusMessage('Authenticating with WebAuthn to decrypt …');
      const decrypted = await decryptFile({
        bundle,
        credential: selectedCredential
      });

      // Convert Uint8Array to Blob
      const blob = new Blob([decrypted.data as BlobPart], { type: decrypted.mimeType });
      const downloadUrl = URL.createObjectURL(blob);
      setResult({
        kind: 'decrypted',
        fileName: decrypted.fileName,
        url: downloadUrl
      });
      setStatusMessage('File decrypted. Download ready.');
    },
    [selectedCredential]
  );

  const handleFileInput = useCallback(
    async (file?: File) => {
      if (!file) return;

      if (result?.url) {
        URL.revokeObjectURL(result.url);
        setResult(null);
      }

      setIsProcessing(true);
      setStatusMessage('Preparing file …');
      setErrorMessage(null);

      try {
        if (isDocProtectBundle(file)) {
          await runDecryptionWorkflow(file);
        } else {
          await runEncryptionWorkflow(file);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unexpected DocProtect error';
        console.error('DocProtect error:', error);
        setErrorMessage(message);
        setStatusMessage('Error occurred. See details below.');
      } finally {
        setIsProcessing(false);
      }
    },
    [runEncryptionWorkflow, runDecryptionWorkflow, result?.url]
  );

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    handleFileInput(file);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    handleFileInput(file);
  };

  const handleCreateCredential = async () => {
    setCreatingCredential(true);
    setErrorMessage(null);
    try {
      const credential = await createCredential({
        userId: 'user@example.com',
        userName: 'DocProtect User',
        keyName: `DocProtect Key ${credentials.length + 1}`
      });
      const updated = await listUserCredentials();
      setCredentials(updated);
      setSelectedCredentialId(credential.credentialId);
      setStatusMessage('Credential created and stored locally.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create credential';
      setErrorMessage(message);
    } finally {
      setCreatingCredential(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset all DocProtect data? This will delete all credentials and bundles. This cannot be undone.')) {
      return;
    }

    setResetting(true);
    setErrorMessage(null);
    try {
      await resetAllData();
      setCredentials([]);
      setSelectedCredentialId('');
      setResult(null);
      setStatusMessage('All data reset. Page will reload...');
      
      // Reload page after a short delay to clear any cached state
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reset data';
      setErrorMessage(message);
      setStatusMessage('Reset failed');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-slate-400">DocProtect</p>
          <h1 className="text-3xl font-semibold text-white">
            Encrypt or decrypt with a single drop area
          </h1>
          <p className="text-slate-300">
            Upload any document. DocProtect will determine whether to encrypt or decrypt, then
            guide you through WebAuthn authentication.
          </p>
          {prfSupport && (
            <p className="text-sm text-slate-400">
              {prfSupport.supported
                ? '✅ WebAuthn PRF supported on this device.'
                : '⚠️ PRF not available. Fallback mode will be used for new credentials.'}
            </p>
          )}
        </header>

        <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 shadow-lg">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-200">Stored credentials</p>
                <p className="text-xs text-slate-400">
                  Keys live only in this browser via IndexedDB. Export them manually for backup.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateCredential}
                  disabled={creatingCredential}
                  className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {creatingCredential ? 'Creating …' : 'Create Credential'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={resetting}
                  className="rounded-full bg-red-500/20 border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
                  title="Reset all stored data (credentials, bundles, PRF cache)"
                >
                  {resetting ? 'Resetting …' : 'Reset All'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {credentials.length === 0 && (
                <p className="text-sm text-slate-400">
                  No credentials stored yet. Create one to get started.
                </p>
              )}
              {credentials.map((credential) => (
                <label
                  key={credential.credentialId}
                  className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100"
                >
                  <input
                    type="radio"
                    name="credential"
                    value={credential.credentialId}
                    checked={selectedCredentialId === credential.credentialId}
                    onChange={() => setSelectedCredentialId(credential.credentialId)}
                  />
                  <span>
                    {credential.keyName}{' '}
                    <span className="text-xs text-slate-400">
                      ({credential.type === 'fallback-pbkdf2' ? 'Fallback' : 'PRF'})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-emerald-400/40 bg-slate-900/30 p-6 text-center">
          <label
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            className="flex min-h-[220px] flex-col items-center justify-center gap-4"
          >
            <p className="text-lg font-medium text-white">Drag & drop or click to select a file</p>
            <p className="text-sm text-slate-400">
              DocProtect auto-detects `.dpf` bundles for decryption. Other files will be encrypted.
            </p>
            <div className="rounded-full bg-emerald-500/10 px-4 py-1 text-xs uppercase tracking-widest text-emerald-200">
              {isProcessing ? 'Working…' : 'Waiting for file'}
            </div>
            <input type="file" className="hidden" onChange={handleFileChange} />
          </label>
        </section>

        <section className="space-y-3 rounded-2xl border border-white/5 bg-slate-900/50 p-6">
          <p className="text-sm font-semibold text-slate-200">Status</p>
          <p className="text-sm text-slate-300">{statusMessage}</p>
          {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
          {result && (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">
                  {result.kind === 'encrypted' ? 'Encrypted bundle ready' : 'Decrypted file ready'}
                </p>
                <p className="text-xs text-slate-400 break-all">{result.fileName}</p>
              </div>
              <a
                href={result.url}
                download={result.fileName}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                Download
              </a>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function isDocProtectBundle(file: File): boolean {
  return file.name.toLowerCase().endsWith('.dpf') || file.type === 'application/zip';
}
