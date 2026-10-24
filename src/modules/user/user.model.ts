import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUserDocument } from './user.interface';
import { env } from '@/config/env';

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
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
      default: 'PLAYER',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'],
      default: 'ACTIVE',
    },
    avatar: { type: String },
    phone: { type: String },
    coverPhoto: { type: String },
    accountManagedBy: {
      type: String,
      enum: ['ATHLETE', 'PARENT'],
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    officialWebsite: { type: String },
    footballAssociation: { type: String },
    authorizedRepresentativeName: { type: String },
    authorizedRepresentativeJobTitle: { type: String },
    authorizationDocument: { type: String },
    clubRegistrationDocument: { type: String },
    licenseCertificateDocument: { type: String },
    identityDocument: { type: String },
    adminReviewNotes: { type: String },
    verifiedAt: { type: Date },
    dateOfBirth: { type: Date },
    position: { type: String },
    height: { type: Number },
    weight: { type: Number },
    currentClub: { type: String },
    yearsExperience: { type: Number },
    licenseStatus: { type: String },
    coachingLicenseLevel: { type: String },
    preferredFormation: { type: String },
    clubName: { type: String },
    title: { type: String },
    league: { type: String },
    leagueTier: { type: String },
    country: { type: String },
    fifaLicenseNumber: { type: String },
    agencyName: { type: String },
    countryOfOperation: { type: String },
    age: { type: Number },
    secondaryPositions: { type: [String], default: undefined },
    preferredFoot: { type: String },
    overallRating: { type: Number },
    marketValue: { type: Number },
    cvTier: { type: String },
    profileCompletion: { type: Number },
    isVerifiedByCoach: { type: Boolean },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile' },
    // Academy specific
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile' },
    academyName: { type: String },
    location: { type: String },
    city: { type: String },
    registrationId: { type: String },
    estimatedAcademySize: { type: String },
    category: { type: String },
    // Parent specific
    parentProfileId: { type: Schema.Types.ObjectId, ref: 'ParentProfile' },
    contactPhone: { type: String },
    address: { type: String },
    notificationSettings: {
      newVideoLikes: { type: Boolean, default: true },
      profileViews: { type: Boolean, default: true },
      interestAlerts: { type: Boolean, default: true },
      marketingEmails: { type: Boolean, default: false },
      newCvAlerts: { type: Boolean, default: true },
      profileShareAlerts: { type: Boolean, default: true },
      newPlayers: { type: Boolean, default: true },
      profileUpdates: { type: Boolean, default: true },
      sharedWithYou: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        delete ret.password;
        if (ret.role !== 'PLAYER') {
          delete ret.accountManagedBy;
          delete ret.secondaryPositions;
          delete ret.position;
          delete ret.preferredFoot;
          delete ret.height;
          delete ret.weight;
          delete ret.overallRating;
          delete ret.marketValue;
          delete ret.cvTier;
          delete ret.profileCompletion;
          delete ret.isVerifiedByCoach;
          delete ret.playerId;
        }
        if (ret.role !== 'COACH') {
          delete ret.yearsExperience;
          delete ret.licenseStatus;
          delete ret.coachingLicenseLevel;
          delete ret.preferredFormation;
        }
        if (ret.role !== 'CLUB') {
          delete ret.clubName;
          delete ret.leagueTier;
          delete ret.league;
        }
        if (ret.role !== 'AGENT') {
          delete ret.fifaLicenseNumber;
          delete ret.agencyName;
          delete ret.countryOfOperation;
        }
        if (ret.role !== 'ACADEMY') {
          delete ret.academyId;
          delete ret.academyName;
          delete ret.location;
          delete ret.city;
          delete ret.registrationId;
          delete ret.estimatedAcademySize;
        }
        if (ret.role !== 'GUARDIAN' && ret.role !== 'PARENT') {
          delete ret.parentProfileId;
          delete ret.contactPhone;
          delete ret.address;
        }
        return ret;
      },
    },
    toObject: {
      transform: (_doc, ret: any) => {
        delete ret.password;
        if (ret.role !== 'PLAYER') {
          delete ret.accountManagedBy;
          delete ret.secondaryPositions;
          delete ret.position;
          delete ret.preferredFoot;
          delete ret.height;
          delete ret.weight;
          delete ret.overallRating;
          delete ret.marketValue;
          delete ret.cvTier;
          delete ret.profileCompletion;
          delete ret.isVerifiedByCoach;
          delete ret.playerId;
        }
        if (ret.role !== 'COACH') {
          delete ret.yearsExperience;
          delete ret.licenseStatus;
          delete ret.coachingLicenseLevel;
          delete ret.preferredFormation;
        }
        if (ret.role !== 'CLUB') {
          delete ret.clubName;
          delete ret.leagueTier;
          delete ret.league;
        }
        if (ret.role !== 'AGENT') {
          delete ret.fifaLicenseNumber;
          delete ret.agencyName;
          delete ret.countryOfOperation;
        }
        if (ret.role !== 'ACADEMY') {
          delete ret.academyId;
          delete ret.academyName;
          delete ret.location;
          delete ret.city;
          delete ret.registrationId;
          delete ret.estimatedAcademySize;
        }
        if (ret.role !== 'GUARDIAN' && ret.role !== 'PARENT') {
          delete ret.parentProfileId;
          delete ret.contactPhone;
          delete ret.address;
        }
        return ret;
      },
    },
  },
);

// Hash password before saving
userSchema.pre<IUserDocument>('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password instance method
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export const UserModel = model<IUserDocument>('User', userSchema);
export const User = UserModel;
