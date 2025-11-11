import { Router } from 'express';
import { Database } from '../db/database';
import { randomUUID } from 'crypto';

const router = Router();
const db = new Database();

// Request access to a file
router.post('/request', async (req, res) => {
  try {
    const { fileId, publicKey, requesterInfo } = req.body;

    if (!fileId || !publicKey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify file exists
    const file = await db.get('SELECT id FROM files WHERE id = ?', [fileId]);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const requestId = randomUUID();
    const now = Date.now();

    await db.run(
      `INSERT INTO access_requests (id, file_id, requester_public_key, requester_info, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [requestId, fileId, publicKey, requesterInfo || null, now]
    );

    res.json({ requestId });
  } catch (error) {
    console.error('Error creating access request:', error);
    res.status(500).json({ error: 'Failed to create access request' });
  }
});

// Get pending requests for a file
router.get('/requests/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { ownerIdentity } = req.query;

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

    const requests = await db.all(
      `SELECT id, file_id, requester_public_key, requester_info, status, created_at
       FROM access_requests
       WHERE file_id = ? AND status = 'pending'
       ORDER BY created_at DESC`,
      [fileId]
    );

    res.json(requests);
  } catch (error) {
    console.error('Error getting access requests:', error);
    res.status(500).json({ error: 'Failed to get access requests' });
  }
});

// Approve access request
router.post('/approve', async (req, res) => {
  try {
    const { requestId, fileId, ownerIdentity } = req.body;

    if (!requestId || !fileId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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

    // Get the request
    const request = await db.get<{ requester_public_key: string }>(
      'SELECT requester_public_key FROM access_requests WHERE id = ? AND file_id = ?',
      [requestId, fileId]
    );

    if (!request) {
      return res.status(404).json({ error: 'Access request not found' });
    }

    // Update request status
    await db.run(
      "UPDATE access_requests SET status = 'approved' WHERE id = ?",
      [requestId]
    );

    // Add recipient to file
    await db.run(
      `INSERT OR IGNORE INTO file_recipients (file_id, recipient_public_key, recipient_type, added_at)
       VALUES (?, ?, 'x25519', ?)`,
      [fileId, request.requester_public_key, Date.now()]
    );

    // Update file metadata to include new recipient
    const fileData = await db.get<{ metadata: string }>(
      'SELECT metadata FROM files WHERE id = ?',
      [fileId]
    );
    const metadata = JSON.parse(fileData!.metadata);
    if (!metadata.recipients) {
      metadata.recipients = [];
    }
    if (!metadata.recipients.includes(request.requester_public_key)) {
      metadata.recipients.push(request.requester_public_key);
    }
    metadata.updatedAt = Date.now();

    await db.run('UPDATE files SET metadata = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify(metadata),
      Date.now(),
      fileId,
    ]);

    res.json({ updatedFileId: fileId });
  } catch (error) {
    console.error('Error approving access request:', error);
    res.status(500).json({ error: 'Failed to approve access request' });
  }
});

// Deny access request
router.post('/deny', async (req, res) => {
  try {
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'Missing requestId' });
    }

    await db.run(
      "UPDATE access_requests SET status = 'denied' WHERE id = ?",
      [requestId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error denying access request:', error);
    res.status(500).json({ error: 'Failed to deny access request' });
  }
});

export default router;

