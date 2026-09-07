import { Document, Types } from 'mongoose';

export type CvTier = 'BRONZE' | 'SILVER' | 'GOLD';
export type PreferredFoot = 'RIGHT' | 'LEFT' | 'BOTH';
export type MatchResult = 'W' | 'D' | 'L';
export type ValidationStatus = 'ASSIGNED' | 'REQUESTED' | 'REVIEWED' | 'EXPIRED';

export interface IPlayerProfile {
  userId: Types.ObjectId;
  fullName: string;
  position: string;
  secondaryPositions?: string[];
  age: number;
  dateOfBirth: Date;
  country: string;
  dualNationality?: string;
  currentClub?: string;
  contractUntil?: Date;
  marketValue?: number;
  overallRating: number;
  cvTier: CvTier;
  profileCompletion: number;
  height?: number;
  weight?: number;
  preferredFoot: PreferredFoot;
  rightFootDominance?: number;
  leftFootDominance?: number;
  isVerifiedByCoach: boolean;
  verifyingCoachId?: Types.ObjectId;
  verifyingCoachLicense?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPlayerProfileDocument extends IPlayerProfile, Document {}

export interface IPlayerAttributes {
  playerId: Types.ObjectId;
  ballControl: number;
  dribbling: number;
  shortPassing: number;
  longPassing: number;
  crossing: number;
  shooting: number;
  finishing: number;
  longShots: number;
  firstTouch: number;
  positioning: number;
  vision: number;
  anticipation: number;
  composure: number;
  teamwork: number;
  workRate: number;
  decisions: number;
  attPosition: number;
  acceleration: number;
  sprintSpeed: number;
  stamina: number;
  strength: number;
  balance: number;
  agility: number;
  reactions: number;
  jumping: number;
  aggression: number;
  interceptions: number;
  marking: number;
  leadership: number;
  bravery: number;
  determination: number;
  heading: number;
  influence: number;
  tackling: number;
}

export interface IPlayerAttributesDocument extends IPlayerAttributes, Document {}

export interface IPlayerMentalAnalysis {
  playerId: Types.ObjectId;
  creativity: number;
  leadership: number;
  confidence: number;
  composure: number;
  motivation: number;
  focus: number;
  overallMentalScore: number;
  monthlyGrowth?: number;
}

export interface IPlayerMentalAnalysisDocument extends IPlayerMentalAnalysis, Document {}

export interface IPlayerFullPotential {
  playerId: Types.ObjectId;
  vision: number;
  strength: number;
  pace: number;
  stamina: number;
  shooting: number;
  passing: number;
  overallPotentialScore: number;
  monthlyGrowth?: number;
}

export interface IPlayerFullPotentialDocument extends IPlayerFullPotential, Document {}

export interface IFifaCardStats {
  playerId: Types.ObjectId;
  overallRating: number;
  position: string;
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
}

export interface IFifaCardStatsDocument extends IFifaCardStats, Document {}

export interface IMatchRecord {
  playerId: Types.ObjectId;
  matchDate: Date;
  leagueType: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  result: MatchResult;
  location?: string;
  playerRating: number;
  goals: number;
  assists: number;
  passes: number;
  passAccuracy: number;
  minutesPlayed: number;
  reportPdfUrl?: string;
}

export interface IMatchRecordDocument extends IMatchRecord, Document {}

export interface IPlayerCvValidation {
  coachId: Types.ObjectId;
  playerId: Types.ObjectId;
  status: ValidationStatus;
  score?: number;
}

export interface IPlayerCvValidationDocument extends IPlayerCvValidation, Document {}
