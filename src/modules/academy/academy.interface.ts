import { Document, Types } from 'mongoose';

export type EvaluationStatus = 'EVALUATED' | 'NEED_EVALUATION' | 'EXPIRED' | 'OVERDUE';
export type ReportPaymentStatus = 'PAID' | 'PENDING' | 'UNPAID';
export type ReportStatus = 'PENDING' | 'COMPLETED' | 'APPROVED';

export interface IAcademyProfile {
  userId: Types.ObjectId;
  name: string;
  category: string;
  establishedDate?: Date;
  country: string;
  city: string;
  location?: string;
  registrationId?: string;
  estimatedAcademySize?: string;
  logo?: string;
  coverPhoto?: string;
  description?: string;
  visionAndMission?: string;
  trainingPhilosophy?: string;
  currentPlan?: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM' | 'ELITE';
  maxTeams?: number;
  contactPhone?: string;
  contactEmail?: string;
  nationality?: string;
  league?: string;
  achievements?: {
    year?: string;
    championship?: string;
    venue?: string;
  }[];
  likedPlayerIds?: Types.ObjectId[];
  sharedPlayerProfiles?: {
    playerId: Types.ObjectId;
    sharedAt: Date;
    shareCount: number;
  }[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyProfileDocument extends IAcademyProfile, Document {}

export interface ITeam {
  academyId: Types.ObjectId;
  teamName: string;
  ageGroup: string; // e.g. "UNDER_15", "UNDER_17", "Santos U17"
  coachesCount: number;
  playersCount: number;
  totalMembers?: number;
  coachIds?: Types.ObjectId[];
  playerIds?: Types.ObjectId[];
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITeamDocument extends ITeam, Document {}

export interface IGameReport {
  academyId: Types.ObjectId;
  playerId: Types.ObjectId;
  coachId?: Types.ObjectId;
  scoutName?: string;
  matchName: string;
  matchDate: Date;
  overallPerformanceScore: number;
  goals: number;
  assists: number;
  passes: number;
  price: number;
  paymentStatus: ReportPaymentStatus;
  status: ReportStatus;
  createdAt?: Date;
}

export interface IGameReportDocument extends IGameReport, Document {}

export interface IPlayerEvaluationTechniques {
  dribbling?: string;
  ballMastery?: string;
  runningWithBall?: string;
  rangeOfPassing?: string;
  strikingFinishing?: string;
  defending?: string;
  firstTouch?: string;
  nonDominantFoot?: string;
  [key: string]: string | undefined;
}

export interface IPlayerEvaluationCharacteristics {
  gameAwareness?: string;
  gamesUnderstanding?: string;
  decisionMaking?: string;
  concentration?: string;
  leadership?: string;
  desire?: string;
  maturity?: string;
  [key: string]: string | undefined;
}

export interface IPlayerEvaluationPhysical {
  speedAcceleration?: string;
  movement?: string;
  balance?: string;
  power?: string;
  strength?: string;
  agility?: string;
  coordination?: string;
  [key: string]: string | undefined;
}

export interface IPlayerEvaluation {
  academyId?: Types.ObjectId;
  playerId: Types.ObjectId;
  coachId: Types.ObjectId;
  evaluationDate?: Date;
  overallRating?: number;
  technicalScore?: number;
  physicalScore?: number;
  mentalScore?: number;
  techniques?: IPlayerEvaluationTechniques;
  characteristics?: IPlayerEvaluationCharacteristics;
  physical?: IPlayerEvaluationPhysical;
  improvementDelta?: number;
  status: EvaluationStatus;
  nextEvaluationDue?: Date;
  expiresAt?: Date;
  requestedByManagerId?: Types.ObjectId;
  reminderSentAt?: Date;
  reminderCount?: number;
  coachFeedback?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPlayerEvaluationDocument extends IPlayerEvaluation, Document {}

export type AcademyAffiliationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED';
export type AffiliationInitiator = 'ACADEMY' | 'COACH';

export interface IAcademyCoach {
  academyId: Types.ObjectId;
  coachId: Types.ObjectId;
  coachUserId: Types.ObjectId;
  role: string;
  status: AcademyAffiliationStatus;
  requestedBy: AffiliationInitiator;
  requestMessage?: string;
  responseNote?: string;
  approvedAt?: Date;
  rejectedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyCoachDocument extends IAcademyCoach, Document {}

export type TransferType = 'OUTGOING' | 'INCOMING';
export type TransferStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ITransferRequest {
  playerId: Types.ObjectId;
  fromAcademyId: Types.ObjectId;
  toAcademyId: Types.ObjectId;
  fromTeamId?: Types.ObjectId;
  toTeamId?: Types.ObjectId;
  transferType: TransferType;
  requestedByUserId: Types.ObjectId;
  requestedByCoachId?: Types.ObjectId;
  requestedByRole: string;
  requesterName?: string;
  reason?: string;
  status: TransferStatus;
  responseNote?: string;
  respondedByUserId?: Types.ObjectId;
  resolvedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITransferRequestDocument extends ITransferRequest, Document {}

// ==========================================
// FEES & PAYMENTS INTERFACE (SCREENSHOT 1)
// ==========================================
export type FeePaymentType =
  | 'Monthly Fee'
  | 'Training Session Fee'
  | 'Validation Fee'
  | 'Weekly Fee'
  | 'Uniform Kit Fee'
  | string;

export type FeePaymentStatus = 'PAID' | 'UNPAID' | 'PENDING';

export interface IAcademyFeePayment {
  academyId: Types.ObjectId;
  playerId: Types.ObjectId;
  parentId?: Types.ObjectId;
  feeType: FeePaymentType;
  amount: number;
  paymentDate: Date;
  status: FeePaymentStatus;
  paymentMethod?: 'CASH' | 'CARD' | 'STRIPE' | 'BANK_TRANSFER' | 'OTHER';
  transactionId?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyFeePaymentDocument extends IAcademyFeePayment, Document {}

// ==========================================
// FINANCE COMMITTEE INTERFACE (SCREENSHOT 2)
// ==========================================
export type FinanceTransactionType =
  'Game Report' | 'Parent Match Report' | 'CV Validation' | 'Commission' | string;
export type FinanceTransactionStatus = 'COMPLETED' | 'PENDING' | 'REJECTED';

export interface IAcademyFinanceTransaction {
  academyId: Types.ObjectId;
  playerId: Types.ObjectId;
  coachId?: Types.ObjectId;
  reportId?: Types.ObjectId;
  validationId?: Types.ObjectId;
  transactionType: FinanceTransactionType;
  cost: number;
  commissionAcademy: number;
  transactionDate: Date;
  status: FinanceTransactionStatus;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyFinanceTransactionDocument extends IAcademyFinanceTransaction, Document {}

// ==========================================
// ACADEMY MATCHES (SCHEDULE & COSTS)
// ==========================================
export type MatchVenueType = 'HOME GROUND' | 'AWAY' | 'NEUTRAL' | string;
export type MatchScheduleStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface IAcademyMatch {
  academyId: Types.ObjectId;
  matchTitle: string;
  ourTeamId: Types.ObjectId;
  opponentTeam: string;
  matchType: string;
  competitionName?: string;
  homeOrAway: MatchVenueType;
  venueName: string;
  venueAddress: string;
  matchDate: Date;
  kickOffTime: string;
  referees?: string;
  travelRequired?: boolean;
  transportCost?: number;
  groundCost?: number;
  mealsCost?: number;
  otherCosts?: number;
  estimatedTotalCost?: number;
  notes?: string;
  status: MatchScheduleStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyMatchDocument extends IAcademyMatch, Document {}

// ==========================================
// EXTRA EVENTS & TOURNAMENT INTERFACES (SCREENSHOTS)
// ==========================================
export type ExtraEventStatus = 'OPEN' | 'CLOSING SOON' | 'CLOSED';
export type TournamentStatus = 'REGISTRATION' | 'LIVE GAME' | 'COMPLETED';
export type TournamentSimulationStep =
  'NOT_STARTED' | 'GROUP_STAGE' | 'SEMIFINALS' | 'GRAND_FINAL' | 'COMPLETED';

export interface IExtraEventParticipant {
  _id?: Types.ObjectId;
  userId?: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  teamName?: string;
  registeredAt: Date;
  paidAmount?: number;
  paymentStatus?: 'PAID' | 'PENDING' | 'FREE';
}

export interface ITournamentClubRosterPlayer {
  _id?: Types.ObjectId;
  fullName: string;
  dateOfBirth?: string;
  shirtNo?: number;
}

export interface ITournamentBadgePresetItem {
  id: string;
  name: string;
  color: string;
  iconUrl: string;
  isTaken?: boolean;
}

export interface ITournamentRegisteredClub {
  _id?: Types.ObjectId;
  clubId?: string;
  clubName: string;
  name?: string;
  category: string;
  badgePreset?: string;
  badgeName?: string;
  logoUrl?: string;
  coachName: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail: string;
  paymentStatus: 'PAID' | 'PENDING';
  paidAmount: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  allocatedGroup?: 'GROUP A' | 'GROUP B';
  roster: ITournamentClubRosterPlayer[];
  registeredAt: Date;
}

export interface ITournamentFixture {
  _id?: Types.ObjectId;
  matchId: string;
  matchNo: number;
  stage: 'GROUP_STAGE' | 'SEMIFINAL' | 'GRAND_FINAL';
  group?: 'GROUP A' | 'GROUP B';
  homeTeam: {
    clubId?: string;
    _id?: string;
    name: string;
    clubName?: string;
    logoUrl?: string;
    score?: number;
  };
  awayTeam: {
    clubId?: string;
    _id?: string;
    name: string;
    clubName?: string;
    logoUrl?: string;
    score?: number;
  };
  pitch?: string;
  kickoffTime?: string;
  matchDate?: string;
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED';
  isLiveMatch: boolean;
  winner?: string;
}

export interface ITournamentStanding {
  _id?: Types.ObjectId;
  clubId?: string;
  teamId?: string;
  group: 'GROUP A' | 'GROUP B';
  teamName: string;
  clubName?: string;
  name?: string;
  logoUrl?: string;
  p: number; // Played
  w: number; // Won
  d: number; // Drawn
  l: number; // Lost
  gf: number; // Goals For
  ga: number; // Goals Against
  gd: number; // Goal Difference
  pts: number; // Points
  rank?: number;
  isQualified: boolean;
}

export interface ITournamentBracketMatch {
  matchId: string;
  label: string;
  dayLabel?: string;
  homeTeamPlaceholder: string;
  awayTeamPlaceholder: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  winner?: string;
  status: 'PENDING' | 'LIVE' | 'COMPLETED';
}

export interface ITournamentBracket {
  semifinals: ITournamentBracketMatch[];
  grandFinal: ITournamentBracketMatch;
  champion?: string;
  runnerUp?: string;
}

export const TARGET_ATTENDEES_ENUM = [
  'Academy Players Only',
  'Grassroot Players Only',
  'All Members & Families',
  'Coaches & Staff Only',
  'Parents & Guardians Only',
  'Public Event (Open to all)',
  'Mixed / Co-Ed',
] as const;

export type TargetAttendeeType = (typeof TARGET_ATTENDEES_ENUM)[number];

export interface IExtraEvent {
  academyId: Types.ObjectId;
  eventName: string;
  eventType: string;
  group: string;
  ageGroup: string;
  targetAttendees: TargetAttendeeType;
  eventDate: Date;
  eventEndDate?: Date;
  formattedDateRange?: string;
  startTime: string;
  endTime: string;
  registrationDeadline: Date;
  venueName: string;
  venueAddress: string;
  latitude?: number;
  longitude?: number;
  registrationFee: number;
  currency?: string;
  maxCapacity?: number;
  currentAttendees: number;
  description: string;
  requirements?: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  bannerImage?: string;
  status: ExtraEventStatus;
  participants?: IExtraEventParticipant[];
  tournamentStatus?: TournamentStatus;
  isLiveMode?: boolean;
  simulationStep?: TournamentSimulationStep;
  registeredClubs?: ITournamentRegisteredClub[];
  fixtures?: ITournamentFixture[];
  standings?: ITournamentStanding[];
  bracket?: ITournamentBracket;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IExtraEventDocument extends IExtraEvent, Document {}

// ==========================================
// ACADEMY SPONSORS INTERFACES (SCREENSHOTS)
// ==========================================
export type SponsorshipType =
  | 'EQUIPMENT'
  | 'APPAREL'
  | 'FINANCIAL'
  | 'TECHNOLOGY'
  | 'MEDIA'
  | 'MEDICAL'
  | 'NUTRITION'
  | 'OTHER';

export type SponsorStatus = 'ACTIVE' | 'EXPIRING SOON' | 'EXPIRED' | 'PENDING' | 'TERMINATED';

export type SponsorPaymentStatus = 'PAID' | 'PENDING' | 'PARTIALLY_PAID' | 'OVERDUE';

export interface IAcademySponsor {
  academyId: Types.ObjectId;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  fullAddress: string;
  sponsorshipType: SponsorshipType | string;
  sponsorshipStatus: SponsorStatus | string;
  contractValue: number;
  currency?: string;
  paymentStatus: SponsorPaymentStatus | string;
  startDate: Date;
  endDate: Date;
  formattedContractPeriod?: string;
  sponsorshipDescription: string;
  benefitsAndDeliverables?: string;
  logo?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademySponsorDocument extends IAcademySponsor, Document {}

// ==========================================
// ACADEMY NEWS INTERFACES (SCREENSHOTS)
// ==========================================
export type NewsStatus = 'PUBLISHED' | 'DRAFT' | 'BIN';
export type NewsVisibility = 'PUBLIC' | 'PRIVATE';
export type NewsPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface IAcademyNews {
  academyId: Types.ObjectId;
  articleTitle: string;
  category: string;
  author: string;
  publishDate: Date;
  formattedPublishDate?: string;
  fullArticle: string;
  excerpt?: string;
  featuredImage?: string;
  tags?: string[];
  priority: NewsPriority | string;
  visibility: NewsVisibility | string;
  status: NewsStatus | string;
  views: number;
  sendPushNotification: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademyNewsDocument extends IAcademyNews, Document {}

// ==========================================
// ACADEMY SUCCESS STORY INTERFACES (SCREENSHOTS)
// ==========================================
export type SuccessStoryStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface IAcademySuccessStory {
  academyId: Types.ObjectId;
  storyTitle: string;
  playerName?: string;
  position?: string;
  currentAcademy?: string;
  date: Date;
  formattedDate?: string;
  category: string;
  photo?: string;
  storyContent?: string;
  status: SuccessStoryStatus | string;
  rejectionReason?: string;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAcademySuccessStoryDocument extends IAcademySuccessStory, Document {}
