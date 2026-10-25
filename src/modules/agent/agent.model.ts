import { Schema, model } from 'mongoose';
import {
  IAgentProfileDocument,
  IVerificationDocumentDocument,
  ISuccessStoryDocument,
} from './agent.interface';

const AgentProfileSchema = new Schema<IAgentProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String },
    name: { type: String },
    nationality: { type: String },
    country: { type: String },
    licenseId: { type: String },
    fifaLicenseNumber: { type: String },
    dateOfBirth: { type: Date },
    age: { type: Number },
    contact: { type: String },
    phone: { type: String },
    email: { type: String },
    avatar: { type: String },
    coverPhoto: { type: String },
    yearsOfExperience: { type: Number },
    certifications: { type: String },
    achievements: { type: String },
    bio: { type: String },
    professionalBio: { type: String },
    agencyName: { type: String },
    officialWebsite: { type: String },
    countryOfOperation: { type: String },
    licenseCertificateDocument: { type: String },
    identityDocument: { type: String },
    associationMembershipDocument: { type: String },
    verificationStatus: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    adminReviewNotes: { type: String },
    verifiedAt: { type: Date },
    cvsSharedCount: { type: Number, default: 0 },
    profileCompletion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const VerificationDocumentSchema = new Schema<IVerificationDocumentDocument>(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    documentType: {
      type: String,
      enum: ['LICENSE_CERTIFICATE', 'NATIONAL_ID_PASSPORT', 'ASSOCIATION_MEMBERSHIP'],
      required: true,
    },
    fileUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'PENDING',
    },
    adminReviewNotes: { type: String },
  },
  { timestamps: true },
);

const SuccessStorySchema = new Schema<ISuccessStoryDocument>(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    creatorRole: { type: String, default: 'AGENT' },
    storyTitle: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      trim: true,
      enum: {
        values: [
          'Transfer Achievement',
          'Signing Achievement',
          'Agent Milestone',
          'Academy Milestone',
          'TRANSFER_ACHIEVEMENT',
          'SIGNING_ACHIEVEMENT',
          'AGENT_MILESTONE',
          'ACADEMY_MILESTONE',
        ],
        message: '{VALUE} is not a valid story category',
      },
    },
    playerName: { type: String, trim: true },
    position: { type: String, trim: true },
    previousAcademy: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    formattedDate: { type: String },
    signedClub: { type: String, trim: true },
    image: { type: String, default: '' },
    storyContent: { type: String, trim: true },
    status: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    adminReviewNotes: { type: String, default: '' },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

SuccessStorySchema.pre('save', function (next) {
  if (this.category) {
    const catMap: Record<string, string> = {
      TRANSFER_ACHIEVEMENT: 'Transfer Achievement',
      SIGNING_ACHIEVEMENT: 'Signing Achievement',
      AGENT_MILESTONE: 'Agent Milestone',
      ACADEMY_MILESTONE: 'Academy Milestone',
    };
    if (catMap[this.category]) {
      this.category = catMap[this.category];
    }
  }
  if (this.date) {
    try {
      const d = new Date(this.date);
      this.formattedDate = d.toISOString().split('T')[0];
    } catch {
      // ignore
    }
  }
  next();
});

export const AgentProfile = model<IAgentProfileDocument>('AgentProfile', AgentProfileSchema);
export const VerificationDocument = model<IVerificationDocumentDocument>(
  'VerificationDocument',
  VerificationDocumentSchema,
);
export const SuccessStory = model<ISuccessStoryDocument>('SuccessStory', SuccessStorySchema);
