import { Document } from 'mongoose';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'AGENT'
  | 'ACADEMY'
  | 'CLUB'
  | 'COACH'
  | 'PLAYER'
  | 'GUARDIAN'
  | 'SCOUT';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
export type AccountManagedBy = 'ATHLETE' | 'PARENT';

export interface IUser {
  email: string;
  password?: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  phone?: string;
  coverPhoto?: string;
  accountManagedBy?: AccountManagedBy;
  isEmailVerified: boolean;
  dateOfBirth?: Date;
  position?: string;
  height?: number;
  weight?: number;
  currentClub?: string;
  yearsExperience?: number;
  licenseStatus?: string;
  coachingLicenseLevel?: string;
  preferredFormation?: string;
  clubName?: string;
  title?: string;
  league?: string;
  leagueTier?: string;
  country?: string;
  fifaLicenseNumber?: string;
  agencyName?: string;
  countryOfOperation?: string;
  age?: number;
  secondaryPositions?: string[];
  preferredFoot?: string;
  overallRating?: number;
  marketValue?: number;
  cvTier?: string;
  profileCompletion?: number;
  isVerifiedByCoach?: boolean;
  playerId?: string;
  // Academy specific
  academyId?: string;
  academyName?: string;
  location?: string;
  city?: string;
  registrationId?: string;
  estimatedAcademySize?: string;
  category?: string;
  // Parent specific
  parentProfileId?: string;
  contactPhone?: string;
  address?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserDocument extends IUser, Document {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface ILoginResponse {
  user: Partial<IUser>;
  accessToken: string;
  refreshToken: string;
}

export interface IRefreshTokenResponse {
  accessToken: string;
}
