import multer, { FileFilterCallback } from 'multer';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';

const storage = multer.memoryStorage();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fileFilter = (_req: any, file: Express.Multer.File, cb: FileFilterCallback): void => {
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(
      new AppError(
        StatusCodes.BAD_REQUEST,
        'Only images and PDF files are allowed!',
      ) as unknown as null,
      false,
    );
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});
