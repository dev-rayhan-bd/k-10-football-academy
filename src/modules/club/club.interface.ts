import { Document, Types } from 'mongoose';

export interface IClubProfile {
  userId: Types.ObjectId;
  name: string;
  clubType: string;
  establishedYear: number;
  country: string;
  league: string;
  logo?: string;
  coverPhoto?: string;
  description?: string;
  visionAndMission?: string;
  contactPhone?: string;
  contactEmail?: string;
  achievements?: {
    year: number | string;
    championship: string;
    venue?: string;
  }[];
  likedPlayerIds?: Types.ObjectId[];
  sharedPlayerProfiles?: {
    playerId: Types.ObjectId;
    sharedAt: Date;
    shareCount: number;
  }[];
  viewedPlayerProfiles?: {
    playerId: Types.ObjectId;
    viewedAt: Date;
    viewCount: number;
  }[];
  profileViews?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IClubProfileDocument extends IClubProfile, Document {}

export interface IClubAchievement {
  clubId: Types.ObjectId;
  year: number;
  championship: string;
  venue?: string;
}

export interface IClubAchievementDocument extends IClubAchievement, Document {}

export interface IClubFavourite {
  clubId: Types.ObjectId;
  targetType: 'PLAYER' | 'COACH';
  targetPlayerId?: Types.ObjectId;
  targetCoachId?: Types.ObjectId;
  createdAt?: Date;
}

export interface IClubFavouriteDocument extends IClubFavourite, Document {}

export interface IClubSuccessStory {
  clubId: Types.ObjectId;
  storyTitle: string;
  category: string;
  date: Date;
  formattedDate?: string;
  coverImage?: string;
  photo?: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IClubSuccessStoryDocument extends IClubSuccessStory, Document {}
