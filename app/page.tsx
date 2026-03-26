'use client';

/**
 * Rico Guided Workflow UI
 *
 * Step-by-step workflow for encrypting and decrypting files:
 * 1. File Upload
 * 2. Verify Identity (encrypt or decrypt)
 * 3. Recipients (encryption only)
 * 4. Sharing (encryption only)
 * 5. Edit Bundle (post-encryption)
 * 6. Detailed Info (expandable)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import type { PRFSupport, WebAuthnCredential, FallbackCredential } from '@/lib/types/credential';
import type { RicoBundle } from '@/lib/types/bundle';
import type { EncryptionAlgorithm, EncryptionSettings, StoredKeypair } from '@/lib/types/settings';
import { DEFAULT_SETTINGS } from '@/lib/types/settings';
import { keypairToCredential } from '@/lib/types/encryption-credential';
import { getCachedPRFSupport, getPlatformPRFInfo } from '@/lib/auth/prf-detection';
import { uploadBundle } from '@/lib/api/client';
import {
  createCredential,
  deleteCredential,
  listUserCredentials,
  selectExistingCredential
} from '@/lib/auth/webauthn';
import { encryptFile, decryptFile } from '@/lib/crypto/encryption';
import { parseBundle } from '@/lib/crypto/bundle';
import { resetAllData } from '@/lib/storage/reset';
import { getSettings, saveSettings, listKeypairs, updateCredential } from '@/lib/storage/indexeddb';
import { generatePQKeypair, generateX25519Keypair } from '@/lib/crypto/keygen';

// Workflow steps
type WorkflowStep =
  | 'file-upload'           // Section 1
  | 'verify-identity'       // Section 2
  | 'recipients'            // Section 3 (encryption only)
  | 'sharing'               // Section 4 (encryption only)
  | 'edit-bundle'           // Section 5 (post-encryption)
  | 'complete';             // Done

type FileType = 'standard' | 'rico' | null;
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
  encryptedBundle: RicoBundle | null;
  decryptedData: { fileName: string; url: string } | null;
}

// --- Passkey Provider Icon Components ---

function AppleIcon() {
  return (
    <svg className="w-6 h-6 text-slate-300" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function GooglePMIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <circle cx="8.5" cy="9.5" r="5" stroke="#4285F4" strokeWidth="2" />
      <circle cx="8.5" cy="9.5" r="2" fill="#4285F4" />
      <path d="M13 9.5h7" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 9.5v2.5" stroke="#34A853" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 9.5v2.5" stroke="#FBBC05" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BitwardenIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#175DDC">
      <path d="M12 2L4 5.8V12c0 5 3.6 9.6 8 11 4.4-1.4 8-6 8-11V5.8L12 2zm0 3.5l5 2.3V12c0 3.5-2.4 6.7-5 7.8C9.4 18.7 7 15.5 7 12V7.8l5-2.3z" />
      <path d="M10 11.5l1.5 1.5L14 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function OnePasswordIcon() {
  return (
    <div className="w-6 h-6 rounded bg-[#0C4BE3] flex items-center justify-center flex-shrink-0">
      <span className="text-white text-xs font-bold leading-none">1P</span>
    </div>
  );
}

function WindowsIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#0078D4">
      <path d="M0 3.449L9.75 2.1v9.45H0M10.949 1.949L24 0v11.4H10.949M0 12.6h9.75v9.449L0 20.699M10.949 12.6H24V24l-13.051-1.8" />
    </svg>
  );
}


function DashlaneIcon() {
  return (
    <div className="w-6 h-6 rounded bg-[#00B050] flex items-center justify-center flex-shrink-0">
      <span className="text-white text-xs font-bold leading-none">D</span>
    </div>
  );
}

function PasskeyKeyIcon() {
  return (
    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

// --- Provider Detection ---

interface PasskeyProviderInfo {
  iconEl: ReactNode;
  providerName: string;
  synced: boolean | null; // null = unknown
}

function getPasskeyProviderInfo(credential: { keyName: string; type: string; metadata?: { userAgent?: string; backupEligible?: boolean; backupState?: boolean } }): PasskeyProviderInfo {
  const name = (credential.keyName || '').toLowerCase();
  const backupEligible = credential.metadata?.backupEligible ?? null;

  if (name.includes('icloud') || name.includes('keychain') || (name.includes('apple') && !name.includes('windows'))) {
    return { iconEl: <AppleIcon />, providerName: 'iCloud Keychain', synced: backupEligible ?? true };
  }
  if (name.includes('google password') || name.includes('gpm') || name.includes('google pass') || name.includes('google pwd')) {
    return { iconEl: <GooglePMIcon />, providerName: 'Google Password Manager', synced: backupEligible ?? true };
  }
  if (name.includes('bitwarden')) {
    return { iconEl: <BitwardenIcon />, providerName: 'Bitwarden', synced: backupEligible ?? true };
  }
  if (name.includes('1password') || name.includes('1pass') || name.includes('onepassword')) {
    return { iconEl: <OnePasswordIcon />, providerName: '1Password', synced: backupEligible ?? true };
  }
  if (name.includes('dashlane')) {
    return { iconEl: <DashlaneIcon />, providerName: 'Dashlane', synced: backupEligible ?? true };
  }
  if (name.includes('windows hello') || name.includes('windows')) {
    return { iconEl: <WindowsIcon />, providerName: 'Windows Hello', synced: backupEligible ?? false };
  }

  if (credential.type === 'fallback-pbkdf2') {
    return { iconEl: <PasskeyKeyIcon />, providerName: 'Password-based', synced: false };
  }

  // Cannot reliably detect provider without AAGUID — show generic icon
  return { iconEl: <PasskeyKeyIcon />, providerName: 'Passkey', synced: backupEligible };
}

// --- Credential Card Component ---

function CredentialCard({
  credential,
  isSelected,
  onSelect,
  onDelete,
  onRename,
  accentColor = 'blue',
}: {
  credential: { credentialId: string; keyName: string; type: string; createdAt: string; metadata?: { userAgent?: string; backupEligible?: boolean; backupState?: boolean } };
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, newName: string) => Promise<void>;
  accentColor?: 'blue' | 'emerald';
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(credential.keyName);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const provider = getPasskeyProviderInfo(credential);

  const selectedClasses = accentColor === 'emerald'
    ? 'border-emerald-400 bg-emerald-500/20'
    : 'border-blue-400 bg-blue-500/20';
  const defaultClasses = 'border-white/10 bg-white/5 hover:bg-white/10';

  const createdDate = new Date(credential.createdAt);
  const formattedDate = createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formattedTime = createdDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const handleRenameSubmit = async () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== credential.keyName) {
      await onRename(credential.credentialId, trimmed);
    } else {
      setEditName(credential.keyName);
    }
    setEditing(false);
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${credential.keyName}"? This cannot be undone. Any files encrypted with it will be unrecoverable.`)) return;
    setDeleting(true);
    try {
      await onDelete(credential.credentialId);
    } catch {
      setDeleting(false);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(credential.keyName);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div
      className={`relative rounded-lg border px-3 py-2.5 transition cursor-pointer ${isSelected ? selectedClasses : defaultClasses}`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3">
        {/* Provider icon */}
        <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center">
          {provider.iconEl}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleRenameSubmit(); }
                if (e.key === 'Escape') { setEditName(credential.keyName); setEditing(false); }
              }}
              onClick={e => e.stopPropagation()}
              className="w-full rounded bg-slate-800 border border-white/20 px-2 py-0.5 text-sm text-white focus:outline-none focus:border-blue-400"
            />
          ) : (
            <p className="text-sm font-medium text-white truncate">{credential.keyName}</p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <p className="text-xs text-slate-400">{provider.providerName}</p>
            {provider.synced !== null && (
              <span
                title={provider.synced ? 'Synced across devices via cloud password manager' : 'Device-bound — not synced to other devices'}
                className="cursor-help"
              >
                {provider.synced ? (
                  <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
              </span>
            )}
            <p className="text-xs text-slate-500">· {formattedDate}, {formattedTime}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            title="Rename (updates display name in Rico only — your password manager keeps the original name)"
            onClick={handleEditClick}
            className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/10 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            type="button"
            title="Delete"
            onClick={handleDeleteClick}
            disabled={deleting}
            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-1.5 align-middle">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        className="w-4 h-4 rounded-full bg-slate-700 text-slate-300 text-[10px] font-bold flex items-center justify-center hover:bg-slate-600 transition leading-none"
        aria-label="More info"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-6 top-1/2 -translate-y-1/2 z-20 w-60 rounded-lg bg-slate-800 border border-white/10 px-3 py-2 text-xs text-slate-300 shadow-xl pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
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
  const [showExistingOptions, setShowExistingOptions] = useState(false);

  // Link sharing state
  const [shareableLink, setShareableLink] = useState<string | null>(null);
  const [isLinkUploading, setIsLinkUploading] = useState(false);

  // Cloud (Google Drive simulation) state
  const [cloudLink, setCloudLink] = useState<string | null>(null);
  const [isCloudUploading, setIsCloudUploading] = useState(false);
  const [copiedLink, setCopiedLink] = useState<'shareable' | 'cloud' | null>(null);

  // Bundle recipient download state (when visiting with ?bundle=id)
  const [bundleDownload, setBundleDownload] = useState<{
    id: string;
    downloadUrl: string;
    fileName: string;
  } | null>(null);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [encryptionSettings, setEncryptionSettings] = useState<EncryptionSettings>(DEFAULT_SETTINGS);
  const [keypairs, setKeypairs] = useState<StoredKeypair[]>([]);

  // Bootstrap
  useEffect(() => {
    async function bootstrap() {
      try {
        const cachedSupport = getCachedPRFSupport();
        const platformInfo = getPlatformPRFInfo();

        // If we have cached support, use it unless it conflicts with platform expectations
        // For platforms that likely support PRF (Mac, iOS, etc.), trust platform detection
        // over stale cached negative results
        let prfSupport: PRFSupport;
        if (cachedSupport) {
          // If platform likely supports PRF but cache says no, trust platform (cache might be stale)
          if (platformInfo.likelySupported && !cachedSupport.supported) {
            prfSupport = {
              supported: platformInfo.likelySupported,
              fallbackRequired: !platformInfo.likelySupported,
              platform: platformInfo.platform,
              detectedAt: new Date().toISOString()
            };
          } else {
            prfSupport = cachedSupport;
          }
        } else {
          prfSupport = {
            supported: platformInfo.likelySupported,
            fallbackRequired: !platformInfo.likelySupported,
            platform: platformInfo.platform,
            detectedAt: new Date().toISOString()
          };
        }

        setPrfSupport(prfSupport);

        const stored = await listUserCredentials();
        setCredentials(stored);

        // Load encryption settings
        const savedSettings = await getSettings();
        if (savedSettings) {
          setEncryptionSettings(savedSettings);
        }

        // Load keypairs
        const storedKeypairs = await listKeypairs();
        setKeypairs(storedKeypairs);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to initialize Rico';
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

  // Handle ?bundle=id query param — fetch the bundle and offer the .rico download
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const bundleId = params.get('bundle');
    if (!bundleId) return;

    async function fetchBundleForDownload() {
      try {
        const { fetchBundleDetails } = await import('@/lib/api/client');
        const data = await fetchBundleDetails(bundleId as string);
        if (data?.downloadUrl) {
          setBundleDownload({
            id: bundleId as string,
            downloadUrl: data.downloadUrl,
            fileName: data.bundle?.file_name ?? 'file.rico',
          });
        }
      } catch {
        // Silently ignore — the bundle may not exist or the link may be expired
      }
    }

    fetchBundleForDownload();
  }, []);

  // ===== SECTION 1: FILE UPLOAD =====
  const handleFileUpload = useCallback((file: File) => {
    const isRico = file.name.toLowerCase().endsWith('.rico') || file.type === 'application/zip';

    // Auto-select the most recently created credential when decrypting
    const latestCredential = isRico && credentials.length > 0
      ? [...credentials].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      : null;

    setWorkflow(prev => ({
      ...prev,
      step: 'verify-identity',
      uploadedFile: file,
      fileType: isRico ? 'rico' : 'standard',
      customCredentialName: file.name.replace(/\.(rico|pdf|docx?|txt|png|jpe?g)$/i, ''),
      selectedCredential: latestCredential ?? prev.selectedCredential,
      credentialMode: latestCredential ? 'select-stored' : prev.credentialMode,
    }));

    setStatusMessage(isRico ? 'Ready to decrypt' : 'Ready to encrypt');
    setErrorMessage(null);
  }, [credentials]);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
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
  const handleCreateAndEncrypt = async () => {
    if (!workflow.customCredentialName.trim()) {
      setErrorMessage('Please enter a credential name');
      return;
    }
    if (!workflow.uploadedFile) {
      setErrorMessage('No file uploaded');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Creating credential and encrypting...');

    try {
      const credential = await createCredential({
        keyName: workflow.customCredentialName.trim(),
        prfSupportOverride: prfSupport ?? undefined
      });

      const updated = await listUserCredentials();
      setCredentials(updated);

      setStatusMessage('Credential created. Encrypting file...');

      const bundle = await encryptFile({
        file: workflow.uploadedFile,
        ownerCredential: credential
      });

      setWorkflow(prev => ({
        ...prev,
        step: 'recipients',
        selectedCredential: credential,
        credentialMode: 'create',
        encryptedBundle: bundle
      }));

      setStatusMessage('File encrypted. Add recipients or proceed to sharing.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create credential or encrypt';
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

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Encrypting file...');

    try {
      // PQ or x25519 keypair mode
      if (encryptionSettings.algorithm === 'age-pq' || encryptionSettings.algorithm === 'age-x25519') {
        const algType = encryptionSettings.algorithm === 'age-pq' ? 'age-pq' : 'age-x25519';
        let keypair = keypairs.find(kp => kp.algorithm === algType);

        if (!keypair) {
          const label = workflow.customCredentialName.trim() || `Rico ${algType === 'age-pq' ? 'PQ' : 'x25519'} Key`;
          setStatusMessage(`Generating ${algType === 'age-pq' ? 'post-quantum' : 'x25519'} keypair...`);
          keypair = algType === 'age-pq'
            ? await generatePQKeypair(label)
            : await generateX25519Keypair(label);
          setKeypairs(await listKeypairs());
        }

        const credential = keypairToCredential(keypair);
        const bundle = await encryptFile({
          file: workflow.uploadedFile,
          ownerCredential: credential,
        });

        setWorkflow(prev => ({
          ...prev,
          step: 'recipients',
          encryptedBundle: bundle,
        }));

        setStatusMessage('File encrypted. Add recipients or proceed to sharing.');
      } else {
        // WebAuthn PRF mode
        let credential = workflow.selectedCredential;

        // If using external credential mode, select existing passkey from password manager
        if (workflow.credentialMode === 'select-external' && !credential) {
          setStatusMessage('Please select a passkey from your password manager...');
          credential = await selectExistingCredential();
          setStatusMessage('Passkey selected. Encrypting file...');
        }

        if (!credential) {
          setErrorMessage('Please create or select a credential first');
          setIsProcessing(false);
          return;
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
      }
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

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Parsing bundle and decrypting...');

    try {
      const parsed = await parseBundle(workflow.uploadedFile);
      const bundle: RicoBundle = {
        bundleId: parsed.bundleId || crypto.randomUUID(),
        blob: workflow.uploadedFile,
        manifest: parsed.manifest,
        createdAt: new Date()
      };

      const bundleAlgorithm = parsed.manifest.encryptionInfo.algorithm;

      // For PQ or x25519 bundles, find the matching keypair
      if (bundleAlgorithm === 'age-pq' || bundleAlgorithm === 'age-x25519') {
        const matchingKeypair = keypairs.find(kp => {
          return parsed.manifest.encryptionInfo.recipients.some(
            r => r.publicKey === kp.recipient || r.identity === kp.identity
          );
        });

        if (!matchingKeypair) {
          throw new Error(
            `This file was encrypted with a ${bundleAlgorithm === 'age-pq' ? 'post-quantum' : 'x25519'} keypair that is not stored in this browser.\n\n` +
            `You need the original keypair to decrypt this file.`
          );
        }

        const credential = keypairToCredential(matchingKeypair);
        const decrypted = await decryptFile({ bundle, credential });

        const blob = new Blob([decrypted.data as BlobPart], { type: decrypted.mimeType });
        const downloadUrl = URL.createObjectURL(blob);

        setWorkflow(prev => ({
          ...prev,
          step: 'complete',
          decryptedData: { fileName: decrypted.fileName, url: downloadUrl }
        }));

        setStatusMessage('File decrypted successfully!');
      } else {
        // WebAuthn PRF or fallback mode (existing behavior)
        if (!workflow.selectedCredential && workflow.credentialMode !== 'select-external') {
          setErrorMessage('Please select a credential or choose to use password manager');
          setIsProcessing(false);
          return;
        }

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
      }
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
    const input = recipientEmail.trim();
    if (!input) return;

    // Split by comma or whitespace, then filter out empty strings
    const emailCandidates = input
      .split(/[,\s]+/)
      .map(e => e.trim())
      .filter(e => e.length > 0);

    if (emailCandidates.length === 0) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails: string[] = [];
    const invalidEmails: string[] = [];
    const duplicateEmails: string[] = [];

    emailCandidates.forEach(email => {
      if (!emailRegex.test(email)) {
        invalidEmails.push(email);
      } else if (workflow.recipients.includes(email)) {
        duplicateEmails.push(email);
      } else if (!validEmails.includes(email)) {
        validEmails.push(email);
      } else {
        duplicateEmails.push(email);
      }
    });

    // Add all valid emails
    if (validEmails.length > 0) {
      setWorkflow(prev => ({
        ...prev,
        recipients: [...prev.recipients, ...validEmails]
      }));
    }

    // Set appropriate messages
    // Only show success/info messages in status (white), errors go to error message (red)
    const messages: string[] = [];
    if (validEmails.length > 0) {
      messages.push(`Added ${validEmails.length} recipient${validEmails.length > 1 ? 's' : ''}: ${validEmails.join(', ')}`);
    }
    if (duplicateEmails.length > 0) {
      messages.push(`Duplicate${duplicateEmails.length > 1 ? 's' : ''} skipped: ${duplicateEmails.join(', ')}`);
    }

    if (messages.length > 0) {
      setStatusMessage(messages.join('. '));
    } else if (invalidEmails.length > 0 && validEmails.length === 0) {
      // Only clear status if we have errors and no successes
      setStatusMessage('');
    }

    // Error messages go to error area (red) only
    if (invalidEmails.length > 0) {
      setErrorMessage(`Invalid email${invalidEmails.length > 1 ? 's' : ''}: ${invalidEmails.join(', ')}`);
    } else {
      setErrorMessage(null);
    }

    setRecipientEmail('');
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
    setErrorMessage(null);
  };

  const handleSkipRecipients = () => {
    // Clear any recipients that were added and proceed to sharing
    setWorkflow(prev => ({
      ...prev,
      step: 'sharing',
      recipients: []
    }));
    setStatusMessage('Recipients skipped. Choose how to share the encrypted file.');
    setErrorMessage(null);
  };

  // ===== SECTION 4: SHARING =====
  const handleDownloadBundle = () => {
    if (!workflow.encryptedBundle) return;

    const url = URL.createObjectURL(workflow.encryptedBundle.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.uploadedFile?.name || 'file'}.rico`;
    a.click();
    URL.revokeObjectURL(url);

    setWorkflow(prev => ({
      ...prev,
      step: 'complete',
      sharingMode: 'download'
    }));

    setStatusMessage('Rico file created successfully!');
  };

  const handleLinkSharing = async () => {
    if (!workflow.encryptedBundle) return;

    setIsLinkUploading(true);
    setErrorMessage(null);
    setStatusMessage('Uploading encrypted file...');

    try {
      const bundle = workflow.encryptedBundle;
      const ownerRecipient = bundle.manifest.encryptionInfo.recipients.find(
        r => r.role === 'owner'
      );
      const ownerIdentity =
        ownerRecipient?.identity ?? ownerRecipient?.publicKey ?? bundle.bundleId;

      const fileName = `${workflow.uploadedFile?.name || 'file'}.rico`;

      const result = await uploadBundle({
        ownerIdentity,
        manifest: bundle.manifest,
        bundleBlob: bundle.blob,
        fileName,
      });

      const bundleId = result.bundle.id;
      const link = `${window.location.origin}?bundle=${bundleId}`;

      setShareableLink(link);
      setWorkflow(prev => ({
        ...prev,
        step: 'complete',
        sharingMode: 'link',
      }));
      setStatusMessage('Rico file uploaded and link ready to share!');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setErrorMessage(message);
      setStatusMessage('Upload failed');
    } finally {
      setIsLinkUploading(false);
    }
  };

  const handleCloudStorage = async () => {
    if (!workflow.encryptedBundle) return;

    setIsCloudUploading(true);
    setErrorMessage(null);
    setStatusMessage('Connecting to Google Drive...');

    try {
      // Phase 1 – simulate OAuth / picker handshake
      await new Promise(resolve => setTimeout(resolve, 1200));
      setStatusMessage('Uploading encrypted file to Google Drive...');

      // Phase 2 – simulate upload
      await new Promise(resolve => setTimeout(resolve, 1800));

      // Generate a plausible-looking fake Google Drive share link
      const fakeFileId = crypto.randomUUID().replace(/-/g, '').slice(0, 28).toUpperCase().replace(/[^A-Z0-9]/g, '0');
      const link = `https://drive.google.com/file/d/${fakeFileId}/view?usp=sharing`;

      setCloudLink(link);
      setWorkflow(prev => ({
        ...prev,
        step: 'complete',
        sharingMode: 'cloud',
      }));
      setStatusMessage('Rico file uploaded to Google Drive!');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setErrorMessage(message);
      setStatusMessage('Google Drive upload failed');
    } finally {
      setIsCloudUploading(false);
    }
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

    setShareableLink(null);
    setCloudLink(null);
    setStatusMessage('Ready to upload a file');
    setErrorMessage(null);
  };

  // ===== CREDENTIAL MANAGEMENT =====
  const handleDeleteCredential = useCallback(async (credentialId: string) => {
    try {
      await deleteCredential(credentialId);
      const updated = await listUserCredentials();
      setCredentials(updated);
      if (workflow.selectedCredential?.credentialId === credentialId) {
        setWorkflow(prev => ({ ...prev, selectedCredential: null, credentialMode: null }));
      }
      setStatusMessage('Passkey deleted');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete passkey';
      setErrorMessage(message);
    }
  }, [workflow.selectedCredential]);

  const handleRenameCredential = useCallback(async (credentialId: string, newName: string) => {
    try {
      await updateCredential(credentialId, { keyName: newName });
      const updated = await listUserCredentials();
      setCredentials(updated);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to rename passkey';
      setErrorMessage(message);
    }
  }, []);

  // ===== RESET =====
  const handleReset = async () => {
    if (!confirm('Reset all Rico data? This will delete all credentials and bundles. This cannot be undone.')) {
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

  // ===== SETTINGS =====
  const handleAlgorithmChange = async (algorithm: EncryptionAlgorithm) => {
    const updated: EncryptionSettings = {
      ...encryptionSettings,
      algorithm,
      updatedAt: new Date().toISOString(),
    };
    await saveSettings(updated);
    setEncryptionSettings(updated);
    setStatusMessage(`Encryption algorithm set to ${algorithmDisplayName(algorithm)}`);
  };

  function algorithmDisplayName(alg: EncryptionAlgorithm): string {
    switch (alg) {
      case 'age-pq': return 'Post-Quantum Hybrid';
      case 'age-x25519': return 'Classic (x25519)';
      case 'age-webauthn': return 'WebAuthn Passkey (PRF)';
    }
  }

  // ===== RENDER =====
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              {/* <p className="text-sm uppercase tracking-wide text-slate-400">Rico</p> */}
              <h1 className="text-3xl font-semibold text-white">
                Passwordless File Encryption
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  showSettings
                    ? 'bg-slate-700 border-white/20 text-white'
                    : 'bg-slate-700/50 border-white/10 text-slate-300 hover:bg-slate-700'
                }`}
                title="Encryption settings"
              >
                <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/30"
                title="Reset all stored data"
              >
                Reset All
              </button>
            </div>
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

        {/* Settings Panel */}
        {showSettings && (
          <section className="rounded-xl border border-white/10 bg-slate-900/40 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Encryption Settings</h2>
            <p className="text-xs text-slate-400">
              Choose the encryption algorithm for new files. Existing bundles can always be decrypted regardless of this setting.
            </p>

            <div className="space-y-2">
              {/* WebAuthn Passkey PRF (Default) */}
              <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                encryptionSettings.algorithm === 'age-webauthn'
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}>
                <input
                  type="radio"
                  name="algorithm"
                  value="age-webauthn"
                  checked={encryptionSettings.algorithm === 'age-webauthn'}
                  onChange={() => handleAlgorithmChange('age-webauthn')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-white">
                    WebAuthn Passkey (PRF) <span className="text-xs text-emerald-400">(Default)</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    Uses hardware-bound passkeys. Keys never leave your authenticator.
                  </p>
                  {prfSupport && !prfSupport.supported && (
                    <p className="text-xs text-amber-400 mt-1">
                      Not available on this platform. Fallback mode will be used.
                    </p>
                  )}
                </div>
              </label>

              {/* Post-Quantum Hybrid */}
              <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                encryptionSettings.algorithm === 'age-pq'
                  ? 'border-blue-500/50 bg-blue-500/5'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}>
                <input
                  type="radio"
                  name="algorithm"
                  value="age-pq"
                  checked={encryptionSettings.algorithm === 'age-pq'}
                  onChange={() => handleAlgorithmChange('age-pq')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-white">Post-Quantum Hybrid</p>
                  <p className="text-xs text-slate-400">
                    Protects against both classical and quantum computer attacks. Uses X25519 + ML-KEM-768 hybrid encryption.
                  </p>
                </div>
              </label>

              {/* Classic x25519 */}
              <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                encryptionSettings.algorithm === 'age-x25519'
                  ? 'border-slate-400/50 bg-slate-500/5'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}>
                <input
                  type="radio"
                  name="algorithm"
                  value="age-x25519"
                  checked={encryptionSettings.algorithm === 'age-x25519'}
                  onChange={() => handleAlgorithmChange('age-x25519')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-white">Classic (x25519)</p>
                  <p className="text-xs text-slate-400">
                    Standard age encryption. Smaller keys and wider compatibility.
                  </p>
                </div>
              </label>
            </div>

            {/* Show active keypair info for PQ/x25519 */}
            {(encryptionSettings.algorithm === 'age-pq' || encryptionSettings.algorithm === 'age-x25519') && (
              <div className="rounded-lg bg-slate-800/50 border border-white/5 p-3">
                <p className="text-xs font-medium text-slate-400 mb-1">
                  {encryptionSettings.algorithm === 'age-pq' ? 'Post-Quantum' : 'x25519'} Keypair
                </p>
                {keypairs.filter(kp => kp.algorithm === encryptionSettings.algorithm).length > 0 ? (
                  keypairs.filter(kp => kp.algorithm === encryptionSettings.algorithm).map(kp => (
                    <p key={kp.id} className="text-xs text-slate-300">
                      {kp.label} <span className="text-slate-500">({kp.recipient.substring(0, 20)}...)</span>
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">
                    A keypair will be generated automatically when you encrypt your first file.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

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
          {workflow.uploadedFile && workflow.step !== 'recipients' && workflow.step !== 'sharing' && workflow.step !== 'complete' && (
            <p className="text-xs text-slate-400 mt-2">
              {workflow.fileType === 'rico' ? '🔒' : '📄'} {workflow.uploadedFile.name}
            </p>
          )}
          {errorMessage && (() => {
            // Check if error message contains "See:" or "See " followed by a URL
            const seeUrlMatch = errorMessage.match(/^(.+?)\s+See:?\s+(https?:\/\/[^\s]+)/);
            if (seeUrlMatch) {
              const [, mainMessage, url] = seeUrlMatch;
              // Remove trailing periods and whitespace, then add a single period
              const cleanedMessage = mainMessage.trim().replace(/\.+$/, '');
              return (
                <div className="text-sm text-red-400 mt-2 border-t border-red-500/20 pt-2">
                  <span>{cleanedMessage}. </span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-400 hover:text-red-300 underline"
                  >
                    See more details
                  </a>
                </div>
              );
            }
            // Fallback: render any URLs as clickable links
            const parts = errorMessage.split(/(https?:\/\/[^\s]+)/);
            return (
              <div className="text-sm text-red-400 mt-2 border-t border-red-500/20 pt-2">
                {parts.map((part, index) => {
                  if (part.match(/^https?:\/\//)) {
                    return (
                      <a
                        key={index}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-400 hover:text-red-300 underline"
                      >
                        {part}
                      </a>
                    );
                  }
                  return <span key={index}>{part}</span>;
                })}
              </div>
            );
          })()}
        </div>

        {/* SHARED BUNDLE DOWNLOAD BANNER */}
        {bundleDownload && workflow.step === 'file-upload' && (
          <section className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Shared Encrypted File</h2>
            <p className="text-sm text-slate-300 mb-4">
              Someone shared an encrypted file with you. Download it, then upload it below to decrypt.
            </p>
            <div className="flex items-center gap-3">
              <a
                href={bundleDownload.downloadUrl}
                download={bundleDownload.fileName}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
              >
                Download {bundleDownload.fileName}
              </a>
              <button
                onClick={() => setBundleDownload(null)}
                className="text-xs text-slate-400 hover:text-slate-300"
              >
                Dismiss
              </button>
            </div>
          </section>
        )}

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
                <p className="text-lg font-medium text-white mb-2">Upload a File to Encrypt or Decrypt</p>
                <p className="text-sm text-slate-400">Drag & drop or click to upload any file. A <span className="text-emerald-400">.rico</span> file will decrypt.</p>
              </div>
              <div className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400">
                Choose File
              </div>
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

              {/* ENCRYPTION PATH */}
              {workflow.fileType === 'standard' && (
                <div className="space-y-4">
                  {/* PQ / x25519 keypair mode */}
                  {(encryptionSettings.algorithm === 'age-pq' || encryptionSettings.algorithm === 'age-x25519') && (
                    <>
                      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                        <p className="text-sm font-medium text-blue-200 mb-2">
                          {encryptionSettings.algorithm === 'age-pq' ? 'Post-Quantum Hybrid' : 'Classic x25519'} Encryption
                        </p>
                        <p className="text-xs text-slate-400 mb-3">
                          {encryptionSettings.algorithm === 'age-pq'
                            ? 'Your file will be encrypted with quantum-resistant ML-KEM-768 + X25519 hybrid encryption.'
                            : 'Your file will be encrypted with standard X25519 age encryption.'}
                          {' '}A keypair {keypairs.find(kp => kp.algorithm === encryptionSettings.algorithm) ? 'is stored locally' : 'will be generated automatically'}.
                        </p>
                        {keypairs.filter(kp => kp.algorithm === encryptionSettings.algorithm).map(kp => (
                          <div key={kp.id} className="rounded-lg bg-slate-800/50 border border-white/5 p-2 text-xs text-slate-300">
                            <span className="text-slate-400">Keypair:</span> {kp.label}
                            <span className="text-slate-500 ml-2">({kp.recipient.substring(0, 16)}...)</span>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={handleProceedToEncryption}
                        disabled={isProcessing}
                        className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {isProcessing ? 'Encrypting...' : 'Encrypt File →'}
                      </button>
                    </>
                  )}

                  {/* WebAuthn PRF mode */}
                  {encryptionSettings.algorithm === 'age-webauthn' && (
                    <>
                      {/* Create New Credential + Encrypt (combined) */}
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                        <p className="text-sm font-medium text-emerald-200 mb-3">
                          New Passkey
                          <InfoTooltip text="Registers a brand-new passkey on your device. Your browser or password manager saves it automatically so you can use it to decrypt this file later." />
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
                            onClick={handleCreateAndEncrypt}
                            disabled={isProcessing || !workflow.customCredentialName.trim()}
                            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                          >
                            {isProcessing ? 'Processing...' : 'Create & Encrypt'}
                          </button>
                        </div>
                      </div>

                      {/* Collapsible: Existing Credential / Password Manager */}
                      {(credentials.length > 0 || true) && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setShowExistingOptions(!showExistingOptions)}
                            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition"
                          >
                            <svg
                              className={`w-4 h-4 transition-transform ${showExistingOptions ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            Use existing
                          </button>

                          {showExistingOptions && (
                            <div className="mt-3 space-y-3">
                              {/* Select Existing Credential */}
                              {credentials.length > 0 && (
                                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                                  <p className="text-sm font-medium text-blue-200 mb-3">
                                    Existing Credential
                                    <InfoTooltip text="Encrypt using a passkey you've already created on this device. The same credential will be required to decrypt the file." />
                                  </p>
                                  <div className="space-y-2">
                                    {credentials.map((cred) => (
                                      <CredentialCard
                                        key={cred.credentialId}
                                        credential={cred}
                                        isSelected={workflow.selectedCredential?.credentialId === cred.credentialId}
                                        onSelect={() => handleSelectCredential(cred)}
                                        onDelete={handleDeleteCredential}
                                        onRename={handleRenameCredential}
                                        accentColor="emerald"
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* External Credential - Encryption */}
                              <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                                <p className="text-sm font-medium text-purple-200 mb-3">
                                  Use Password Manager
                                  <InfoTooltip text="Use a passkey already saved in iCloud Keychain, Google Password Manager, Bitwarden, 1Password, etc. Choose this if you previously created a .rico passkey and want to reuse it." />
                                </p>
                                <button
                                  onClick={handleUseExternalCredential}
                                  className={`w-full rounded-lg border px-4 py-2 text-sm transition ${
                                    workflow.credentialMode === 'select-external'
                                      ? 'border-purple-400 bg-purple-500/20 text-purple-200'
                                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                                  }`}
                                >
                                  Google, iCloud, Bitwarden...
                                </button>
                              </div>

                              {/* Proceed Button (for existing/external paths) */}
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
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* DECRYPTION PATH */}
              {workflow.fileType === 'rico' && (
                <div className="space-y-4">
                  {/* Stored Credentials */}
                  {credentials.length > 0 && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                      <p className="text-sm font-medium text-blue-200 mb-3">
                        Stored Credentials
                        <InfoTooltip text="Select a passkey previously saved on this device. It must be the same credential that was used when this file was encrypted." />
                      </p>
                      <div className="space-y-2">
                        {credentials.map((cred) => (
                          <CredentialCard
                            key={cred.credentialId}
                            credential={cred}
                            isSelected={workflow.selectedCredential?.credentialId === cred.credentialId}
                            onSelect={() => handleSelectCredential(cred)}
                            onDelete={handleDeleteCredential}
                            onRename={handleRenameCredential}
                            accentColor="blue"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* External Credential */}
                  <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                    <p className="text-sm font-medium text-purple-200 mb-3">
                      Use Password Manager
                      <InfoTooltip text="Opens your system's passkey picker (iCloud Keychain, Google Password Manager, Bitwarden, 1Password, etc.). The credential doesn't need to be stored on this device." />
                    </p>
                    <button
                      onClick={handleUseExternalCredential}
                      className={`w-full rounded-lg border px-4 py-2 text-sm transition ${
                        workflow.credentialMode === 'select-external'
                          ? 'border-purple-400 bg-purple-500/20 text-purple-200'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      Google, iCloud, Bitwarden...
                    </button>
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
                Who should be able to decrypt this file?
              </p>

              {/* Add Recipient */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddRecipient()}
                  placeholder="recipient@example.com, another@example.com"
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

              {/* Navigation */}
              <div className="flex gap-2">
                {workflow.recipients.length === 0 ? (
                  <button
                    onClick={handleSkipRecipients}
                    className="flex-1 rounded-lg border border-white/10 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
                  >
                    Skip Recipients
                  </button>
                ) : (
                  <>
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
                  </>
                )}
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
                        Download the .rico file to share directly via email, messaging, etc.
                      </p>
                    </div>
                  </div>
                </button>

                {/* Cloud Storage */}
                <button
                  onClick={handleCloudStorage}
                  disabled={isCloudUploading}
                  className="w-full rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-left transition hover:bg-blue-500/10 disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-blue-500/20 p-2">
                      {isCloudUploading ? (
                        <svg className="w-5 h-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-200">Store in Cloud</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {isCloudUploading ? statusMessage : 'Upload to Google Drive'}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Link Sharing */}
                <button
                  onClick={handleLinkSharing}
                  disabled={isLinkUploading}
                  className="w-full rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 text-left transition hover:bg-purple-500/10 disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-purple-500/20 p-2">
                      {isLinkUploading ? (
                        <svg className="w-5 h-5 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-purple-200">Link Sharing</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {isLinkUploading ? 'Uploading...' : 'Upload and get a shareable link'}
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
                  Encrypt / Decrypt a File
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
                Encrypt / Decrypt a File
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

              {workflow.sharingMode === 'link' && shareableLink ? (
                <>
                  <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 mb-6">
                    <p className="text-sm text-emerald-200">
                      ✅ Your Rico file has been uploaded. Share the link below.
                    </p>
                  </div>

                  <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 mb-4">
                    <p className="text-xs text-slate-400 mb-2">Shareable link</p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={shareableLink}
                        className="flex-1 rounded bg-slate-800 px-3 py-2 text-xs text-slate-200 font-mono truncate"
                      />
                      <button
                        onClick={() => { navigator.clipboard.writeText(shareableLink); setCopiedLink('shareable'); setTimeout(() => setCopiedLink(null), 2000); }}
                        className="shrink-0 rounded bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-purple-500"
                      >
                        {copiedLink === 'shareable' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Recipients can open this link to download the encrypted file.
                    </p>
                  </div>
                </>
              ) : workflow.sharingMode === 'cloud' && cloudLink ? (
                <>
                  <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 mb-6">
                    <p className="text-sm text-emerald-200">
                      ✅ Your Rico file has been uploaded to Google Drive. Share the link below.
                    </p>
                  </div>

                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 mb-4">
                    <p className="text-xs text-slate-400 mb-2">Google Drive link</p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={cloudLink}
                        className="flex-1 rounded bg-slate-800 px-3 py-2 text-xs text-slate-200 font-mono truncate"
                      />
                      <button
                        onClick={() => { navigator.clipboard.writeText(cloudLink); setCopiedLink('cloud'); setTimeout(() => setCopiedLink(null), 2000); }}
                        className="shrink-0 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
                      >
                        {copiedLink === 'cloud' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Recipients can open this Google Drive link to download the encrypted file.
                    </p>
                  </div>
                </>
              ) : (
                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 mb-6">
                  <p className="text-sm text-emerald-200">
                    ✅ Your Rico file has been created and downloaded successfully.
                  </p>
                </div>
              )}

              <p className="text-sm text-slate-300 mb-4">
                What would you like to do next?
              </p>

              <div className="space-y-2">
                <button
                  onClick={handleStartOver}
                  className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
                >
                  Encrypt / Decrypt a File
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
              {/* Encryption Settings */}
              <div>
                <p className="text-xs font-medium text-slate-400 mb-2">Encryption Settings</p>
                <div className="rounded-lg bg-slate-800/50 p-3 text-xs space-y-1">
                  <p className="text-slate-300">
                    <span className="text-slate-400">Algorithm:</span>{' '}
                    {algorithmDisplayName(encryptionSettings.algorithm)}
                  </p>
                  {keypairs.length > 0 && (
                    <div>
                      <span className="text-slate-400">Stored Keypairs:</span>
                      {keypairs.map(kp => (
                        <p key={kp.id} className="text-slate-300 ml-2">
                          {kp.label} ({kp.algorithm === 'age-pq' ? 'PQ Hybrid' : 'x25519'}) - {kp.recipient.substring(0, 20)}...
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

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
