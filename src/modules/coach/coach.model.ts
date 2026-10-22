import { Schema, model } from 'mongoose';
import {
  ICoachProfileDocument,
  ITacticalFormationDocument,
  ICoachTestimonialDocument,
} from './coach.interface';

const AccomplishmentSchema = new Schema(
  {
    title: { type: String },
    text: { type: String, required: true },
    date: { type: String },
  },
  { _id: true },
);

const LanguageSchema = new Schema(
  {
    language: { type: String, required: true },
    proficiency: {
      type: String,
      enum: ['NATIVE', 'FLUENT', 'INTERMEDIATE', 'BASIC'],
      default: 'FLUENT',
    },
  },
  { _id: true },
);

const TrophySchema = new Schema(
  {
    title: { type: String, required: true },
    count: { type: Number, default: 1 },
    year: { type: Number },
  },
  { _id: true },
);

const CupPlayedSchema = new Schema(
  {
    year: { type: Number, required: true },
    tournament: { type: String, required: true },
    club: { type: String },
  },
  { _id: true },
);

const SkillSchema = new Schema(
  {
    name: { type: String, required: true },
    icon: { type: String },
    isCustom: { type: Boolean, default: false },
  },
  { _id: true },
);

const ClubHistorySchema = new Schema(
  {
    clubName: { type: String, required: true },
    role: { type: String, default: 'Head Coach' },
    period: { type: String, required: true },
    startYear: { type: Number },
    endYear: { type: Number },
    isCurrent: { type: Boolean, default: false },
    logoUrl: { type: String },
  },
  { _id: true },
);

const AssociationSchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String },
    logoUrl: { type: String },
    isSelected: { type: Boolean, default: false },
  },
  { _id: true },
);

const CourseSchema = new Schema(
  {
    name: { type: String, required: true },
    category: { type: String },
    issueDate: { type: String },
    certificateUrl: { type: String },
    isCompleted: { type: Boolean, default: false },
    isSelected: { type: Boolean, default: false },
  },
  { _id: true },
);

const DocumentSchema = new Schema(
  {
    title: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileType: { type: String, default: 'image/jpeg' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const TransferStatusSchema = new Schema(
  {
    footballAgentContract: { type: String, default: 'No' },
    contractUntil: { type: String },
    agent: { type: String },
    agency: { type: String },
    salary: { type: String },
    statusBadge: { type: String, default: 'Active' },
  },
  { _id: false },
);

const CoachProfileSchema = new Schema<ICoachProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    coachType: {
      type: String,
      enum: ['INDIVIDUAL_COACH', 'CLUB_COACH'],
      default: 'INDIVIDUAL_COACH',
    },
    fullName: { type: String, required: true },
    title: { type: String, default: 'Head Coach' },
    yearsExperience: { type: Number, default: 0 },
    overallRatingScore: { type: Number, default: 88 },
    licenseStatus: {
      type: String,
      default: 'UEFA Pro Licence',
    },
    cvTier: { type: String, enum: ['BRONZE', 'SILVER', 'GOLD'], default: 'BRONZE' },
    profileCompletion: { type: Number, default: 0 },
    speciality: { type: String, default: 'Tactical Coaching' },
    status: {
      type: String,
      enum: ['AVAILABLE', 'CONTRACTED', 'ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
    additionalNotes: { type: String },

    // Hero & Personal Info
    profileImage: { type: String },
    coverImage: { type: String },
    dateOfBirth: { type: Schema.Types.Mixed },
    age: { type: Number, default: 24 },
    birthCountry: { type: String, default: 'France' },
    birthCountryFlag: { type: String, default: 'FR' },
    dualNationality: { type: String, default: 'Italy' },
    dualNationalityFlag: { type: String, default: 'IT' },
    currentClub: { type: String, default: 'Manchester City' },
    clubLogo: { type: String },
    website: { type: String, default: 'www.k10football.com' },
    phone: { type: String },
    email: { type: String },
    location: { type: String },

    // Validation Status
    validationStatus: { type: String, default: '15 days until re-validation' },
    revalidationRequested: { type: Boolean, default: false },
    revalidationRequestedAt: { type: Date },

    // Season Stats
    matchesCoached: { type: Number, default: 32 },
    totalWins: { type: Number, default: 21 },
    losses: { type: Number, default: 7 },
    draws: { type: Number, default: 4 },
    cleanSheets: { type: Number, default: 0 },

    // Transfer Status
    transferStatus: { type: TransferStatusSchema, default: () => ({}) },

    // Sub-sections
    accomplishments: { type: [AccomplishmentSchema], default: [] },
    coachStyles: {
      type: [String],
      default: ['TIKI-TAKA', 'MOTIVATOR', 'YOUTH DEVELOPMENT'],
    },
    languages: { type: [LanguageSchema], default: [] },
    majorTrophies: { type: [TrophySchema], default: [] },
    cupsPlayed: { type: [CupPlayedSchema], default: [] },
    keySkills: { type: [SkillSchema], default: [] },
    clubHistory: { type: [ClubHistorySchema], default: [] },
    associations: { type: [AssociationSchema], default: [] },
    courses: { type: [CourseSchema], default: [] },
    documents: { type: [DocumentSchema], default: [] },
  },
  { timestamps: true },
);

// Indexes for high performance lookup & querying
CoachProfileSchema.index({ userId: 1 }, { unique: true });
CoachProfileSchema.index({ cvTier: 1 });
CoachProfileSchema.index({ status: 1 });
CoachProfileSchema.index({ coachType: 1 });
CoachProfileSchema.index({ overallRatingScore: -1 });

const TacticalFormationSchema = new Schema<ITacticalFormationDocument>(
  {
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', required: true, index: true },
    formationSlot: { type: Number, enum: [1, 2, 3], required: true },
    formationName: { type: String, required: true },
    positionsJson: { type: String, required: true },
  },
  { timestamps: true },
);
TacticalFormationSchema.index({ coachId: 1, formationSlot: 1 }, { unique: true });

const CoachTestimonialSchema = new Schema<ICoachTestimonialDocument>(
  {
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', required: true, index: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, required: true },
    authorAvatar: { type: String },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, required: true },
  },
  { timestamps: true },
);
CoachTestimonialSchema.index({ coachId: 1, createdAt: -1 });

export const CoachProfile = model<ICoachProfileDocument>('CoachProfile', CoachProfileSchema);
export const TacticalFormation = model<ITacticalFormationDocument>(
  'TacticalFormation',
  TacticalFormationSchema,
);
export const CoachTestimonial = model<ICoachTestimonialDocument>(
  'CoachTestimonial',
  CoachTestimonialSchema,
);
