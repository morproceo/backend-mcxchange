import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { Request } from 'express';

// Ensure upload directories exist
const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Configure storage for documents
const documentStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    ensureDir(config.upload.uploadDir);
    cb(null, config.upload.uploadDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  },
});

// Configure storage for avatars
const avatarStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const avatarDir = path.join(config.upload.uploadDir, 'avatars');
    ensureDir(avatarDir);
    cb(null, avatarDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  },
});

// Legacy storage (for backward compatibility)
const storage = documentStorage;

// File filter
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowedTypes: string[] = config.upload.allowedTypes;
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
  },
});

// Single file upload
export const uploadSingle = upload.single('file');

// Multiple files upload (max 10)
export const uploadMultiple = upload.array('files', 10);

// Fields upload for specific document types
export const uploadDocuments = upload.fields([
  { name: 'insurance', maxCount: 1 },
  { name: 'uccFiling', maxCount: 1 },
  { name: 'authority', maxCount: 1 },
  { name: 'safetyRecord', maxCount: 1 },
  { name: 'other', maxCount: 5 },
]);

// Image filter for avatars
const imageFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed for avatars'));
  }
};

// Avatar upload multer instance
const avatarMulter = multer({
  storage: avatarStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max for avatars
  },
});

// Avatar upload middleware
export const avatarUpload = avatarMulter.single('avatar');

export default upload;
