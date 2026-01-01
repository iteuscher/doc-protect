'use client';

/**
 * DocProtect Guided Workflow UI
 *
 * Step-by-step workflow for encrypting and decrypting files:
 * 1. File Upload
 * 2. Verify Identity (encrypt or decrypt)
 * 3. Recipients (encryption only)
 * 4. Sharing (encryption only)
 * 5. Edit Bundle (post-encryption)
 * 6. Detailed Info (expandable)
 */

import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type { PRFSupport, WebAuthnCredential, FallbackCredential } from '@/lib/types/credential';
import type { DocProtectBundle } from '@/lib/types/bundle';
import { getCachedPRFSupport, getPlatformPRFInfo } from '@/lib/auth/prf-detection';
import {
  createCredential,
  listUserCredentials
} from '@/lib/auth/webauthn';
import { encryptFile, decryptFile } from '@/lib/crypto/encryption';
import { parseBundle } from '@/lib/crypto/bundle';
import { resetAllData } from '@/lib/storage/reset';

// Workflow steps
type WorkflowStep =
  | 'file-upload'           // Section 1
  | 'verify-identity'       // Section 2
  | 'recipients'            // Section 3 (encryption only)
  | 'sharing'               // Section 4 (encryption only)
  | 'edit-bundle'           // Section 5 (post-encryption)
  | 'complete';             // Done

type FileType = 'standard' | 'dpf' | null;
type CredentialMode = 'create' | 'select-stored' | 'select-external' | null;
type SharingMode = 'download' | 'cloud' | 'link' | null;

interface WorkflowState {
  step: WorkflowStep;
  uploadedFile: File | null;
  fileType: FileType;
  selectedCredential: WebAuthnCredential | FallbackCredential | null;
  credentialMode: CredentialMode;
  customCredentialName: string;
  recipients: string[];
  sharingMode: SharingMode;
  encryptedBundle: DocProtectBundle | null;
  decryptedData: { fileName: string; url: string } | null;
}

