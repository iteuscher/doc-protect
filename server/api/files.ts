import { Router } from 'express';
import { Database } from '../db/database';
import { ObjectStorage } from '../storage/object-storage';
import { randomUUID } from 'crypto';

const router = Router();
const db = new Database();
const storage = new ObjectStorage();

interface FileMetadata {
  name: string;
  size: number;
  type: string;
  recipients: string[];
  createdAt: number;
  updatedAt: number;
}

// Upload encrypted file
router.post('/', async (req, res) => {
  try {
    const { encryptedBlob, metadata, ownerIdentity } = req.body;

    if (!encryptedBlob || !metadata || !ownerIdentity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const fileId = randomUUID();
    const now = Date.now();

    // Store encrypted blob
    await storage.store(fileId, encryptedBlob);

    // Store metadata in database
    await db.run(
      `INSERT INTO files (id, owner_identity, encrypted_blob_path, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fileId, ownerIdentity, `${fileId}.age`, JSON.stringify(metadata), now, now]
    );

    // Store recipients
    if (metadata.recipients && Array.isArray(metadata.recipients)) {
      for (const recipient of metadata.recipients) {
        await db.run(
          `INSERT INTO file_recipients (file_id, recipient_public_key, recipient_type, added_at)
           VALUES (?, ?, ?, ?)`,
          [fileId, recipient, 'x25519', now]
        );
      }
    }

    res.json({ fileId });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Download encrypted file
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    const file = await db.get<{
      id: string;
      encrypted_blob_path: string;
      metadata: string;
    }>('SELECT * FROM files WHERE id = ?', [fileId]);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const encryptedBlob = await storage.retrieve(fileId);
    const metadata = JSON.parse(file.metadata);

    res.json({
      encryptedBlob,
      metadata,
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Delete file
router.delete('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { ownerIdentity } = req.body;

    // Verify ownership
    const file = await db.get<{ owner_identity: string }>(
      'SELECT owner_identity FROM files WHERE id = ?',
      [fileId]
    );

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.owner_identity !== ownerIdentity) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete from storage
    await storage.delete(fileId);

    // Delete from database (cascade will handle related records)
    await db.run('DELETE FROM files WHERE id = ?', [fileId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Get file metadata
router.get('/:fileId/metadata', async (req, res) => {
  try {
    const { fileId } = req.params;

    const file = await db.get<{ metadata: string }>(
      'SELECT metadata FROM files WHERE id = ?',
      [fileId]
    );

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const metadata = JSON.parse(file.metadata);
    res.json(metadata);
  } catch (error) {
    console.error('Error getting metadata:', error);
    res.status(500).json({ error: 'Failed to get metadata' });
  }
});

// Update file metadata
router.put('/:fileId/metadata', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { metadata, ownerIdentity } = req.body;

    // Verify ownership
    const file = await db.get<{ owner_identity: string }>(
      'SELECT owner_identity FROM files WHERE id = ?',
      [fileId]
    );

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.owner_identity !== ownerIdentity) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get existing metadata and merge
    const existing = await db.get<{ metadata: string }>(
      'SELECT metadata FROM files WHERE id = ?',
      [fileId]
    );

    const existingMetadata = JSON.parse(existing!.metadata);
    const updatedMetadata = { ...existingMetadata, ...metadata, updatedAt: Date.now() };

    await db.run('UPDATE files SET metadata = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify(updatedMetadata),
      Date.now(),
      fileId,
    ]);

    res.json(updatedMetadata);
  } catch (error) {
    console.error('Error updating metadata:', error);
    res.status(500).json({ error: 'Failed to update metadata' });
  }
});

export default router;

