# Doc Protect Workflow Redesign - Implementation Plan

## Overview
This document outlines the detailed implementation plan for redesigning the Doc Protect workflow to improve user experience and fix critical issues with credential management.

## Current Issues

### Issue 1: Auto-creation of Credentials on Page Load
**Problem**: The site currently auto-creates a test credential on page load to check PRF compatibility.
- This is intrusive and unexpected
- Creates unnecessary credentials in user's password managers
- Poor user experience

**Solution**: Remove auto-creation. Detect PRF support passively or during actual credential creation.

### Issue 2: No Support for Existing Credentials from Password Managers
**Problem**: Users are forced to create new credentials specifically for DocProtect.
- Cannot use existing passkeys from Google, iCloud, Bitwarden, 1Password, etc.
- Increases friction and reduces adoption
- Doesn't leverage existing secure credential infrastructure

**Solution**: Add "Authenticate with existing credential" option alongside "Create new credential"

## New Workflow Design

### Section 1: File Selection/Upload
**Purpose**: Begin the workflow with a file
**UI Components**:
- File drag-and-drop zone
- File picker button
- File preview (name, size, type)

**State**:
```typescript
currentStep: 'file-upload' | 'verify-identity' | 'recipients' | 'sharing' | 'complete'
uploadedFile: File | null
fileType: 'standard' | 'dpf' | null
```

**Implementation**:
- Keep existing file upload UI
- Add step indicator/progress bar
- Auto-detect file type (DPF vs standard)
- Move to Section 2 after file selected

---

### Section 2: Verify Identity
**Purpose**: Authenticate user and determine encryption/decryption path

#### Path A: Encryption (Standard File)

**UI Flow**:
1. Display file info: "This is a standard file. Encrypt it?"
2. Show encryption type selector (default: PRF Secure)
   - Future: Post-quantum option
   - Future: Custom key derivation selection
3. **Credential Selection** (NEW):
   ```
   [ ] Create new credential (Register)
       └─ Input: Credential name (default: filename)
   [ ] Use existing credential (Authenticate)
       └─ Triggers WebAuthn authentication picker
   ```

**State Changes**:
```typescript
encryptionType: 'prf-secure' | 'post-quantum' | 'custom'
credentialMode: 'create' | 'authenticate' | null
credentialName: string (default: uploadedFile.name)
selectedCredential: WebAuthnCredential | FallbackCredential | null
```

**Implementation Details**:
- **Create New Credential**:
  - Show credential name input (pre-filled with filename)
  - Call `createCredential()` with `residentKey: 'required'`
  - Detect PRF support during creation (not on page load)
  - Store in IndexedDB
  - Set as selected credential

- **Use Existing Credential**:
  - Call WebAuthn authentication with `allowCredentials: []` (empty = show all)
  - This triggers browser's credential picker (Google, iCloud, etc.)
  - Use returned credential for encryption
  - Optionally store in IndexedDB for future use
  - Extract identity from assertion

**Key Function Changes**:
```typescript
// lib/auth/webauthn.ts - NEW FUNCTION
export async function authenticateExistingCredential(
  options: {
    rpId: string;
    challenge: Uint8Array;
    userVerification: 'required' | 'preferred' | 'discouraged';
  }
): Promise<WebAuthnCredential>

// Modify createCredential to accept credentialName parameter
export async function createCredential(
  credentialName?: string
): Promise<WebAuthnCredential | FallbackCredential>
```

#### Path B: Decryption (DPF File)

**UI Flow**:
1. Display file info: "This is an encrypted DocProtect file (.dpf)"
2. Parse manifest to show:
   - Original filename
   - File size
   - Encrypted date
   - Owner identity (if available)
3. **Credential Selection** (MODIFIED):
   ```
   [ ] Select stored credential (from IndexedDB)
   [ ] Authenticate with credential from password manager
   ```

**State Changes**:
```typescript
bundleManifest: DocProtectManifest | null
decryptionMode: 'stored' | 'external' | null
```

