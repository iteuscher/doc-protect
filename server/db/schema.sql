-- Files table
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  owner_identity TEXT NOT NULL,
  encrypted_blob_path TEXT NOT NULL,
  metadata TEXT NOT NULL, -- JSON string
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Access requests table
CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  requester_public_key TEXT NOT NULL,
  requester_info TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'denied'
  created_at INTEGER NOT NULL,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- File recipients table
CREATE TABLE IF NOT EXISTS file_recipients (
  file_id TEXT NOT NULL,
  recipient_public_key TEXT NOT NULL,
  recipient_type TEXT NOT NULL, -- 'x25519', 'webauthn'
  added_at INTEGER NOT NULL,
  PRIMARY KEY (file_id, recipient_public_key),
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_identity);
CREATE INDEX IF NOT EXISTS idx_access_requests_file ON access_requests(file_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_file_recipients_file ON file_recipients(file_id);

