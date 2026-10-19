import { Request, Response } from 'express';
import mongoose from 'mongoose';
import app from '../src/app';
import { env } from '../src/config/env';

let isConnected = false;

async function connectToDatabase(): Promise<void> {
  if (isConnected || mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }
  try {
    const db = await mongoose.connect(env.DATABASE_URL);
    isConnected = db.connections[0].readyState === 1;
  } catch (error) {
    // Log error but don't call process.exit(1) in serverless
    console.error('MongoDB serverless connection error:', error);
  }
}

export default async function handler(req: Request, res: Response) {
  await connectToDatabase();
  return app(req, res);
}