**Implementation Details**:
- Parse bundle immediately after upload
- Extract manifest.json from ZIP
- Display file metadata
- **Stored Credential**: Show list from IndexedDB (existing behavior)
- **External Credential**: Use WebAuthn authentication with `allowCredentials: []`
  - Allow users to authenticate with credentials not in IndexedDB
  - This is critical for users accessing files on different devices

**Key Function Changes**:
```typescript
// lib/crypto/bundle.ts - ENHANCE
export async function parseBundle(file: File): Promise<{
  manifest: DocProtectManifest;
  payload: Uint8Array;
  metadata: {
    fileName: string;
    encryptedAt: string;
    ownerIdentity?: string;
  }
}>
```

---

### Section 3: Recipients (Encryption Only)
**Purpose**: Specify who can access the encrypted file

**UI Components**:
- Recipient email input field
- "Add Recipient" button
- List of added recipients with remove option
- Recipient verification status (future: email verification)

**State**:
```typescript
recipients: Array<{
  email: string;
  identity?: string;
  publicKey?: string;
  status: 'pending' | 'verified' | 'invited';
}>
```

**Implementation**:
- Simple email list for MVP
- Store in manifest's policy.body.dissem
- Future Phase 2: Email invitations, access requests
- Future Phase 3: ABAC attribute-based access

**Key Function Changes**:
```typescript
// lib/crypto/manifest.ts - ENHANCE
export function createManifest(options: {
  // ... existing options
  recipientEmails?: string[];
}): DocProtectManifest
```

**Skip Logic**:
- Can be skipped (no recipients = owner only)
- "Skip" button or "No additional recipients" option

---

### Section 4: Sharing the Bundle (Encryption Only)
**Purpose**: Choose how to distribute the encrypted file

**UI Components**:
```
How would you like to share this encrypted file?

[ ] Download the bundle
    └─ Download .dpf file directly

[ ] Store in cloud
    └─ [ ] Google Drive
    └─ [ ] Dropbox
    └─ [ ] OneDrive

[ ] Link sharing
    └─ Upload to Supabase/S3
    └─ Generate shareable link
    └─ Set expiration (optional)
```

**State**:
```typescript
sharingMethod: 'download' | 'cloud' | 'link' | null
cloudProvider: 'google-drive' | 'dropbox' | 'onedrive' | null
linkOptions: {
  expiresAt?: Date;
  maxDownloads?: number;
  requireAuth?: boolean;
}
```

**Implementation**:
- **Download** (MVP - existing): Generate download link immediately
- **Cloud Storage** (Future - Phase 2+):
  - Integrate with OAuth2 for Google Drive, Dropbox, OneDrive APIs
  - Upload bundle directly to user's cloud storage
  - Return success/failure status
- **Link Sharing** (MVP - existing API):
  - Use existing `/api/bundles` endpoint
  - Upload to Supabase storage
  - Generate shareable link
  - Add expiration/download limit metadata

**Key Function Changes**:
```typescript
// app/api/bundles/route.ts - ENHANCE
export async function POST(request: Request) {
  // Add link options: expiration, max downloads, auth requirement
}

// New: lib/integrations/cloud-storage.ts
export async function uploadToGoogleDrive(
  bundle: Blob,
  fileName: string,
  accessToken: string
): Promise<{ fileId: string; webViewLink: string }>
```

---

### Section 5: Edit Bundle (Post-Encryption)
**Purpose**: Modify bundle after creation without starting over

**UI Components**:
```
Bundle Created Successfully!

[ Edit Recipients ]
  └─ Opens recipient management UI
  └─ Triggers re-encryption if changed

[ Change Sharing Method ]
  └─ Returns to Section 4

[ Re-encrypt with Different Key ]
  └─ Returns to Section 2 (credential selection)
  └─ Preserves file, recipients, sharing settings

[ Download Bundle ]
[ View Bundle Details ]
```