export default function Home() {
  // PRF and credentials
  const [prfSupport, setPrfSupport] = useState<PRFSupport | null>(null);
  const [credentials, setCredentials] = useState<Array<WebAuthnCredential | FallbackCredential>>([]);

  // Workflow state
  const [workflow, setWorkflow] = useState<WorkflowState>({
    step: 'file-upload',
    uploadedFile: null,
    fileType: null,
    selectedCredential: null,
    credentialMode: null,
    customCredentialName: '',
    recipients: [],
    sharingMode: null,
    encryptedBundle: null,
    decryptedData: null
  });

  // UI state
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Ready to upload a file');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDetailedInfo, setShowDetailedInfo] = useState(false);

  // Bootstrap
  useEffect(() => {
    async function bootstrap() {
      try {
        const cachedSupport = getCachedPRFSupport();
        const platformInfo = getPlatformPRFInfo();

        setPrfSupport(cachedSupport ?? {
          supported: platformInfo.likelySupported,
          fallbackRequired: !platformInfo.likelySupported,
          platform: platformInfo.platform,
          detectedAt: new Date().toISOString()
        });

        const stored = await listUserCredentials();
        setCredentials(stored);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to initialize DocProtect';
        setErrorMessage(message);
      }
    }

    bootstrap();
  }, []);

  // Cleanup URLs
  useEffect(() => {
    return () => {
      if (workflow.decryptedData?.url) {
        URL.revokeObjectURL(workflow.decryptedData.url);
      }
    };
  }, [workflow.decryptedData]);

  // ===== SECTION 1: FILE UPLOAD =====
  const handleFileUpload = useCallback((file: File) => {
    const isDPF = file.name.toLowerCase().endsWith('.dpf') || file.type === 'application/zip';

    setWorkflow(prev => ({
      ...prev,
      step: 'verify-identity',
      uploadedFile: file,
      fileType: isDPF ? 'dpf' : 'standard',
      customCredentialName: file.name.replace(/\.(dpf|pdf|docx?|txt|png|jpe?g)$/i, '')
    }));

    setStatusMessage(
      isDPF
        ? 'DPF file detected. Ready to decrypt.'
        : 'Standard file detected. Ready to encrypt.'
    );
    setErrorMessage(null);
  }, []);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) handleFileUpload(file);
  };

  // ===== SECTION 2: VERIFY IDENTITY =====
  const handleCreateCredential = async () => {
    if (!workflow.customCredentialName.trim()) {
      setErrorMessage('Please enter a credential name');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const credential = await createCredential({
        keyName: workflow.customCredentialName.trim()
      });

      const updated = await listUserCredentials();
      setCredentials(updated);

      setWorkflow(prev => ({
        ...prev,
        selectedCredential: credential,
        credentialMode: 'create'
      }));

      setStatusMessage(`Credential "${workflow.customCredentialName}" created successfully.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create credential';
      setErrorMessage(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectCredential = (credential: WebAuthnCredential | FallbackCredential) => {
    setWorkflow(prev => ({
      ...prev,
      selectedCredential: credential,
      credentialMode: 'select-stored'
    }));
    setStatusMessage('Credential selected');
  };

  const handleUseExternalCredential = () => {
    setWorkflow(prev => ({
      ...prev,
      selectedCredential: null,
      credentialMode: 'select-external'
    }));
    setStatusMessage('Will use credential from password manager during decryption');
  };

  const handleProceedToEncryption = async () => {
    if (!workflow.uploadedFile) {
      setErrorMessage('No file uploaded');
      return;
    }

    if (!workflow.selectedCredential && workflow.credentialMode !== 'select-external') {
      setErrorMessage('Please create or select a credential first');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Encrypting file...');

    try {
      let credential = workflow.selectedCredential;

      // If using external credential mode, create credential on-the-fly
      if (workflow.credentialMode === 'select-external' && !credential) {
        const credName = workflow.customCredentialName.trim() || workflow.uploadedFile.name;
        credential = await createCredential({
          keyName: credName
        });
        // Optionally update the credentials list
        const updated = await listUserCredentials();
        setCredentials(updated);
      }

      if (!credential) {
        throw new Error('Failed to obtain credential for encryption');
      }

      const bundle = await encryptFile({
        file: workflow.uploadedFile,
        ownerCredential: credential
      });

      setWorkflow(prev => ({
        ...prev,
        step: 'recipients',
        encryptedBundle: bundle
      }));

      setStatusMessage('File encrypted. Add recipients or proceed to sharing.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Encryption failed';
      setErrorMessage(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProceedToDecryption = async () => {
    if (!workflow.uploadedFile) {
      setErrorMessage('No file uploaded');
      return;
    }

    if (!workflow.selectedCredential && workflow.credentialMode !== 'select-external') {
      setErrorMessage('Please select a credential or choose to use password manager');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Parsing bundle and decrypting...');

    try {
      const parsed = await parseBundle(workflow.uploadedFile);
      const bundle: DocProtectBundle = {
        bundleId: parsed.bundleId || crypto.randomUUID(),
        blob: workflow.uploadedFile,
        manifest: parsed.manifest,
        createdAt: new Date()
      };

      const decrypted = await decryptFile({
        bundle,
        credential: workflow.credentialMode === 'select-external' ? undefined : (workflow.selectedCredential || undefined)
      });

      const blob = new Blob([decrypted.data as BlobPart], { type: decrypted.mimeType });
      const downloadUrl = URL.createObjectURL(blob);

      setWorkflow(prev => ({
        ...prev,
        step: 'complete',
        decryptedData: {
          fileName: decrypted.fileName,
          url: downloadUrl
        }
      }));

      setStatusMessage('File decrypted successfully!');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Decryption failed';
      setErrorMessage(message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ===== SECTION 3: RECIPIENTS =====
  const [recipientEmail, setRecipientEmail] = useState('');

  const handleAddRecipient = () => {
    const email = recipientEmail.trim();
    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    if (workflow.recipients.includes(email)) {
      setErrorMessage('This recipient has already been added');
      return;
    }

    setWorkflow(prev => ({
      ...prev,
      recipients: [...prev.recipients, email]
    }));

    setRecipientEmail('');
    setErrorMessage(null);
    setStatusMessage(`Added ${email} as recipient`);
  };

  const handleRemoveRecipient = (email: string) => {
    setWorkflow(prev => ({
      ...prev,
      recipients: prev.recipients.filter(e => e !== email)
    }));
    setStatusMessage(`Removed ${email}`);
  };

  const handleProceedToSharing = () => {
    setWorkflow(prev => ({ ...prev, step: 'sharing' }));
    setStatusMessage('Choose how to share the encrypted file');
  };

  const handleSkipRecipients = () => {
    setWorkflow(prev => ({ ...prev, step: 'sharing' }));
    setStatusMessage('No additional recipients. Choose sharing method.');
  };

  // ===== SECTION 4: SHARING =====
  const handleDownloadBundle = () => {
    if (!workflow.encryptedBundle) return;

    const url = URL.createObjectURL(workflow.encryptedBundle.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.uploadedFile?.name || 'file'}.dpf`;
    a.click();
    URL.revokeObjectURL(url);

    setWorkflow(prev => ({
      ...prev,
      step: 'complete',
      sharingMode: 'download'
    }));

    setStatusMessage('DPF file Created Successfully!');
  };

  const handleLinkSharing = () => {
    setWorkflow(prev => ({
      ...prev,
      sharingMode: 'link'
    }));
    setStatusMessage('Link sharing (Supabase/S3) - Coming soon!');
  };

  const handleCloudStorage = () => {
    setWorkflow(prev => ({
      ...prev,
      sharingMode: 'cloud'
    }));
    setStatusMessage('Cloud storage (Google Drive) - Coming soon!');
  };

  // ===== SECTION 5: EDIT BUNDLE =====
  const handleStartOver = () => {
    if (workflow.decryptedData?.url) {
      URL.revokeObjectURL(workflow.decryptedData.url);
    }

    setWorkflow({
      step: 'file-upload',
      uploadedFile: null,
      fileType: null,
      selectedCredential: null,
      credentialMode: null,
      customCredentialName: '',
      recipients: [],
      sharingMode: null,
      encryptedBundle: null,
      decryptedData: null
    });

    setStatusMessage('Ready to upload a file');
    setErrorMessage(null);
  };

  // ===== RESET =====
  const handleReset = async () => {
    if (!confirm('Reset all DocProtect data? This will delete all credentials and bundles. This cannot be undone.')) {
      return;
    }

    try {
      await resetAllData();
      setCredentials([]);
      handleStartOver();
      setStatusMessage('All data reset. Page will reload...');
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reset data';
      setErrorMessage(message);
    }
  };

  // ===== RENDER =====
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-400">DocProtect</p>
              <h1 className="text-3xl font-semibold text-white">
                Passwordless Document Encryption
              </h1>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/30"
              title="Reset all stored data"
            >
              Reset All
            </button>
          </div>
          {prfSupport && !prfSupport.supported && (
            <p className="text-sm text-amber-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              PRF not available. Fallback mode will be used.
            </p>
          )}
        </header>

        {/* Progress Indicator - Sticky */}
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm py-3 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 border-b border-white/5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
          <StepIndicator current={workflow.step} label="Upload" step="file-upload" />
          <div className="h-px flex-1 bg-slate-700" />
          <StepIndicator current={workflow.step} label="Identity" step="verify-identity" />
          {workflow.fileType === 'standard' && (
            <>
              <div className="h-px flex-1 bg-slate-700" />
              <StepIndicator current={workflow.step} label="Recipients" step="recipients" />
              <div className="h-px flex-1 bg-slate-700" />
              <StepIndicator current={workflow.step} label="Share" step="sharing" />
            </>
          )}
          <div className="h-px flex-1 bg-slate-700" />
          <StepIndicator current={workflow.step} label="Done" step="complete" />
          </div>
        </div>

        {/* Status Message */}
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-sm font-medium text-slate-200">Status</p>
          <p className="text-sm text-slate-300 mt-1">{statusMessage}</p>
          {errorMessage && (
            <p className="text-sm text-red-400 mt-2 border-t border-red-500/20 pt-2">{errorMessage}</p>
          )}
        </div>

        {/* FILE UPLOAD */}
        {workflow.step === 'file-upload' && (
          <section className="rounded-2xl border border-dashed border-emerald-400/40 bg-slate-900/30 p-8 text-center">
            <label
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex min-h-[280px] flex-col items-center justify-center gap-4 cursor-pointer"
            >
              <div className="rounded-full bg-emerald-500/10 p-4">
                <svg className="w-12 h-12 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-medium text-white mb-2">Upload a File</p>
                <p className="text-sm text-slate-400">
                  Drag & drop or click anywhere to select a file to encrypt or decrypt
                </p>
              </div>
              <div className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400">
                Choose File
              </div>
              <p className="text-xs text-slate-500">
                .dpf files will be decrypted • Other files will be encrypted
              </p>
              <input type="file" className="hidden" onChange={handleFileChange} />
            </label>
          </section>
        )}

        {/* SECTION 2: VERIFY IDENTITY */}
        {workflow.step === 'verify-identity' && workflow.uploadedFile && (
          <section className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Verify Your Identity
              </h2>

              {/* File Info */}
              <div className="mb-6 rounded-lg bg-slate-800/50 p-4 border border-white/5">
                <p className="text-sm font-medium text-slate-200 mb-1">Uploaded File:</p>
                <p className="text-sm text-slate-300">{workflow.uploadedFile.name}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {workflow.fileType === 'dpf'
                    ? '🔒 This is an encrypted DPF file (will be decrypted)'
                    : '📄 This is a standard file (will be encrypted)'}
                </p>
              </div>

              {/* ENCRYPTION PATH */}
              {workflow.fileType === 'standard' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300">
                    Choose how to create the encryption key for this file:
                  </p>

                  {/* Create New Credential */}
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <p className="text-sm font-medium text-emerald-200 mb-3">
                      Create New Credential (Recommended)
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={workflow.customCredentialName}
                        onChange={(e) => setWorkflow(prev => ({ ...prev, customCredentialName: e.target.value }))}
                        placeholder="Credential name"
                        className="flex-1 rounded-lg bg-slate-800/50 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCreateCredential}
                        disabled={isProcessing || !workflow.customCredentialName.trim()}
                        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {isProcessing ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Creates a new passkey with this name (saved to your password manager)
                    </p>
                  </div>

                  {/* Select Existing Credential */}
                  {credentials.length > 0 && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                      <p className="text-sm font-medium text-blue-200 mb-3">
                        Use Existing Credential
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {credentials.map((cred) => (
                          <button
                            key={cred.credentialId}
                            onClick={() => handleSelectCredential(cred)}
                            className={`rounded-lg border px-3 py-2 text-sm transition ${
                              workflow.selectedCredential?.credentialId === cred.credentialId
                                ? 'border-blue-400 bg-blue-500/20 text-blue-200'
                                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {cred.keyName}{' '}
                            <span className="text-xs opacity-70">
                              ({cred.type === 'fallback-pbkdf2' ? 'Fallback' : 'PRF'})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* External Credential - Encryption */}
                  <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                    <p className="text-sm font-medium text-purple-200 mb-3">
                      Use Password Manager
                    </p>
                    <button
                      onClick={handleUseExternalCredential}
                      className={`w-full rounded-lg border px-4 py-2 text-sm transition ${
                        workflow.credentialMode === 'select-external'
                          ? 'border-purple-400 bg-purple-500/20 text-purple-200'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      Select from Google, iCloud, Bitwarden, 1Password, etc.
                    </button>
                    <p className="text-xs text-slate-400 mt-2">
                      Use an existing passkey from your password manager
                    </p>
                  </div>

                  {/* Proceed Button */}
                  {(workflow.selectedCredential || workflow.credentialMode === 'select-external') && (
                    <button
                      onClick={handleProceedToEncryption}
                      disabled={isProcessing}
                      className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {isProcessing ? 'Encrypting...' : 'Encrypt File →'}
                    </button>
                  )}
                </div>
              )}

              {/* DECRYPTION PATH */}
              {workflow.fileType === 'dpf' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300">
                    Select the credential used to encrypt this file:
                  </p>

                  {/* Stored Credentials */}
                  {credentials.length > 0 && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                      <p className="text-sm font-medium text-blue-200 mb-3">
                        Use Stored Credential
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {credentials.map((cred) => (
                          <button
                            key={cred.credentialId}
                            onClick={() => handleSelectCredential(cred)}
                            className={`rounded-lg border px-3 py-2 text-sm transition ${
                              workflow.selectedCredential?.credentialId === cred.credentialId
                                ? 'border-blue-400 bg-blue-500/20 text-blue-200'
                                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {cred.keyName}{' '}
                            <span className="text-xs opacity-70">
                              ({cred.type === 'fallback-pbkdf2' ? 'Fallback' : 'PRF'})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* External Credential */}
                  <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                    <p className="text-sm font-medium text-purple-200 mb-3">
                      Use Password Manager
                    </p>
                    <button
                      onClick={handleUseExternalCredential}
                      className={`w-full rounded-lg border px-4 py-2 text-sm transition ${
                        workflow.credentialMode === 'select-external'
                          ? 'border-purple-400 bg-purple-500/20 text-purple-200'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      Select from Google, iCloud, Bitwarden, 1Password, etc.
                    </button>
                    <p className="text-xs text-slate-400 mt-2">
                      The credential doesn&apos;t need to be stored in this browser
                    </p>
                  </div>

                  {/* Proceed Button */}
                  {(workflow.selectedCredential || workflow.credentialMode === 'select-external') && (
                    <button
                      onClick={handleProceedToDecryption}
                      disabled={isProcessing}
                      className="w-full rounded-lg bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50"
                    >
                      {isProcessing ? 'Decrypting...' : 'Decrypt File →'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Back Button */}
            <button
              onClick={handleStartOver}
              className="text-sm text-slate-400 hover:text-slate-300 transition"
            >
              ← Back to File Upload
            </button>
          </section>
        )}

        {/* SECTION 3: RECIPIENTS (Encryption Only) */}
        {workflow.step === 'recipients' && (
          <section className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Add Recipients (Optional)
              </h2>

              <p className="text-sm text-slate-300 mb-4">
                Who should be able to decrypt this file? Add their email addresses.
              </p>

              {/* Add Recipient */}
              <div className="flex gap-2 mb-4">
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddRecipient()}
                  placeholder="recipient@example.com"
                  className="flex-1 rounded-lg bg-slate-800/50 border border-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddRecipient}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
                >
                  Add
                </button>
              </div>

              {/* Recipient List */}
              {workflow.recipients.length > 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-medium text-slate-400">Recipients:</p>
                  {workflow.recipients.map((email) => (
                    <div
                      key={email}
                      className="flex items-center justify-between rounded-lg bg-slate-800/50 border border-white/5 px-3 py-2"
                    >
                      <span className="text-sm text-slate-300">{email}</span>
                      <button
                        onClick={() => handleRemoveRecipient(email)}
                        className="text-xs text-red-400 hover:text-red-300 transition"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Note about future feature */}
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3 mb-4">
                <p className="text-xs text-blue-200">
                  📝 Note: Recipient encryption is coming soon. For now, recipients are stored in the manifest for future implementation.
                </p>
              </div>

              {/* Navigation */}
              <div className="flex gap-2">
                <button
                  onClick={handleSkipRecipients}
                  className="flex-1 rounded-lg border border-white/10 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
                >
                  Skip Recipients
                </button>
                <button
                  onClick={handleProceedToSharing}
                  className="flex-1 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
                >
                  Continue to Sharing →
                </button>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 4: SHARING (Encryption Only) */}
        {workflow.step === 'sharing' && (
          <section className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Share the Encrypted File
              </h2>

              <p className="text-sm text-slate-300 mb-6">
                How would you like to share this encrypted file?
              </p>

              <div className="space-y-3">
                {/* Download */}
                <button
                  onClick={handleDownloadBundle}
                  className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-left transition hover:bg-emerald-500/10"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-emerald-500/20 p-2">
                      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-emerald-200">Download Bundle</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Download the .dpf file to share directly via email, messaging, etc.
                      </p>
                    </div>
                  </div>
                </button>

                {/* Cloud Storage */}
                <button
                  onClick={handleCloudStorage}
                  disabled
                  className="w-full rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-left transition hover:bg-blue-500/10 disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-blue-500/20 p-2">
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-200">Store in Cloud</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Upload to Google Drive, Dropbox, or OneDrive (Coming soon)
                      </p>
                    </div>
                  </div>
                </button>

                {/* Link Sharing */}
                <button
                  onClick={handleLinkSharing}
                  disabled
                  className="w-full rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 text-left transition hover:bg-purple-500/10 disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-purple-500/20 p-2">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-purple-200">Link Sharing</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Upload to Supabase/S3 and get a shareable link (Coming soon)
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 5: EDIT BUNDLE */}
        {workflow.step === 'edit-bundle' && (
          <section className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Bundle Created Successfully!
              </h2>

              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 mb-6">
                <p className="text-sm text-emerald-200">
                  ✅ Your file has been encrypted and is ready to share.
                </p>
              </div>

              <p className="text-sm text-slate-300 mb-4">
                What would you like to do next?
              </p>

              <div className="space-y-2">
                <button
                  onClick={handleStartOver}
                  className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
                >
                  Encrypt Another File
                </button>

                <button
                  disabled
                  className="w-full rounded-lg border border-white/10 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-slate-400 transition disabled:opacity-50"
                >
                  Change Recipients (Coming soon)
                </button>

                <button
                  disabled
                  className="w-full rounded-lg border border-white/10 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-slate-400 transition disabled:opacity-50"
                >
                  Change Sharing Method (Coming soon)
                </button>

                <button
                  disabled
                  className="w-full rounded-lg border border-white/10 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-slate-400 transition disabled:opacity-50"
                >
                  Re-encrypt Bundle (Coming soon)
                </button>
              </div>
            </div>
          </section>
        )}

        {/* COMPLETE (Decryption) */}
        {workflow.step === 'complete' && workflow.decryptedData && (
          <section className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Decryption Complete!
              </h2>

              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 mb-6">
                <p className="text-sm text-emerald-200 mb-2">
                  ✅ File decrypted successfully
                </p>
                <p className="text-sm text-slate-300">
                  {workflow.decryptedData.fileName}
                </p>
              </div>

              <a
                href={workflow.decryptedData.url}
                download={workflow.decryptedData.fileName}
                className="block w-full rounded-lg bg-emerald-500 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                Download Decrypted File
              </a>

              <button
                onClick={handleStartOver}
                className="w-full mt-2 rounded-lg border border-white/10 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Decrypt Another File
              </button>
            </div>
          </section>
        )}

        {/* COMPLETE (Encryption) */}
        {workflow.step === 'complete' && !workflow.decryptedData && workflow.encryptedBundle && (
          <section className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Encryption Complete!
              </h2>

              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 mb-6">
                <p className="text-sm text-emerald-200">
                  ✅ Your DPF file has been created and downloaded successfully.
                </p>
              </div>

              <p className="text-sm text-slate-300 mb-4">
                What would you like to do next?
              </p>

              <div className="space-y-2">
                <button
                  onClick={handleStartOver}
                  className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
                >
                  Encrypt Another File
                </button>

                <button
                  disabled
                  className="w-full rounded-lg border border-white/10 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-slate-400 transition disabled:opacity-50"
                >
                  Change Recipients (Coming soon)
                </button>

                <button
                  disabled
                  className="w-full rounded-lg border border-white/10 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-slate-400 transition disabled:opacity-50"
                >
                  Re-encrypt Bundle (Coming soon)
                </button>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 6: DETAILED INFO (Collapsible) */}
        <section className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
          <button
            onClick={() => setShowDetailedInfo(!showDetailedInfo)}
            className="w-full flex items-center justify-between p-4 text-left transition hover:bg-slate-800/50"
          >
            <span className="text-sm font-medium text-slate-200">
              Technical Info
            </span>
            <svg
              className={`w-5 h-5 text-slate-400 transition-transform ${showDetailedInfo ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDetailedInfo && (
            <div className="border-t border-white/10 p-4 space-y-4">
              {/* PRF Support */}
              <div>
                <p className="text-xs font-medium text-slate-400 mb-2">PRF Support Status</p>
                <div className="rounded-lg bg-slate-800/50 p-3 text-xs space-y-1">
                  <p className="text-slate-300">
                    <span className="text-slate-400">Supported:</span>{' '}
                    {prfSupport?.supported ? '✅ Yes' : '❌ No'}
                  </p>
                  <p className="text-slate-300">
                    <span className="text-slate-400">Platform:</span> {prfSupport?.platform || 'Unknown'}
                  </p>
                  <p className="text-slate-300">
                    <span className="text-slate-400">Fallback Required:</span>{' '}
                    {prfSupport?.fallbackRequired ? 'Yes (PBKDF2)' : 'No'}
                  </p>
                </div>
              </div>

              {/* Stored Credentials */}
              <div>
                <p className="text-xs font-medium text-slate-400 mb-2">Stored Credentials</p>
                <div className="rounded-lg bg-slate-800/50 p-3 text-xs">
                  {credentials.length === 0 ? (
                    <p className="text-slate-400">No credentials stored</p>
                  ) : (
                    <div className="space-y-2">
                      {credentials.map((cred) => (
                        <div key={cred.credentialId} className="text-slate-300">
                          <p className="font-medium">{cred.keyName}</p>
                          <p className="text-slate-400">
                            Type: {cred.type} | PRF: {cred.prfEnabled ? 'Yes' : 'No'}
                          </p>
                          <p className="text-slate-500 break-all">
                            ID: {cred.credentialId.substring(0, 40)}...
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Current Workflow State */}
              {workflow.uploadedFile && (
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-2">Current Workflow State</p>
                  <div className="rounded-lg bg-slate-800/50 p-3 text-xs space-y-1">
                    <p className="text-slate-300">
                      <span className="text-slate-400">File:</span> {workflow.uploadedFile.name}
                    </p>
                    <p className="text-slate-300">
                      <span className="text-slate-400">Type:</span> {workflow.fileType}
                    </p>
                    <p className="text-slate-300">
                      <span className="text-slate-400">Step:</span> {workflow.step}
                    </p>
                    {workflow.recipients.length > 0 && (
                      <p className="text-slate-300">
                        <span className="text-slate-400">Recipients:</span> {workflow.recipients.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// Step Indicator Component
function StepIndicator({
  current,
  step,
  label
}: {
  current: WorkflowStep;
  step: WorkflowStep;
  label: string;
}) {
  const stepOrder: WorkflowStep[] = ['file-upload', 'verify-identity', 'recipients', 'sharing', 'edit-bundle', 'complete'];
  const currentIndex = stepOrder.indexOf(current);
  const stepIndex = stepOrder.indexOf(step);

  const isActive = current === step;
  const isCompleted = currentIndex > stepIndex;

  return (
    <div className={`flex items-center gap-1.5 ${
      isActive ? 'text-emerald-400' : isCompleted ? 'text-emerald-600' : 'text-slate-600'
    }`}>
      <div className={`w-2 h-2 rounded-full ${
        isActive ? 'bg-emerald-400' : isCompleted ? 'bg-emerald-600' : 'bg-slate-600'
      }`} />
      <span className="font-medium">{label}</span>
    </div>
  );
}
