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