**State**:
```typescript
bundleMetadata: {
  bundleId: string;
  createdAt: Date;
  encryptedFile: Blob;
  manifest: DocProtectManifest;
  sharingInfo: SharingInfo;
}
editMode: boolean
```

**Implementation**:
- Store bundle metadata in component state after encryption
- Allow navigation back to previous sections
- **Re-encryption Logic**:
  - If recipients changed: Re-encrypt with updated manifest
  - If sharing method changed: Upload/download new version
  - If credential changed: Full re-encryption required

**Key Function Changes**:
```typescript
// lib/crypto/encryption.ts - NEW
export async function reEncryptBundle(
  existingBundle: DocProtectBundle,
  updates: {
    newRecipients?: RecipientInfo[];
    newOwnerCredential?: WebAuthnCredential;
    newPolicy?: PolicyObject;
  }
): Promise<DocProtectBundle>
```

---

### Section 6: Detailed Info (Collapsed by Default)
**Purpose**: Show technical details and PRF support status (like Corbado demo)

**UI Components**:
```
[ ▶ Technical Details ] (Collapsed)

When expanded:

┌─────────────────────────────────────┐
│ PRF Support Status                  │
│ ✅ PRF Support on Creation          │
│ ✅ PRF Value on Creation (CTAP 2.2+)│
│ ✅ PRF Support during Authentication│
│                                     │
│ Registration Data                   │
│ Challenge: [hex]                    │
│ PublicKey Options: [JSON]           │
│ Credential: [JSON]                  │
│                                     │
│ Authentication Data (if applicable) │
│ Challenge: [hex]                    │
│ Assertion: [JSON]                   │
│                                     │
│ Encryption Details                  │
│ Algorithm: age-encryption           │
│ Key Derivation: PRF / PBKDF2        │
│ File Hash: [SHA-256]                │
└─────────────────────────────────────┘
```

**State**:
```typescript
technicalDetails: {
  prfSupport: PRFSupport;
  registrationData?: {
    challenge: Uint8Array;
    credential: PublicKeyCredential;
  };
  authenticationData?: {
    challenge: Uint8Array;
    assertion: PublicKeyCredential;
  };
  encryptionMetadata: {
    algorithm: string;
    keyDerivation: string;
    fileHash?: string;
  };
}
showTechnicalDetails: boolean
```

**Implementation**:
- Collapsible accordion component
- Display after credential creation/authentication
- Show PRF status (similar to Corbado demo)
- Display WebAuthn registration/authentication data
- Show encryption metadata
- Format challenge and keys in hex/base64

**Key Function Changes**:
```typescript
// lib/auth/prf-detection.ts - ENHANCE
export interface PRFSupport {
  supportsCreation: boolean;
  supportsAuthentication: boolean;
  returnsPRFValue: boolean; // CTAP 2.2+
  authenticatorInfo?: {
    aaguid?: string;
    attestationType?: string;
  };
}

// Capture and return detailed PRF data
export async function detectPRFSupportDetailed(): Promise<PRFSupport>
```

---

## Implementation Phases

### Phase 1: Remove Auto-Creation & Refactor Workflow (Priority: HIGH)
**Files to Modify**:
1. `app/page.tsx`
   - Remove PRF detection on page load
   - Add workflow state machine
   - Implement Section 1-2 UI
   - Add step navigation

2. `lib/auth/webauthn.ts`
   - Add `authenticateExistingCredential()` function
   - Modify `createCredential()` to accept custom name
   - Remove auto-creation logic

3. `lib/auth/prf-detection.ts`
   - Modify to only detect during actual credential operations
   - Add detailed PRF info capture

**Testing**:
- Verify no credentials created on page load
- Test credential creation with custom name
- Test authentication with external credentials
- Test PRF detection during credential creation

---

### Phase 2: Add Multi-Step UI & State Management (Priority: HIGH)
**Files to Create**:
1. `app/components/workflow/FileUpload.tsx` - Section 1
2. `app/components/workflow/VerifyIdentity.tsx` - Section 2
3. `app/components/workflow/Recipients.tsx` - Section 3
4. `app/components/workflow/Sharing.tsx` - Section 4
5. `app/components/workflow/BundleEditor.tsx` - Section 5
6. `app/components/workflow/TechnicalDetails.tsx` - Section 6
7. `app/components/workflow/StepIndicator.tsx` - Progress bar

