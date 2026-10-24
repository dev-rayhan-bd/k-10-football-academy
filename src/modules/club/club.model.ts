import { Schema, model } from 'mongoose';
import {
  IClubProfileDocument,
  IClubAchievementDocument,
  IClubFavouriteDocument,
  IClubSuccessStoryDocument,
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
    description: { type: String },
    visionAndMission: { type: String },
    contactPhone: { type: String },
    contactEmail: { type: String },
    officialWebsite: { type: String },
    footballAssociation: { type: String },
    authorizedRepresentativeName: { type: String },
    authorizedRepresentativeJobTitle: { type: String },
    authorizationDocument: { type: String },
    clubRegistrationDocument: { type: String },
    verificationStatus: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    adminReviewNotes: { type: String },
    verifiedAt: { type: Date },
    achievements: [
      {
        year: { type: Schema.Types.Mixed },
        championship: { type: String },
        venue: { type: String },
      },
    ],
    likedPlayerIds: [{ type: Schema.Types.ObjectId, ref: 'PlayerProfile' }],
    sharedPlayerProfiles: [
      {
        playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile' },
        sharedAt: { type: Date, default: Date.now },
        shareCount: { type: Number, default: 1 },
      },
    ],
    viewedPlayerProfiles: [
      {
        playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile' },
        viewedAt: { type: Date, default: Date.now },
        viewCount: { type: Number, default: 1 },
      },
    ],
    profileViews: { type: Number, default: 0 },
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

ClubFavouriteSchema.index({ clubId: 1, targetType: 1, targetPlayerId: 1 });
ClubFavouriteSchema.index({ clubId: 1, targetType: 1, targetCoachId: 1 });

const ClubSuccessStorySchema = new Schema<IClubSuccessStoryDocument>(
  {
    clubId: { type: Schema.Types.ObjectId, ref: 'ClubProfile', required: true, index: true },
    storyTitle: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    date: { type: Date, required: true, default: Date.now },
    formattedDate: { type: String },
    coverImage: { type: String, default: '' },
    photo: { type: String, default: '' },
    status: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'APPROVED',
      index: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ClubSuccessStorySchema.pre('save', function (next) {
  if (this.date) {
    try {
      const d = new Date(this.date);
      this.formattedDate = d.toISOString().split('T')[0];
    } catch {
      // ignore
    }
  }
  if (!this.coverImage && this.photo) {
    this.coverImage = this.photo;
  }
  if (!this.photo && this.coverImage) {
    this.photo = this.coverImage;
  }
  next();
});

export const ClubProfile = model<IClubProfileDocument>('ClubProfile', ClubProfileSchema);
export const ClubAchievement = model<IClubAchievementDocument>(
  'ClubAchievement',
  ClubAchievementSchema,
);
export const ClubFavourite = model<IClubFavouriteDocument>('ClubFavourite', ClubFavouriteSchema);
export const ClubSuccessStory = model<IClubSuccessStoryDocument>(
  'ClubSuccessStory',
  ClubSuccessStorySchema,
);
