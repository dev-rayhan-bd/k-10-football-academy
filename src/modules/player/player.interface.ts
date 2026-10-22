import { Document, Types } from 'mongoose';

export type CvTier = 'BRONZE' | 'SILVER' | 'GOLD';
export type PreferredFoot = 'RIGHT' | 'LEFT' | 'BOTH';
export type MatchResult = 'W' | 'D' | 'L';
export type ValidationStatus = 'ASSIGNED' | 'REQUESTED' | 'REVIEWED' | 'EXPIRED';

export const ALLOWED_PLAYER_STYLES = [
  'Technical',
  'Finesse Shot',
  'Incisive Pass',
  'Long Ball Specialist',
  'Speedster',
  'Power Header',
  'Interceptor',
  'Block Specialist',
  'Clinical Finisher',
  'Dribbling Wizard',
  'Set Piece Specialist',
  'Playmaker',
  'Acrobatic',
  'Dead Ball Specialist',
  'Relentless',
  'Quick Step',
  'Trickster',
  'Whipped Cross',
] as const;

export type PlayerStyle = (typeof ALLOWED_PLAYER_STYLES)[number];

export interface IPlayerProfile {
  userId: Types.ObjectId;
  fullName: string;
  position: string;
  secondaryPositions?: string[];
  age?: number;
  dateOfBirth?: Date;
  country?: string;
  dualNationality?: string;
  currentClub?: string;
  clubLogo?: string;
  academy?: string;
  academyId?: Types.ObjectId;
  contractUntil?: Date;
  marketValue?: number;
  overallRating: number;
  cvTier: CvTier;
  profileCompletion: number;
  profileImage?: string;
  highlightVideo?: string;
  height?: number;
  weight?: number;
  preferredFoot: PreferredFoot;
  rightFootDominance?: number;
  leftFootDominance?: number;
  isVerifiedByCoach: boolean;
  verifyingCoachId?: Types.ObjectId;
  verifyingCoachLicense?: string;
  profileViews?: number;
  totalLikes?: number;
  clubsInterested?: {
    clubName: string;
    logoUrl?: string;
    viewedAt: Date;
  }[];
  website?: string;
  playerStyles?: string[];
  languages?: Array<{
    language: string;
    proficiency: 'Native' | 'Fluent' | 'Intermediate' | 'Basic';
  }>;
  accomplishments?: Array<{ year: number; title: string }>;
  clubHistory?: Array<{
    _id?: Types.ObjectId | string;
    clubName: string;
    logoUrl?: string;
    from?: string;
    to?: string;
    period?: string;
    isCurrent?: boolean;
  }>;
  positionMap?: Array<{
    slot: string;
    position?: string;
    role?: string;
    x?: number;
    y?: number;
  }>;
  futsalMap?: Array<{
    slot: string;
    position?: string;
    role?: string;
    x?: number;
    y?: number;
  }>;
  agentStatus?: 'UNREPRESENTED' | 'REPRESENTED' | string;
  agentName?: string;
  agencyName?: string;
  clubStatus?: 'WITHOUT_CLUB' | 'SIGNED' | string;
  transferStatus?: {
    status?: string;
    contractUntil?: Date | string;
    agentName?: string;
    agencyName?: string;
  };
  playerEvaluation?: {
    agentStatus?: string;
    hasAgent?: boolean;
    agentName?: string;
    agencyName?: string;
    clubStatus?: string;
    hasClub?: boolean;
    currentClub?: string;
    contractUntil?: Date | string;
    marketValue?: number;
    marketValueFormatted?: string;
    canSpecifyMarketValue?: boolean;
  };
  coachVerification?: {
    isVerified?: boolean;
    coachName?: string;
    licenseNumber?: string;
    clubManaged?: string;
    verifiedAt?: Date;
  };
  perceptionMetrics?: {
    spaceAwareness?: { score: number; trend: number; grade: string };
    opponentReading?: { score: number; trend: number; grade: string };
    gameFlowUnderstanding?: { score: number; trend: number; grade: string };
    pressureHandling?: { score: number; trend: number; grade: string };
  };
  visionMetrics?: {
    peripheralVision?: { score: number; trend: number; grade: string };
    focusControl?: { score: number; trend: number; grade: string };
    patternRecognition?: { score: number; trend: number; grade: string };
    decisionSpeed?: { score: number; trend: number; grade: string };
    visualAcuity?: { score: number; trend: number; grade: string };
    visionField?: { score: number; trend: number; grade: string };
    targetFinding?: { score: number; trend: number; grade: string };
  };
  documents?: IPlayerDocument[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPlayerDocument {
  _id?: Types.ObjectId | string;
  title: string;
  url: string;
  fileType?: string;
  size?: number;
  uploadedAt?: Date;
}

export interface IPlayerProfileDocument extends IPlayerProfile, Document {}

export interface IPlayerAttributes {
  playerId: Types.ObjectId;
  // Technical (8)
  ballControl: number;
  dribbling: number;
  shortPassing: number;
  longPassing: number;
  crossing: number;
  shooting: number;
  finishing: number;
  longShots: number;

  // Tactical (8)
  positioning: number;
  vision: number;
  anticipation: number;
  composition?: number;
  composure: number;
  teamwork: number;
  workRate: number;
  decisions: number;
  attPosition: number;

  // Physical (8)
  acceleration: number;
  sprintSpeed: number;
  stamina: number;
  strength: number;
  balance: number;
  agility: number;
  reactions: number;
  jumping: number;

  // Mental (8)
  aggression: number;
  concentration?: number;
  consistency?: number;
  leadership: number;
  bravery: number;
  determination: number;
  heading: number;
  influence: number;

  // Attacking (8)
  firstTouch?: number;
  shotPower?: number;
  curve?: number;
  freeKick?: number;
  penalties?: number;
  volleys?: number;
  headingAccuracy?: number;
  weakFoot?: number;

  // Defending (8)
  standingTackle?: number;
  slidingTackle?: number;
  tackling?: number;
  aerialDuels?: number;
  clearance?: number;
  pressing?: number;
  defensiveAwareness?: number;

  [key: string]: any;
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

export interface IAccurateShot {
  x: number;
  y: number;
  target?: 'goal' | 'saved' | 'missed';
}

export interface IAccurateAssist {
  x?: number;
  y?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  assistType?: 'ground' | 'through' | 'aerial' | 'cross' | string;
}

export interface IMatchRecordStats {
  shotsOnGoal?: number;
  goalScored?: number;
  assists?: number;
  passAccurate?: number;
  wrongPass?: number;
  penaltiesTaken?: number;
  freeKick?: number;
  cornerKick?: number;
  standTackle?: number;
  slidingTackle?: number;
  interception?: number;
  appearances?: number;
  fault?: number;
  yellowCard?: number;
  redCard?: number;
  savesAccurate?: number;
  goalUnsave?: number;
  penaltiesSaves?: number;
  punching?: number;
  handling?: number;
  reflex?: number;
  aerialAbility?: number;
  throwing?: number;
  reactions?: number;
  [key: string]: any;
}

export interface ICoachReviewInfo {
  coachId?: Types.ObjectId;
  coachEmail?: string;
  coachName?: string;
  paymentStatus?: 'UNPAID' | 'PAID' | 'FREE';
  paymentAmount?: number;
  transactionId?: string;
  status?: 'PENDING' | 'COMPLETED' | 'UNREQUESTED';
  evaluatedAt?: Date;
  coachRating?: number;
  coachFeedback?: string;
}

export interface IGameReportPlayerInfo {
  playerName?: string;
  dateOfBirth?: string | Date;
  clubName?: string;
  position?: string;
  foot?: string;
  characteristics?: string[];
  weight?: number;
  height?: number;
}

export interface IMatchRecord {
  playerId: Types.ObjectId;
  playerInfo?: IGameReportPlayerInfo;
  gameType?: string;
  gameDate?: Date | string;
  gameLocation?: string;
  matchResult?: string;
  weather?: string;
  temperature?: number;
  scoutName?: string;
  reportCompletionType?: 'SELF' | 'COACH';
  // Legacy optional compatibility
  matchDate?: Date;
  leagueType?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  result?: MatchResult;
  location?: string;
  playerRating: number;
  goals: number;
  assists: number;
  passes: number;
  passAccuracy: number;
  minutesPlayed: number;
  matchDuration?: string;
  yellowCards?: number;
  redCards?: number;
  tackles?: number;
  events?: Array<{ eventId: string; count: number }>;
  stats?: IMatchRecordStats;
  accurateShots?: IAccurateShot[];
  accurateAssists?: IAccurateAssist[];
  coachReview?: ICoachReviewInfo;
  positivePoints?: number;
  negativePoints?: number;
  netContribution?: number;
  interpretation?: string;
  categoryScores?: Record<string, number>;
  categoryRatings?: Record<string, number>;
  plottedEventsJson?: string;
  reportPdfUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IMatchRecordDocument extends IMatchRecord, Document {}

export interface IPlayerCvValidation {
  coachId: Types.ObjectId;
  playerId: Types.ObjectId;
  status: ValidationStatus;
  score?: number;
}

export interface IPlayerCvValidationDocument extends IPlayerCvValidation, Document {}

export interface IPlayerMediaDocument extends Document {
  playerId: Types.ObjectId;
  url: string;
  title: string;
  mediaType: 'IMAGE' | 'VIDEO';
  thumbnailUrl?: string;
  views: number;
  likes: number;
  createdAt?: Date;
  updatedAt?: Date;
}