**State Management** (Choose One):
- **Option A**: React Context + useReducer (recommended for this scope)
- **Option B**: Zustand (lightweight, easy to implement)
- **Option C**: Keep in page.tsx state (simpler but less scalable)

**Recommended: Option A (React Context)**
```typescript
// app/context/WorkflowContext.tsx
interface WorkflowState {
  currentStep: WorkflowStep;
  file: File | null;
  fileType: 'standard' | 'dpf' | null;
  credential: Credential | null;
  recipients: Recipient[];
  sharingMethod: SharingMethod;
  bundleMetadata: BundleMetadata | null;
  technicalDetails: TechnicalDetails;
}

type WorkflowAction =
  | { type: 'SET_FILE'; payload: File }
  | { type: 'SET_CREDENTIAL'; payload: Credential }
  | { type: 'ADD_RECIPIENT'; payload: Recipient }
  | { type: 'SET_SHARING_METHOD'; payload: SharingMethod }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'RESET' }
```

---

### Phase 3: Recipient Management (Priority: MEDIUM)
**Files to Modify**:
1. `lib/crypto/manifest.ts`
   - Enhance `createManifest()` to accept recipient emails
   - Add recipient validation

2. `app/components/workflow/Recipients.tsx`
   - Email input with validation
   - Recipient list management
   - "Skip" option for no recipients

**Future Extensions** (Phase 2 from FUTURE_PHASES.md):
- Email invitations
- Access requests
- Recipient verification

---

### Phase 4: Sharing Options (Priority: MEDIUM)
**Files to Modify**:
1. `app/components/workflow/Sharing.tsx`
   - Download option (existing)
   - Link sharing with options (existing API)
   - Cloud storage integration (future)

2. `app/api/bundles/route.ts`
   - Add expiration metadata
   - Add max download count
   - Add auth requirement flag

**Files to Create** (Future):
1. `lib/integrations/google-drive.ts`
2. `lib/integrations/dropbox.ts`
3. `lib/integrations/onedrive.ts`

---

### Phase 5: Bundle Editing (Priority: LOW)
**Files to Modify**:
1. `lib/crypto/encryption.ts`
   - Add `reEncryptBundle()` function
   - Handle partial re-encryption

2. `app/components/workflow/BundleEditor.tsx`
   - Edit recipient list → trigger re-encryption
   - Change sharing method → re-upload/download
   - Re-encrypt with different credential

---

### Phase 6: Technical Details Panel (Priority: LOW)
**Files to Create**:
1. `app/components/workflow/TechnicalDetails.tsx`
   - Collapsible panel
   - PRF status display (Corbado-style)
   - Registration/authentication data
   - Encryption metadata

2. `lib/utils/formatting.ts`
   - Hex/base64 formatters
   - JSON pretty-print
   - Data visualization helpers

---

## Data Flow Diagrams

### Encryption Flow (New)
```
┌─────────────────┐
│  File Upload    │
│  (Section 1)    │
└────────┬────────┘
         │
         v
┌─────────────────────────────┐
│  Verify Identity (Section 2)│
│                             │
│  ┌────────────────────┐    │
│  │ Create Credential  │    │
│  │ OR                 │    │
│  │ Use Existing       │    │
│  └────────────────────┘    │
└────────┬────────────────────┘
         │
         v
┌─────────────────┐
│  Add Recipients │
│  (Section 3)    │
│  [Optional]     │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Choose Sharing │
│  (Section 4)    │
│  - Download     │
│  - Cloud        │
│  - Link         │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Bundle Created │
│  (Section 5)    │
│  [Edit Options] │
└─────────────────┘
```

