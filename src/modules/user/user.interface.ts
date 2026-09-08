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
