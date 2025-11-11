/**
 * Creates a share link with recipient public keys as URL parameters
 */
export function createShareLink(
  recipients: string[],
  fileId?: string,
  baseUrl?: string
): string {
  const url = new URL(baseUrl || window.location.origin + window.location.pathname);
  
  // Add each recipient as a separate ?r= parameter
  recipients.forEach(recipient => {
    url.searchParams.append('r', recipient);
  });
  
  // Add file ID if provided
  if (fileId) {
    url.searchParams.set('file', fileId);
  }
  
  return url.toString();
}

/**
 * Creates a receive mode link for easy key generation
 */
export function createReceiveModeLink(baseUrl?: string): string {
  const url = new URL(baseUrl || window.location.origin + window.location.pathname);
  url.searchParams.set('receive_mode', '1');
  return url.toString();
}

export interface AccessRequest {
  id: string;
  fileId: string;
  requesterPublicKey: string;
  requesterInfo?: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
}

/**
 * Requests access to a file (for cloud/server mode)
 */
export async function requestAccess(
  fileId: string,
  publicKey: string,
  requesterInfo?: string,
  apiBaseUrl?: string
): Promise<AccessRequest> {
  const response = await fetch(`${apiBaseUrl || ''}/api/access/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileId,
      publicKey,
      requesterInfo,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to request access: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Approves an access request and re-encrypts the file with the new recipient
 */
export async function approveAccessRequest(
  requestId: string,
  fileId: string,
  apiBaseUrl?: string
): Promise<{ updatedFileId: string }> {
  const response = await fetch(`${apiBaseUrl || ''}/api/access/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId,
      fileId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to approve access: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Denies an access request
 */
export async function denyAccessRequest(
  requestId: string,
  apiBaseUrl?: string
): Promise<void> {
  const response = await fetch(`${apiBaseUrl || ''}/api/access/deny`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to deny access: ${response.statusText}`);
  }
}

/**
 * Gets pending access requests for a file
 */
export async function getAccessRequests(
  fileId: string,
  apiBaseUrl?: string
): Promise<AccessRequest[]> {
  const response = await fetch(`${apiBaseUrl || ''}/api/access/requests/${fileId}`);

  if (!response.ok) {
    throw new Error(`Failed to get access requests: ${response.statusText}`);
  }

  return response.json();
}