### Decryption Flow (New)
```
┌─────────────────┐
│  Upload .dpf    │
│  (Section 1)    │
└────────┬────────┘
         │
         v
┌─────────────────────────────┐
│  Verify Identity (Section 2)│
│                             │
│  ┌────────────────────┐    │
│  │ Select Stored      │    │
│  │ OR                 │    │
│  │ Auth External      │    │
│  └────────────────────┘    │
└────────┬────────────────────┘
         │
         v
┌─────────────────┐
│  Decrypt File   │
│  Download       │
│  (Complete)     │
└─────────────────┘
```

---

## File Structure Changes

### New Directory Structure
```
app/
├── page.tsx                     # MODIFY: Workflow orchestrator
├── layout.tsx                   # MODIFY: Add WorkflowProvider
├── components/
│   └── workflow/               # NEW DIRECTORY
│       ├── FileUpload.tsx      # NEW: Section 1
│       ├── VerifyIdentity.tsx  # NEW: Section 2
│       ├── Recipients.tsx      # NEW: Section 3
│       ├── Sharing.tsx         # NEW: Section 4
│       ├── BundleEditor.tsx    # NEW: Section 5
│       ├── TechnicalDetails.tsx # NEW: Section 6
│       └── StepIndicator.tsx   # NEW: Progress bar
├── context/                    # NEW DIRECTORY
│   └── WorkflowContext.tsx     # NEW: State management
└── api/
    └── bundles/
        └── route.ts            # MODIFY: Add link options

lib/
├── auth/
│   ├── webauthn.ts            # MODIFY: Add auth existing, custom names
│   ├── prf-detection.ts       # MODIFY: Remove auto-detection
│   └── fallback.ts            # No changes needed
├── crypto/
│   ├── encryption.ts          # MODIFY: Add reEncryptBundle
│   ├── bundle.ts              # MODIFY: Enhanced parseBundle
│   └── manifest.ts            # MODIFY: Add recipient emails
├── integrations/              # NEW DIRECTORY (Future)
│   ├── google-drive.ts        # NEW: Google Drive integration
│   ├── dropbox.ts             # NEW: Dropbox integration
│   └── onedrive.ts            # NEW: OneDrive integration
└── utils/                     # NEW DIRECTORY
    └── formatting.ts          # NEW: Data formatting helpers
```

---

## API Changes

### Modified Endpoints

#### POST /api/bundles (Enhanced)
**Before**:
```typescript
{
  bundleData: string; // base64
  metadata: {
    fileName: string;
    fileType: string;
    encryptedAt: string;
  }
}
```

**After**:
```typescript
{
  bundleData: string; // base64
  metadata: {
    fileName: string;
    fileType: string;
    encryptedAt: string;
    recipients?: string[]; // NEW
  },
  linkOptions?: {          // NEW
    expiresAt?: string;
    maxDownloads?: number;
    requireAuth?: boolean;
  }
}
```

---

## Testing Strategy

### Unit Tests (Vitest)
1. **Credential Creation**:
   - Test custom credential names
   - Test PRF detection during creation (not on load)
   - Verify no auto-creation

2. **Credential Authentication**:
   - Test external credential authentication
   - Test IndexedDB stored credentials
   - Verify credential selection

3. **Workflow State**:
   - Test state transitions
   - Test step navigation (next/prev)
   - Test reset functionality

4. **Encryption with Recipients**:
   - Test manifest creation with recipients
   - Test policy generation
   - Verify dissem list

5. **Bundle Re-encryption**:
   - Test recipient changes
   - Test credential changes
   - Verify manifest versioning

### Integration Tests (Future)
1. Full encryption workflow
2. Full decryption workflow
3. External credential flow
4. Link sharing flow

### E2E Tests (Playwright - Future)
1. Complete user journeys
2. WebAuthn mocking
3. File upload/download verification

---

## Migration Plan

### Breaking Changes
None - This is a UI/UX refactor with backward compatibility.

### User Impact
- **Positive**: Better workflow, no auto-credential creation
- **Neutral**: Existing encrypted files still work
- **No Data Loss**: All existing credentials and bundles remain functional

