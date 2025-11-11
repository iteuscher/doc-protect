import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const STORAGE_PATH = process.env.STORAGE_PATH || './storage';

export class ObjectStorage {
  private basePath: string;

  constructor() {
    this.basePath = STORAGE_PATH;
    this.ensureDirectory();
  }

  private async ensureDirectory(): Promise<void> {
    if (!existsSync(this.basePath)) {
      await mkdir(this.basePath, { recursive: true });
    }
  }

  async store(fileId: string, data: string): Promise<string> {
    const filePath = join(this.basePath, `${fileId}.age`);
    await writeFile(filePath, data, 'utf-8');
    return filePath;
  }

  async retrieve(fileId: string): Promise<string> {
    const filePath = join(this.basePath, `${fileId}.age`);
    const data = await readFile(filePath, 'utf-8');
    return data;
  }

  async delete(fileId: string): Promise<void> {
    const filePath = join(this.basePath, `${fileId}.age`);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  }

  exists(fileId: string): boolean {
    const filePath = join(this.basePath, `${fileId}.age`);
    return existsSync(filePath);
  }
}

