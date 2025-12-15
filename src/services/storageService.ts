import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import logger from '../utils/logger';

// ============================================
// Storage Interface
// ============================================

export interface IStorageService {
  upload(file: Buffer | string, filename: string, folder?: string): Promise<string>;
  delete(filepath: string): Promise<boolean>;
  getUrl(filepath: string): string;
  exists(filepath: string): Promise<boolean>;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

// ============================================
// Local Storage Service
// ============================================

class LocalStorageService implements IStorageService {
  private uploadDir: string;
  private baseUrl: string;

  constructor() {
    this.uploadDir = path.resolve(config.upload.uploadDir);
    this.baseUrl = config.apiUrl;

    // Ensure upload directory exists
    this.ensureDirectoryExists(this.uploadDir);
  }

  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created upload directory', { dir });
    }
  }

  async upload(file: Buffer | string, filename: string, folder?: string): Promise<string> {
    const targetDir = folder
      ? path.join(this.uploadDir, folder)
      : this.uploadDir;

    this.ensureDirectoryExists(targetDir);

    // Generate unique filename
    const ext = path.extname(filename);
    const uniqueFilename = `${uuidv4()}${ext}`;
    const filepath = path.join(targetDir, uniqueFilename);

    // Write file
    if (typeof file === 'string') {
      // File is a path - copy it
      fs.copyFileSync(file, filepath);
    } else {
      // File is a buffer - write it
      fs.writeFileSync(filepath, file);
    }

    // Return relative path
    const relativePath = path.relative(this.uploadDir, filepath);
    logger.debug('File uploaded locally', { filepath: relativePath });

    return relativePath;
  }

  async delete(filepath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.uploadDir, filepath);

      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        logger.debug('File deleted', { filepath });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to delete file', { filepath, error });
      return false;
    }
  }

  getUrl(filepath: string): string {
    return `${this.baseUrl}/uploads/${filepath}`;
  }

  async exists(filepath: string): Promise<boolean> {
    const fullPath = path.join(this.uploadDir, filepath);
    return fs.existsSync(fullPath);
  }
}

// ============================================
// S3 Storage Service (for future use)
// ============================================

class S3StorageService implements IStorageService {
  // AWS S3 client would be initialized here
  // private s3: S3Client;
  // private bucket: string;

  constructor() {
    // Initialize S3 client
    // this.s3 = new S3Client({
    //   region: config.upload.s3.region,
    //   credentials: {
    //     accessKeyId: config.upload.s3.accessKeyId,
    //     secretAccessKey: config.upload.s3.secretAccessKey,
    //   },
    // });
    // this.bucket = config.upload.s3.bucket;

    logger.info('S3 storage service initialized (placeholder)');
  }

  async upload(file: Buffer | string, filename: string, folder?: string): Promise<string> {
    // S3 upload implementation would go here
    // const key = folder ? `${folder}/${uuidv4()}${path.extname(filename)}` : `${uuidv4()}${path.extname(filename)}`;
    //
    // await this.s3.send(new PutObjectCommand({
    //   Bucket: this.bucket,
    //   Key: key,
    //   Body: typeof file === 'string' ? fs.readFileSync(file) : file,
    //   ContentType: getMimeType(filename),
    // }));
    //
    // return key;

    throw new Error('S3 storage not implemented yet');
  }

  async delete(filepath: string): Promise<boolean> {
    // S3 delete implementation
    // await this.s3.send(new DeleteObjectCommand({
    //   Bucket: this.bucket,
    //   Key: filepath,
    // }));
    // return true;

    throw new Error('S3 storage not implemented yet');
  }

  getUrl(filepath: string): string {
    // Return S3 URL or CloudFront URL
    // return `https://${this.bucket}.s3.${config.upload.s3.region}.amazonaws.com/${filepath}`;
    // Or with CloudFront:
    // return `https://${config.cloudfront.domain}/${filepath}`;

    throw new Error('S3 storage not implemented yet');
  }

  async exists(filepath: string): Promise<boolean> {
    // S3 head object implementation
    // try {
    //   await this.s3.send(new HeadObjectCommand({
    //     Bucket: this.bucket,
    //     Key: filepath,
    //   }));
    //   return true;
    // } catch {
    //   return false;
    // }

    throw new Error('S3 storage not implemented yet');
  }
}

// ============================================
// Storage Service Factory
// ============================================

class StorageService {
  private storage: IStorageService;

  constructor() {
    // Use S3 if configured, otherwise use local storage
    if (config.upload.s3.enabled) {
      this.storage = new S3StorageService();
      logger.info('Using S3 storage');
    } else {
      this.storage = new LocalStorageService();
      logger.info('Using local storage');
    }
  }

  /**
   * Upload a file from buffer or path
   */
  async uploadFile(
    file: Buffer | string,
    filename: string,
    folder?: string
  ): Promise<UploadResult> {
    try {
      const filepath = await this.storage.upload(file, filename, folder);
      const url = this.storage.getUrl(filepath);

      return {
        success: true,
        url,
        path: filepath,
      };
    } catch (error) {
      logger.error('File upload failed', { filename, error });
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Upload a file from Express multer
   */
  async uploadMulterFile(
    file: Express.Multer.File,
    folder?: string
  ): Promise<UploadResult> {
    if (file.buffer) {
      return this.uploadFile(file.buffer, file.originalname, folder);
    } else if (file.path) {
      return this.uploadFile(file.path, file.originalname, folder);
    }

    return { success: false, error: 'Invalid file' };
  }

  /**
   * Delete a file
   */
  async deleteFile(filepath: string): Promise<boolean> {
    return this.storage.delete(filepath);
  }

  /**
   * Get public URL for a file
   */
  getFileUrl(filepath: string): string {
    return this.storage.getUrl(filepath);
  }

  /**
   * Check if file exists
   */
  async fileExists(filepath: string): Promise<boolean> {
    return this.storage.exists(filepath);
  }

  /**
   * Upload avatar
   */
  async uploadAvatar(file: Buffer | Express.Multer.File, userId: string): Promise<UploadResult> {
    const buffer = file instanceof Buffer ? file : (file as Express.Multer.File).buffer;
    const originalname = file instanceof Buffer ? 'avatar.jpg' : (file as Express.Multer.File).originalname;

    if (!buffer) {
      return { success: false, error: 'Invalid avatar file' };
    }

    return this.uploadFile(buffer, originalname, 'avatars');
  }

  /**
   * Upload document
   */
  async uploadDocument(
    file: Buffer | Express.Multer.File,
    documentType: string
  ): Promise<UploadResult> {
    const buffer = file instanceof Buffer ? file : (file as Express.Multer.File).buffer;
    const originalname = file instanceof Buffer ? `document.pdf` : (file as Express.Multer.File).originalname;

    if (!buffer) {
      return { success: false, error: 'Invalid document file' };
    }

    return this.uploadFile(buffer, originalname, `documents/${documentType}`);
  }

  /**
   * Get allowed file types
   */
  getAllowedTypes(): string[] {
    return config.upload.allowedTypes;
  }

  /**
   * Get max file size
   */
  getMaxFileSize(): number {
    return config.upload.maxFileSize;
  }

  /**
   * Validate file type
   */
  isAllowedType(mimetype: string): boolean {
    return config.upload.allowedTypes.includes(mimetype);
  }

  /**
   * Validate file size
   */
  isAllowedSize(size: number): boolean {
    return size <= config.upload.maxFileSize;
  }
}

// Export singleton instance
export const storageService = new StorageService();
export default storageService;