### Rollback Strategy
- Keep old page.tsx as `page.legacy.tsx`
- Feature flag in environment variable: `USE_NEW_WORKFLOW=true`
- Quick rollback by reverting single commit

---

## Success Criteria

### Must Have (MVP)
- [x] No auto-credential creation on page load
- [x] Users can create new credentials with custom names
- [x] Users can authenticate with existing credentials from password managers
- [x] Multi-step workflow with clear navigation
- [x] File type detection and routing (encrypt vs decrypt)
- [x] Recipient email list (basic)
- [x] Download sharing option
- [x] Link sharing with existing API

### Should Have (Phase 2)
- [ ] Cloud storage integration (Google Drive)
- [ ] Bundle editing after creation
- [ ] Technical details panel (PRF status)
- [ ] Recipient email validation
- [ ] Link expiration options

### Could Have (Future)
- [ ] Email invitations to recipients
- [ ] Access request workflow
- [ ] ABAC policy UI
- [ ] Batch operations
- [ ] Offline support

---

## Implementation Timeline

### Week 1: Foundation
- Day 1-2: Remove auto-creation, refactor credential management
- Day 3-4: Create workflow context and state management
- Day 5: Implement Section 1 (File Upload)

### Week 2: Core Workflow
- Day 1-2: Implement Section 2 (Verify Identity)
- Day 3: Implement Section 3 (Recipients)
- Day 4: Implement Section 4 (Sharing)
- Day 5: Testing and bug fixes

### Week 3: Polish & Enhancement
- Day 1-2: Implement Section 5 (Bundle Editor)
- Day 3: Implement Section 6 (Technical Details)
- Day 4-5: E2E testing, documentation, deployment

---

## Risk Assessment

### High Risk
1. **WebAuthn Compatibility**: External credential authentication may not work on all platforms
   - **Mitigation**: Extensive device testing, fallback to stored credentials

2. **State Management Complexity**: Multi-step workflow adds complexity
   - **Mitigation**: Use proven patterns (Context + Reducer), comprehensive testing

### Medium Risk
1. **Browser Credential Picker**: Different browsers show different UIs
   - **Mitigation**: Clear user instructions, platform-specific guidance

2. **Re-encryption Performance**: Large files may take time to re-encrypt
   - **Mitigation**: Progress indicators, consider Web Workers for large files

### Low Risk
1. **UI/UX Changes**: Users may be confused by new workflow
   - **Mitigation**: Clear step indicators, help text, optional tutorial

---

## Open Questions

1. **Q**: Should we persist workflow state to IndexedDB (for page refresh recovery)?
   **A**: Phase 2 - Nice to have, but not MVP

2. **Q**: How to handle credential name conflicts (multiple files with same name)?
   **A**: Append timestamp or UUID to credential name

3. **Q**: Should decryption also support external credentials?
   **A**: Yes - Critical for cross-device access

4. **Q**: What happens if user closes browser mid-workflow?
   **A**: MVP: Lost state. Phase 2: Persist to IndexedDB

5. **Q**: Should we validate recipient emails?
   **A**: Basic regex validation in MVP, email verification in Phase 2

---

## Next Steps

1. Review and approve this plan
2. Create feature branch: `claude/workflow-redesign-kxJ3H`
3. Implement Phase 1 (Foundation)
4. PR and review
5. Iterate through remaining phases

---

## References

- [Corbado PRF Demo](https://webauthn-passkeys-prf-demo.explore.corbado.com/)
- [WebAuthn Spec](https://www.w3.org/TR/webauthn-2/)
- [age Encryption Spec](https://c2sp.org/age)
- [OpenTDF Manifest](https://opentdf.io/spec/schema/opentdf/manifest)
- Current codebase: `/home/user/doc-protect/`

---

**Document Version**: 1.0
**Last Updated**: 2026-01-01
**Author**: Claude (AI Assistant)
**Status**: Ready for Implementation
