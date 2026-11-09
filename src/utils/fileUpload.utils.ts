import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/config/env';
import { AppError } from '@/utils/AppError';
import { StatusCodes } from 'http-status-codes';
import { logger } from '@/utils/logger';

// Configure Cloudinary if credentials are available
const cloudName = env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
const apiKey =
  env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEYS;
const apiSecret =
  env.CLOUDINARY_API_SECRET ||
  process.env.CLOUDINARY_API_SECRET ||
  process.env.CLOUDINARY_SECRET_KEYS;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

/**
 * Uploads a file to AWS S3 if credentials are active, otherwise defaults to Cloudinary.
 *
 * @param file Express.Multer.File object (memoryStorage buffer)
 * @param folder Target directory/folder path
 * @returns Promise<string> Secure public URL of uploaded file
 */
export const uploadToStorage = async (
  file: Express.Multer.File,
  folder = 'k10_uploads',
): Promise<string> => {
  if (!file || !file.buffer) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'No file buffer provided for upload');
  }

  const awsAccessKeyId = env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const awsBucketName = env.AWS_BUCKET_NAME || process.env.AWS_BUCKET_NAME;
  const awsRegion = env.AWS_REGION || process.env.AWS_REGION || 'us-east-1';

  const isS3Enabled = Boolean(
    awsAccessKeyId &&
    awsAccessKeyId.trim() !== '' &&
    awsSecretAccessKey &&
    awsSecretAccessKey.trim() !== '' &&
    awsBucketName &&
    awsBucketName.trim() !== '',
  );

  if (isS3Enabled) {
    try {
      // ----------------------------------------------------
      // 1. Try Uploading to AWS S3 Bucket
      // ----------------------------------------------------
      const s3 = new S3Client({
        region: awsRegion,
        credentials: {
          accessKeyId: awsAccessKeyId!,
          secretAccessKey: awsSecretAccessKey!,
        },
      });

      const extension = file.originalname ? file.originalname.split('.').pop() : 'png';
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

      const command = new PutObjectCommand({
        Bucket: awsBucketName!,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await s3.send(command);

      return `https://${awsBucketName}.s3.${awsRegion}.amazonaws.com/${fileName}`;
    } catch (s3Error) {
      // eslint-disable-next-line no-console
      console.warn(
        '⚠️ AWS S3 upload failed or credential error. Falling back to Cloudinary...',
        s3Error,
      );
      return uploadToCloudinary(file, folder);
    }
  } else {
    // ----------------------------------------------------
    // 2. Default: Upload to Cloudinary
    // ----------------------------------------------------
    return uploadToCloudinary(file, folder);
  }
};

const uploadToCloudinary = (file: Express.Multer.File, folder: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error || !result) {
          return reject(
            new AppError(
              StatusCodes.INTERNAL_SERVER_ERROR,
              `Cloudinary Upload Failed: ${error?.message || 'Unknown error'}`,
            ),
          );
        }
        resolve(result.secure_url);
      },
    );
    uploadStream.end(file.buffer);
  });
};

/**
 * Uploads an in-memory Buffer: First tries Cloudinary, then if S3 credentials are available
 * automatically switches to AWS S3, with reliable fallback to local disk storage.
 */
export const uploadBufferToStorage = async (
  buffer: Buffer,
  filename: string,
  folder: string = 'game-reports',
): Promise<string> => {
  const cleanName = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeFilename = `${Date.now()}_${cleanName}.pdf`;

  // 1. First: Try Cloudinary
  if (cloudName && apiKey && apiSecret) {
    try {
      const cloudinaryUrl = await new Promise<string>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: `${Date.now()}-${cleanName}`,
            resource_type: 'raw',
            format: 'pdf',
          },
          (error, result) => {
            if (error || !result) {
              return reject(error || new Error('No result returned from Cloudinary'));
            }
            resolve(result.secure_url);
          },
        );
        uploadStream.end(buffer);
      });
      return cloudinaryUrl;
    } catch (err: any) {
      logger.warn(
        { err: err?.message },
        '⚠️ Cloudinary PDF upload failed. Checking S3 credentials...',
      );
    }
  }

  // 2. Next: If S3 credentials are configured, auto-switch to AWS S3
  const awsAccessKeyId = env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const awsBucketName = env.AWS_BUCKET_NAME || process.env.AWS_BUCKET_NAME;
  const awsRegion = env.AWS_REGION || process.env.AWS_REGION || 'us-east-1';

  const isS3Enabled = Boolean(
    awsAccessKeyId &&
    awsAccessKeyId.trim() !== '' &&
    awsSecretAccessKey &&
    awsSecretAccessKey.trim() !== '' &&
    awsBucketName &&
    awsBucketName.trim() !== '',
  );

  if (isS3Enabled) {
    try {
      const s3 = new S3Client({
        region: awsRegion,
        credentials: {
          accessKeyId: awsAccessKeyId!,
          secretAccessKey: awsSecretAccessKey!,
        },
      });

      const s3Key = `${folder}/${safeFilename}`;
      const command = new PutObjectCommand({
        Bucket: awsBucketName!,
        Key: s3Key,
        Body: buffer,
        ContentType: 'application/pdf',
      });

      await s3.send(command);
      return `https://${awsBucketName}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
    } catch (s3Error: any) {
      logger.warn(
        { err: s3Error?.message },
        '⚠️ AWS S3 PDF upload failed. Falling back to local storage...',
      );
    }
  }

  // 3. Local disk fallback (Always guaranteed to succeed, returns full accessible URL)
  try {
    const uploadDir = path.join(process.cwd(), 'uploads', folder);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, safeFilename);
    fs.writeFileSync(filePath, buffer);

    const apiBase = env.PUBLIC_API_URL
      ? env.PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '')
      : `http://localhost:${env.PORT || 5000}`;
    return `${apiBase}/uploads/${folder}/${safeFilename}`;
  } catch (localErr: any) {
    logger.error({ err: localErr }, 'Failed to save PDF to local storage');
    throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, 'Failed to store generated PDF');
  }
};

/**
 * Deletes a file from AWS S3 or Cloudinary based on the file URL structure.
 */
export const deleteFromStorage = async (fileUrl: string): Promise<boolean> => {
  if (!fileUrl) return false;

  try {
    if (fileUrl.includes('amazonaws.com')) {
      const awsAccessKeyId = env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
      const awsSecretAccessKey = env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
      const awsBucketName = env.AWS_BUCKET_NAME || process.env.AWS_BUCKET_NAME;
      const awsRegion = env.AWS_REGION || process.env.AWS_REGION || 'us-east-1';

      if (awsAccessKeyId && awsSecretAccessKey && awsBucketName) {
        const s3 = new S3Client({
          region: awsRegion,
          credentials: {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
          },
        });

        const urlObj = new URL(fileUrl);
        const key = urlObj.pathname.substring(1);

        await s3.send(
          new DeleteObjectCommand({
            Bucket: awsBucketName,
            Key: key,
          }),
        );
        return true;
      }
    } else if (fileUrl.includes('cloudinary.com')) {
      const publicIdWithExt = fileUrl.split('/').slice(-2).join('/');
      const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));
      await cloudinary.uploader.destroy(publicId);
      return true;
    }
  } catch {
    // Ignore deletion errors quietly
  }
  return false;
};
