import { Schema, model } from 'mongoose';
import { IMediaDocument } from './media.interface';

const MediaSchema = new Schema<IMediaDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: {
      type: String,
      enum: [
        'SUPER_ADMIN',
        'ADMIN',
        'AGENT',
        'ACADEMY',
        'CLUB',
        'COACH',
        'PLAYER',
        'PARENT',
        'GUARDIAN',
        'SCOUT',
      ],
      required: true,
      index: true,
    },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', index: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', index: true },
    clubId: { type: Schema.Types.ObjectId, ref: 'ClubProfile', index: true },
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', index: true },
    url: { type: String, required: true },
    thumbnailUrl: { type: String },
    title: { type: String, default: 'Untitled Media' },
    description: { type: String },
    mediaType: { type: String, enum: ['IMAGE', 'VIDEO'], required: true, index: true },
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },
    tags: [{ type: String }],
  },
  { timestamps: true },
);

// Composite indexes for fast queries
MediaSchema.index({ userId: 1, createdAt: -1 });
MediaSchema.index({ role: 1, createdAt: -1 });
MediaSchema.index({ playerId: 1, createdAt: -1 });

export const Media = model<IMediaDocument>('Media', MediaSchema);
