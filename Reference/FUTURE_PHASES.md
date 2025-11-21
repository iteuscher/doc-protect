# Future Development Phases

This document outlines planned improvements and features for DocProtect beyond the current MVP.

## Current Status: MVP (v0.1.0)

The current implementation includes:
- WebAuthn PRF detection and fallback
- Local file encryption/decryption
- Credential management (IndexedDB)
- Unified encrypt/decrypt UI
- Bundle format (.dpf) with manifest
- Basic API routes (Supabase integration)
- Unit tests

## Phase 2: Enhanced Access Control

### 2.1 Recipient Management

**Goal**: Allow owners to add/remove recipients after encryption

**Features**:
- Add recipients to existing bundles (requires re-encryption)
- Remove recipients (true revocation via re-encryption)
- Share bundle links with access tokens
- Recipient access request workflow

**Implementation Notes**:
- Extend `addRecipient()` and `removeRecipient()` in `lib/crypto/encryption.ts`
- Add UI for recipient management
- Implement access token generation/validation
- Update manifest versioning on changes

**Estimated Effort**: 2-3 weeks

### 2.2 Access Request System

**Goal**: Allow recipients to request access to bundles

**Features**:
- Recipient-initiated access requests
- Owner approval/denial workflow
- Email notifications (optional)
- Access history logging

**Implementation Notes**:
- Extend Supabase schema with `access_requests` table
- Add API routes: `POST /api/bundles/[id]/request-access`
- Add owner dashboard for managing requests
- Integrate with email service (SendGrid, Resend, etc.)

**Estimated Effort**: 2-3 weeks

## Phase 3: Attribute-Based Access Control (ABAC)

### 3.1 ABAC Policy Engine

**Goal**: Implement fine-grained access control based on user attributes

**Features**:
- Define data attributes (clearance levels, departments, etc.)
- Create ABAC rules (hierarchy, allOf, anyOf)
- Evaluate policies during decryption
- Attribute-based recipient matching

**Implementation Notes**:
- Implement `createABACPolicy()` in `lib/crypto/manifest.ts`
- Build policy evaluation engine
- Add attribute management UI
- Integrate with identity providers for attribute claims

**Estimated Effort**: 4-6 weeks

### 3.2 Identity Provider Integration

**Goal**: Support SSO and identity providers for attribute claims

**Features**:
- OAuth2/OIDC integration (Google, Microsoft, Okta)
- SAML support (enterprise)
- Attribute mapping from IdP claims
- Multi-tenant support

**Implementation Notes**:
- Add auth libraries (NextAuth.js, Auth0, etc.)
- Create attribute mapping layer
- Extend credential types to include IdP tokens
- Add SSO login flow

**Estimated Effort**: 4-6 weeks

## Phase 4: Advanced Features

### 4.1 Streaming Encryption

**Goal**: Support very large files without memory issues

**Features**:
- Stream-based encryption/decryption
- Progress indicators for large files
- Chunked upload/download
- Resume interrupted operations

**Implementation Notes**:
- Use `ReadableStream` API (typage supports this)
- Implement chunked processing
- Add progress callbacks
- Handle browser memory limits gracefully

**Estimated Effort**: 2-3 weeks

### 4.2 Batch Operations

**Goal**: Encrypt/decrypt multiple files at once

**Features**:
- Multi-file selection
- Batch encryption with same credential
- Batch decryption
- Progress tracking per file

**Implementation Notes**:
- Extend UI for file selection
- Queue management for batch operations
- Parallel processing (with limits)
- Error handling per file

**Estimated Effort**: 1-2 weeks

### 4.3 Offline Support

**Goal**: Work completely offline (encryption/decryption)

**Features**:
- Service Worker for offline capability
- Cache encrypted bundles locally
- Offline credential management
- Sync when online

**Implementation Notes**:
- Implement Service Worker
- Add IndexedDB caching strategy
- Background sync API
- Conflict resolution

**Estimated Effort**: 3-4 weeks

## Phase 5: Enterprise Features

### 5.1 Audit Logging

**Goal**: Complete audit trail for compliance

**Features**:
- Log all encryption/decryption events
- Track access attempts (success/failure)
- Policy change history
- Export audit logs

**Implementation Notes**:
- Extend Supabase schema with `audit_logs` table
- Add logging middleware
- Create audit dashboard
- Implement log retention policies

