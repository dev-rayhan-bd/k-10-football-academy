import { Schema, model } from 'mongoose';
import {
  IPlayerProfileDocument,
  IPlayerAttributesDocument,
  IPlayerMentalAnalysisDocument,
  IPlayerFullPotentialDocument,
  IFifaCardStatsDocument,
  IMatchRecordDocument,
  IPlayerCvValidationDocument,
} from './player.interface';

const PlayerProfileSchema = new Schema<IPlayerProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true },
    position: { type: String, required: true },
    secondaryPositions: [{ type: String }],
    age: { type: Number, required: true },
    dateOfBirth: { type: Date, required: true },
    country: { type: String, required: true },
    dualNationality: { type: String },
    currentClub: { type: String },
    contractUntil: { type: Date },
    marketValue: { type: Number, default: 0 },
    overallRating: { type: Number, default: 50 },
    cvTier: { type: String, enum: ['BRONZE', 'SILVER', 'GOLD'], default: 'BRONZE' },
    profileCompletion: { type: Number, default: 0 },
    height: { type: Number },
    weight: { type: Number },
    preferredFoot: { type: String, enum: ['RIGHT', 'LEFT', 'BOTH'], default: 'RIGHT' },
    rightFootDominance: { type: Number, min: 0, max: 100 },
    leftFootDominance: { type: Number, min: 0, max: 100 },
    isVerifiedByCoach: { type: Boolean, default: false },
    verifyingCoachId: { type: Schema.Types.ObjectId, ref: 'User' },
    verifyingCoachLicense: { type: String },
  },
  { timestamps: true },
);

const PlayerAttributesSchema = new Schema<IPlayerAttributesDocument>({
  playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, unique: true },
  ballControl: { type: Number, default: 50 },
  dribbling: { type: Number, default: 50 },
  shortPassing: { type: Number, default: 50 },
  longPassing: { type: Number, default: 50 },
  crossing: { type: Number, default: 50 },
  shooting: { type: Number, default: 50 },
  finishing: { type: Number, default: 50 },
  longShots: { type: Number, default: 50 },
  firstTouch: { type: Number, default: 50 },
  positioning: { type: Number, default: 50 },
  vision: { type: Number, default: 50 },
  anticipation: { type: Number, default: 50 },
  composure: { type: Number, default: 50 },
  teamwork: { type: Number, default: 50 },
  workRate: { type: Number, default: 50 },
  decisions: { type: Number, default: 50 },
  attPosition: { type: Number, default: 50 },
  acceleration: { type: Number, default: 50 },
  sprintSpeed: { type: Number, default: 50 },
  stamina: { type: Number, default: 50 },
  strength: { type: Number, default: 50 },
  balance: { type: Number, default: 50 },
  agility: { type: Number, default: 50 },
  reactions: { type: Number, default: 50 },
  jumping: { type: Number, default: 50 },
  aggression: { type: Number, default: 50 },
  interceptions: { type: Number, default: 50 },
  marking: { type: Number, default: 50 },
  leadership: { type: Number, default: 50 },
  bravery: { type: Number, default: 50 },
  determination: { type: Number, default: 50 },
  heading: { type: Number, default: 50 },
  influence: { type: Number, default: 50 },
  tackling: { type: Number, default: 50 },
});

const PlayerMentalAnalysisSchema = new Schema<IPlayerMentalAnalysisDocument>({
  playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, unique: true },
  creativity: { type: Number, default: 50 },
  leadership: { type: Number, default: 50 },
  confidence: { type: Number, default: 50 },
  composure: { type: Number, default: 50 },
  motivation: { type: Number, default: 50 },
  focus: { type: Number, default: 50 },
  overallMentalScore: { type: Number, default: 50 },
  monthlyGrowth: { type: Number, default: 0 },
});

const PlayerFullPotentialSchema = new Schema<IPlayerFullPotentialDocument>({
  playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, unique: true },
  vision: { type: Number, default: 50 },
  strength: { type: Number, default: 50 },
  pace: { type: Number, default: 50 },
  stamina: { type: Number, default: 50 },
  shooting: { type: Number, default: 50 },
  passing: { type: Number, default: 50 },
  overallPotentialScore: { type: Number, default: 50 },
  monthlyGrowth: { type: Number, default: 0 },
});

const FifaCardStatsSchema = new Schema<IFifaCardStatsDocument>({
  playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, unique: true },
  overallRating: { type: Number, required: true },
  position: { type: String, required: true },
  pac: { type: Number, default: 50 },
  sho: { type: Number, default: 50 },
  pas: { type: Number, default: 50 },
  dri: { type: Number, default: 50 },
  def: { type: Number, default: 50 },
  phy: { type: Number, default: 50 },
});

const MatchRecordSchema = new Schema<IMatchRecordDocument>(
  {
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true },
    matchDate: { type: Date, required: true },
    leagueType: { type: String, required: true },
    homeTeam: { type: String, required: true },
    awayTeam: { type: String, required: true },
    homeScore: { type: Number, default: 0 },
    awayScore: { type: Number, default: 0 },
    result: { type: String, enum: ['W', 'D', 'L'], required: true },
    location: { type: String },
    playerRating: { type: Number, default: 6.0 },
    goals: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    passes: { type: Number, default: 0 },
    passAccuracy: { type: Number, default: 0 },
    minutesPlayed: { type: Number, default: 0 },
    reportPdfUrl: { type: String },
  },
  { timestamps: true },
);

const PlayerCvValidationSchema = new Schema<IPlayerCvValidationDocument>(
  {
    coachId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true },
    status: {
      type: String,
      enum: ['ASSIGNED', 'REQUESTED', 'REVIEWED', 'EXPIRED'],
      default: 'REQUESTED',
    },
    score: { type: Number },
  },
  { timestamps: true },
);

export const PlayerProfile = model<IPlayerProfileDocument>('PlayerProfile', PlayerProfileSchema);
export const PlayerAttributes = model<IPlayerAttributesDocument>(
  'PlayerAttributes',
  PlayerAttributesSchema,
);
export const PlayerMentalAnalysis = model<IPlayerMentalAnalysisDocument>(
  'PlayerMentalAnalysis',
  PlayerMentalAnalysisSchema,
);
export const PlayerFullPotential = model<IPlayerFullPotentialDocument>(
  'PlayerFullPotential',
  PlayerFullPotentialSchema,
);
export const FifaCardStats = model<IFifaCardStatsDocument>('FifaCardStats', FifaCardStatsSchema);
export const MatchRecord = model<IMatchRecordDocument>('MatchRecord', MatchRecordSchema);
export const PlayerCvValidation = model<IPlayerCvValidationDocument>(
  'PlayerCvValidation',
  PlayerCvValidationSchema,
);
