import { Types } from 'mongoose';
import { UserRole } from '@/modules/user/user.interface';

export type MediaType = 'IMAGE' | 'VIDEO';

export interface IMedia {
  userId: Types.ObjectId;
  role: UserRole;
  playerId?: Types.ObjectId;
  coachId?: Types.ObjectId;
  clubId?: Types.ObjectId;
  academyId?: Types.ObjectId;
  url: string;
  thumbnailUrl?: string;
  title: string;
  description?: string;
  mediaType: MediaType;
  views?: number;
  likes?: number;
  isPublic?: boolean;
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IMediaDocument extends IMedia {
  _id: Types.ObjectId;
}
