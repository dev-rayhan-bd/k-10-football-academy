import { Schema, model } from 'mongoose';
import {
  IClubProfileDocument,
  IClubAchievementDocument,
  IClubFavouriteDocument,
} from './club.interface';

const ClubProfileSchema = new Schema<IClubProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true },
    clubType: { type: String, required: true },
    establishedYear: { type: Number, required: true },
    country: { type: String, required: true },
    league: { type: String, required: true },
    logo: { type: String },
    coverPhoto: { type: String },
  },
  { timestamps: true },
);

const ClubAchievementSchema = new Schema<IClubAchievementDocument>(
  {
    clubId: { type: Schema.Types.ObjectId, ref: 'ClubProfile', required: true },
    year: { type: Number, required: true },
    championship: { type: String, required: true },
    venue: { type: String },
  },
  { timestamps: true },
);

const ClubFavouriteSchema = new Schema<IClubFavouriteDocument>(
  {
    clubId: { type: Schema.Types.ObjectId, ref: 'ClubProfile', required: true },
    targetType: { type: String, enum: ['PLAYER', 'COACH'], required: true },
    targetPlayerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile' },
    targetCoachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile' },
  },
  { timestamps: true },
);

export const ClubProfile = model<IClubProfileDocument>('ClubProfile', ClubProfileSchema);
export const ClubAchievement = model<IClubAchievementDocument>(
  'ClubAchievement',
  ClubAchievementSchema,
);
export const ClubFavourite = model<IClubFavouriteDocument>('ClubFavourite', ClubFavouriteSchema);
