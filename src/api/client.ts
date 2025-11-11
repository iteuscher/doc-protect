import { FileMetadata } from '../files/file-manager';

export interface UploadFileRequest {
  encryptedBlob: string;
  metadata: FileMetadata;
  ownerIdentity: string;
}

export interface UploadFileResponse {
  fileId: string;
  uploadUrl?: string;
}

export interface DownloadFileResponse {
  encryptedBlob: string;
  metadata: FileMetadata;
}

/**
 * API client for Doc Protect server endpoints
 */
export class DocProtectAPI {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Uploads an encrypted file blob to the server
   */
  async uploadEncryptedFile(
    request: UploadFileRequest
  ): Promise<UploadFileResponse> {
    const response = await fetch(`${this.baseUrl}/api/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Downloads an encrypted file blob from the server
   */
  async downloadEncryptedFile(fileId: string): Promise<DownloadFileResponse> {
    const response = await fetch(`${this.baseUrl}/api/files/${fileId}`);

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Deletes a file from the server
   */
  async deleteFile(fileId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/files/${fileId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete file: ${response.statusText}`);
    }
  }

  /**
   * Gets file metadata
   */
  async getFileMetadata(fileId: string): Promise<FileMetadata> {
    const response = await fetch(`${this.baseUrl}/api/files/${fileId}/metadata`);

    if (!response.ok) {
      throw new Error(`Failed to get file metadata: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Updates file metadata
   */
  async updateFileMetadata(
    fileId: string,
    metadata: Partial<FileMetadata>
  ): Promise<FileMetadata> {
    const response = await fetch(`${this.baseUrl}/api/files/${fileId}/metadata`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      throw new Error(`Failed to update file metadata: ${response.statusText}`);
    }

    return response.json();
  }
}