**Estimated Effort**: 2-3 weeks

### 5.2 Key Rotation

**Goal**: Rotate encryption keys without re-encrypting all files

**Features**:
- Key rotation policies
- Automatic key rotation
- Backward compatibility
- Rotation history

**Implementation Notes**:
- Implement key wrapping/unwrapping
- Add rotation API endpoints
- Create rotation scheduler
- Handle legacy keys

**Estimated Effort**: 3-4 weeks

### 5.3 Compliance & Reporting

**Goal**: Meet regulatory requirements (GDPR, HIPAA, etc.)

**Features**:
- Data retention policies
- Right to deletion
- Access reports
- Compliance dashboards

**Implementation Notes**:
- Add policy management UI
- Implement data deletion workflows
- Create reporting engine
- Export compliance reports

**Estimated Effort**: 4-6 weeks

## Phase 6: Developer Experience

### 6.1 CLI Tool

**Goal**: Command-line interface for power users

**Features**:
- Encrypt/decrypt from terminal
- Batch operations
- Script automation
- Integration with CI/CD

**Implementation Notes**:
- Create Node.js CLI package
- Reuse core encryption logic
- Add command parsing (Commander.js)
- Publish to npm

**Estimated Effort**: 2-3 weeks

### 6.2 SDK/API

**Goal**: Programmatic access for integrations

**Features**:
- RESTful API documentation
- JavaScript/TypeScript SDK
- Webhook support
- Rate limiting

**Implementation Notes**:
- Document all API endpoints
- Create SDK package
- Add webhook infrastructure
- Implement rate limiting

**Estimated Effort**: 3-4 weeks

### 6.3 Browser Extension

**Goal**: Encrypt files from file manager context menu

**Features**:
- Right-click encryption
- Browser integration
- Quick access to recent files
- System tray integration

**Implementation Notes**:
- Create browser extension (Chrome, Firefox)
- Implement native messaging
- Add context menu handlers
- Sync with web app

**Estimated Effort**: 4-6 weeks

## Phase 7: Mobile Support

### 7.1 Mobile Web App

**Goal**: Optimize for mobile browsers

**Features**:
- Responsive UI improvements
- Touch-optimized interactions
- Mobile file picker
- Camera integration (scan documents)

**Implementation Notes**:
- Enhance mobile CSS
- Add touch gestures
- Optimize for small screens
- Test on iOS/Android

**Estimated Effort**: 2-3 weeks

### 7.2 Native Mobile Apps

**Goal**: Native iOS and Android apps

**Features**:
- Native file system access
- Platform-specific WebAuthn
- Push notifications
- Offline-first architecture

**Implementation Notes**:
- React Native or native development
- Platform WebAuthn APIs
- File system integration
- Background sync

**Estimated Effort**: 8-12 weeks

## Technical Debt & Improvements

### Code Quality

- [ ] Add E2E tests with Playwright (currently skipped)
- [ ] Improve error messages and user feedback
- [ ] Add loading states and progress indicators
- [ ] Implement retry logic for network operations
- [ ] Add JSDoc comments

### Performance

- [ ] Optimize bundle parsing (lazy loading)
- [ ] Implement virtual scrolling for large file lists
- [ ] Add bundle compression optimization
- [ ] Cache manifest parsing results
- [ ] Optimize IndexedDB queries

### Security

- [ ] Add Content Security Policy (CSP)
- [ ] Implement rate limiting on API routes
- [ ] Add input validation and sanitization
- [ ] Security audit of dependencies
- [ ] Penetration testing

### Documentation

- [ ] API documentation (OpenAPI/Swagger)
- [ ] Architecture decision records (ADRs)
- [ ] Deployment guides
- [ ] Troubleshooting guides
- [ ] Video tutorials

## Migration Paths

### From MVP to Phase 2

1. Update bundle manifest schema (add version field)
2. Implement recipient management APIs
3. Add UI for recipient management
4. Migrate existing bundles (if any)

### From Phase 2 to Phase 3

1. Extend manifest schema for ABAC
2. Implement policy evaluation engine
3. Add attribute management
4. Migrate existing policies

### Backward Compatibility

- All phases maintain backward compatibility with `.dpf` format
- Manifest versioning ensures old bundles still work
- Graceful degradation for missing features

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on contributing to future phases.

## Questions?

For questions about future phases, open an issue or contact the maintainers.

