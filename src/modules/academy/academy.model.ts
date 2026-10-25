import { Schema, model } from 'mongoose';
import {
  IAcademyProfileDocument,
  ITeamDocument,
  IGameReportDocument,
  IPlayerEvaluationDocument,
  IAcademyCoachDocument,
  ITransferRequestDocument,
  IAcademyFeePaymentDocument,
  IAcademyFinanceTransactionDocument,
  IAcademyMatchDocument,
  IExtraEventDocument,
  IExtraEventParticipant,
  IAcademySponsorDocument,
  IAcademyNewsDocument,
  IAcademySuccessStoryDocument,
} from './academy.interface';

const AcademyProfileSchema = new Schema<IAcademyProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, default: 'General Academy' },
    establishedDate: { type: Date },
    country: { type: String, default: 'Bangladesh' },
    city: { type: String, default: 'Dhaka' },
    location: { type: String },
    nationality: { type: String },
    contactPhone: { type: String },
    contactEmail: { type: String },
    registrationId: { type: String },
    estimatedAcademySize: { type: String },
    logo: { type: String },
    coverPhoto: { type: String },
    description: { type: String },
    visionAndMission: { type: String },
    trainingPhilosophy: { type: String },
    currentPlan: {
      type: String,
      enum: ['FREE', 'BASIC', 'PRO', 'PREMIUM', 'ELITE'],
      default: 'FREE',
    },
    maxTeams: { type: Number, default: 1 },
    league: { type: String, default: 'Premier League' },
    achievements: [
      {
        year: { type: String },
        championship: { type: String },
        venue: { type: String },
      },
    ],
    likedPlayerIds: [{ type: Schema.Types.ObjectId, ref: 'PlayerProfile' }],
    sharedPlayerProfiles: [
      {
        playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile' },
        sharedAt: { type: Date, default: Date.now },
        shareCount: { type: Number, default: 1 },
      },
    ],
  },
  { timestamps: true },
);

const TeamSchema = new Schema<ITeamDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    teamName: { type: String, required: true },
    ageGroup: { type: String, required: true },
    coachesCount: { type: Number, default: 0 },
    playersCount: { type: Number, default: 0 },
    totalMembers: { type: Number, default: 0 },
    coachIds: [{ type: Schema.Types.ObjectId, ref: 'CoachProfile' }],
    playerIds: [{ type: Schema.Types.ObjectId, ref: 'PlayerProfile' }],
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  },
  { timestamps: true },
);

const GameReportSchema = new Schema<IGameReportDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile' },
    scoutName: { type: String },
    matchName: { type: String, required: true },
    matchDate: { type: Date, required: true },
    overallPerformanceScore: { type: Number, required: true },
    goals: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    passes: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'PENDING', 'UNPAID'],
      default: 'UNPAID',
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'APPROVED'],
      default: 'PENDING',
    },
  },
  { timestamps: true },
);

const PlayerEvaluationSchema = new Schema<IPlayerEvaluationDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: false, index: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, index: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', required: true, index: true },
    evaluationDate: { type: Date, default: Date.now },
    overallRating: { type: Number },
    technicalScore: { type: Number },
    physicalScore: { type: Number },
    mentalScore: { type: Number },
    techniques: {
      type: Map,
      of: String,
      default: {},
    },
    characteristics: {
      type: Map,
      of: String,
      default: {},
    },
    physical: {
      type: Map,
      of: String,
      default: {},
    },
    improvementDelta: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['EVALUATED', 'NEED_EVALUATION', 'EXPIRED', 'OVERDUE'],
      default: 'NEED_EVALUATION',
      index: true,
    },
    nextEvaluationDue: { type: Date, index: true },
    expiresAt: { type: Date, index: true },
    requestedByManagerId: { type: Schema.Types.ObjectId, ref: 'User' },
    reminderSentAt: { type: Date },
    reminderCount: { type: Number, default: 0 },
    coachFeedback: { type: String },
    notes: { type: String },
  },
  { timestamps: true },
);

export const AcademyProfile = model<IAcademyProfileDocument>(
  'AcademyProfile',
  AcademyProfileSchema,
);
export const Team = model<ITeamDocument>('Team', TeamSchema);
export const GameReport = model<IGameReportDocument>('GameReport', GameReportSchema);
export const PlayerEvaluation = model<IPlayerEvaluationDocument>(
  'PlayerEvaluation',
  PlayerEvaluationSchema,
);

const AcademyCoachSchema = new Schema<IAcademyCoachDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile', required: true, index: true },
    coachUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, default: 'Youth Coach' },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'REMOVED'],
      default: 'PENDING',
      index: true,
    },
    requestedBy: {
      type: String,
      enum: ['ACADEMY', 'COACH'],
      required: true,
    },
    requestMessage: { type: String },
    responseNote: { type: String },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
  },
  { timestamps: true },
);

AcademyCoachSchema.index({ academyId: 1, coachId: 1 }, { unique: true });
AcademyCoachSchema.index({ academyId: 1, status: 1 });
AcademyCoachSchema.index({ coachId: 1, status: 1 });

export const AcademyCoach = model<IAcademyCoachDocument>('AcademyCoach', AcademyCoachSchema);

const TransferRequestSchema = new Schema<ITransferRequestDocument>(
  {
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, index: true },
    fromAcademyId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademyProfile',
      required: true,
      index: true,
    },
    toAcademyId: {
      type: Schema.Types.ObjectId,
      ref: 'AcademyProfile',
      required: true,
      index: true,
    },
    fromTeamId: { type: Schema.Types.ObjectId, ref: 'Team' },
    toTeamId: { type: Schema.Types.ObjectId, ref: 'Team' },
    transferType: {
      type: String,
      enum: ['OUTGOING', 'INCOMING'],
      required: true,
    },
    requestedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByCoachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile' },
    requestedByRole: { type: String, default: 'ACADEMY' },
    requesterName: { type: String },
    reason: { type: String },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    responseNote: { type: String },
    respondedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

TransferRequestSchema.index({ fromAcademyId: 1, status: 1 });
TransferRequestSchema.index({ toAcademyId: 1, status: 1 });
TransferRequestSchema.index({ playerId: 1, status: 1 });

export const TransferRequest = model<ITransferRequestDocument>(
  'TransferRequest',
  TransferRequestSchema,
);

// ==========================================
// FEES & PAYMENTS SCHEMA (SCREENSHOT 1)
// ==========================================
const AcademyFeePaymentSchema = new Schema<IAcademyFeePaymentDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'ParentProfile' },
    feeType: { type: String, required: true, default: 'Monthly Fee' },
    amount: { type: Number, required: true },
    paymentDate: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ['PAID', 'UNPAID', 'PENDING'],
      default: 'PAID',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'CARD', 'STRIPE', 'BANK_TRANSFER', 'OTHER'],
      default: 'CASH',
    },
    transactionId: { type: String },
    notes: { type: String },
  },
  { timestamps: true },
);

AcademyFeePaymentSchema.index({ academyId: 1, paymentDate: -1 });

export const AcademyFeePayment = model<IAcademyFeePaymentDocument>(
  'AcademyFeePayment',
  AcademyFeePaymentSchema,
);

// ==========================================
// FINANCE COMMITTEE SCHEMA (SCREENSHOT 2)
// ==========================================
const AcademyFinanceTransactionSchema = new Schema<IAcademyFinanceTransactionDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, index: true },
    coachId: { type: Schema.Types.ObjectId, ref: 'CoachProfile' },
    reportId: { type: Schema.Types.ObjectId, ref: 'GameReport' },
    validationId: { type: Schema.Types.ObjectId, ref: 'PlayerCvValidation' },
    transactionType: { type: String, required: true, default: 'Game Report' },
    cost: { type: Number, required: true },
    commissionAcademy: { type: Number, required: true },
    transactionDate: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ['COMPLETED', 'PENDING', 'REJECTED'],
      default: 'COMPLETED',
      index: true,
    },
    notes: { type: String },
  },
  { timestamps: true },
);

AcademyFinanceTransactionSchema.index({ academyId: 1, transactionDate: -1 });

export const AcademyFinanceTransaction = model<IAcademyFinanceTransactionDocument>(
  'AcademyFinanceTransaction',
  AcademyFinanceTransactionSchema,
);

// ==========================================
// ACADEMY MATCHES (SCHEDULE & COSTS)
// ==========================================
const AcademyMatchSchema = new Schema<IAcademyMatchDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    matchTitle: { type: String, required: true },
    ourTeamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    opponentTeam: { type: String, required: true },
    matchType: { type: String, required: true, default: 'Friendly' },
    competitionName: { type: String },
    homeOrAway: {
      type: String,
      default: 'HOME GROUND',
    },
    venueName: { type: String, required: true },
    venueAddress: { type: String, required: true },
    matchDate: { type: Date, required: true },
    kickOffTime: { type: String, required: true },
    referees: { type: String },
    travelRequired: { type: Boolean, default: false },
    transportCost: { type: Number, default: 0 },
    groundCost: { type: Number, default: 0 },
    mealsCost: { type: Number, default: 0 },
    otherCosts: { type: Number, default: 0 },
    estimatedTotalCost: { type: Number, default: 0 },
    notes: { type: String },
    status: {
      type: String,
      enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED'],
      default: 'SCHEDULED',
      index: true,
    },
  },
  { timestamps: true },
);

AcademyMatchSchema.pre('save', function (next) {
  this.estimatedTotalCost =
    (Number(this.transportCost) || 0) +
    (Number(this.groundCost) || 0) +
    (Number(this.mealsCost) || 0) +
    (Number(this.otherCosts) || 0);
  next();
});

AcademyMatchSchema.index({ academyId: 1, matchDate: 1 });
AcademyMatchSchema.index({ ourTeamId: 1, matchDate: 1 });

export const AcademyMatch = model<IAcademyMatchDocument>('AcademyMatch', AcademyMatchSchema);

// ==========================================
// EXTRA EVENTS SCHEMA & MODEL (SCREENSHOTS)
// ==========================================
const ExtraEventParticipantSchema = new Schema<IExtraEventParticipant>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    teamName: { type: String },
    registeredAt: { type: Date, default: Date.now },
    paidAmount: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'PENDING', 'FREE'],
      default: 'FREE',
    },
  },
  { _id: true },
);

export const ExtraEventSchema = new Schema<IExtraEventDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    eventName: { type: String, required: true, trim: true },
    eventType: { type: String, required: true, index: true },
    group: { type: String, required: true },
    ageGroup: { type: String, required: true },
    targetAttendees: { type: String, required: true },
    eventDate: { type: Date, required: true, index: true },
    eventEndDate: { type: Date },
    formattedDateRange: { type: String },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    registrationDeadline: { type: Date, required: true },
    venueName: { type: String, required: true },
    venueAddress: { type: String, required: true },
    registrationFee: { type: Number, default: 0 },
    currency: { type: String, default: '£' },
    maxCapacity: { type: Number },
    currentAttendees: { type: Number, default: 0 },
    description: { type: String, required: true },
    requirements: { type: String },
    contactPerson: { type: String, required: true },
    contactPhone: { type: String, required: true },
    contactEmail: { type: String, required: true },
    bannerImage: { type: String },
    status: {
      type: String,
      enum: ['OPEN', 'CLOSING SOON', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },
    participants: [ExtraEventParticipantSchema],
  },
  { timestamps: true },
);

ExtraEventSchema.pre('save', function (next) {
  // Format readable date string if not manually set (e.g. 15-20 FEBRUARY 2026 or 5 MARCH 2026)
  if (!this.formattedDateRange && this.eventDate) {
    const start = new Date(this.eventDate);
    const months = [
      'JANUARY',
      'FEBRUARY',
      'MARCH',
      'APRIL',
      'MAY',
      'JUNE',
      'JULY',
      'AUGUST',
      'SEPTEMBER',
      'OCTOBER',
      'NOVEMBER',
      'DECEMBER',
    ];
    if (this.eventEndDate) {
      const end = new Date(this.eventEndDate);
      if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        this.formattedDateRange = `${start.getDate()}-${end.getDate()} ${months[start.getMonth()]} ${start.getFullYear()}`;
      } else {
        this.formattedDateRange = `${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
      }
    } else {
      this.formattedDateRange = `${start.getDate()} ${months[start.getMonth()]} ${start.getFullYear()}`;
    }
  }

  // Automatic status calculation
  const now = new Date();
  if (this.registrationDeadline && new Date(this.registrationDeadline) < now) {
    this.status = 'CLOSED';
  } else if (this.maxCapacity && this.currentAttendees >= this.maxCapacity) {
    this.status = 'CLOSED';
  } else if (
    this.registrationDeadline &&
    new Date(this.registrationDeadline).getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1000
  ) {
    if (this.status !== 'CLOSED') {
      this.status = 'CLOSING SOON';
    }
  }

  next();
});

ExtraEventSchema.index({ academyId: 1, eventDate: 1 });
ExtraEventSchema.index({ academyId: 1, eventType: 1 });
ExtraEventSchema.index({ academyId: 1, status: 1 });

export const ExtraEvent = model<IExtraEventDocument>('ExtraEvent', ExtraEventSchema);

// ==========================================
// ACADEMY SPONSORS SCHEMA & MODEL (SCREENSHOTS)
// ==========================================
export const AcademySponsorSchema = new Schema<IAcademySponsorDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    fullAddress: { type: String, required: true, trim: true },
    sponsorshipType: {
      type: String,
      required: true,
      enum: [
        'EQUIPMENT',
        'APPAREL',
        'FINANCIAL',
        'TECHNOLOGY',
        'MEDIA',
        'MEDICAL',
        'NUTRITION',
        'OTHER',
      ],
      default: 'FINANCIAL',
      index: true,
    },
    sponsorshipStatus: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'EXPIRING SOON', 'EXPIRED', 'PENDING', 'TERMINATED'],
      default: 'ACTIVE',
      index: true,
    },
    contractValue: { type: Number, required: true, default: 0 },
    currency: { type: String, default: '$' },
    paymentStatus: {
      type: String,
      required: true,
      enum: ['PAID', 'PENDING', 'PARTIALLY_PAID', 'OVERDUE'],
      default: 'PENDING',
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    formattedContractPeriod: { type: String },
    sponsorshipDescription: { type: String, required: true },
    benefitsAndDeliverables: { type: String },
    logo: { type: String },
  },
  { timestamps: true },
);

AcademySponsorSchema.pre('save', function (next) {
  // Format contract period (e.g. "Jan 1, 2026 to Dec 31, 2026")
  if (!this.formattedContractPeriod && this.startDate && this.endDate) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const s = new Date(this.startDate);
    const e = new Date(this.endDate);
    this.formattedContractPeriod = `${months[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} to ${months[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  }

  // Dynamic status evaluation
  const now = new Date();
  if (this.endDate) {
    const end = new Date(this.endDate);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (end.getTime() < now.getTime()) {
      this.sponsorshipStatus = 'EXPIRED';
    } else if (end.getTime() - now.getTime() <= thirtyDays) {
      if (this.sponsorshipStatus === 'ACTIVE') {
        this.sponsorshipStatus = 'EXPIRING SOON';
      }
    }
  }

  next();
});

AcademySponsorSchema.index({ academyId: 1, sponsorshipStatus: 1 });
AcademySponsorSchema.index({ academyId: 1, sponsorshipType: 1 });
AcademySponsorSchema.index({ academyId: 1, paymentStatus: 1 });

export const AcademySponsor = model<IAcademySponsorDocument>(
  'AcademySponsor',
  AcademySponsorSchema,
);

// ==========================================
// ACADEMY NEWS SCHEMA & MODEL (SCREENSHOTS)
// ==========================================
export const AcademyNewsSchema = new Schema<IAcademyNewsDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    articleTitle: { type: String, required: true, trim: true },
    category: { type: String, default: 'General News', index: true },
    author: { type: String, default: 'Admin' },
    publishDate: { type: Date, default: Date.now },
    formattedPublishDate: { type: String },
    fullArticle: { type: String, default: '' },
    excerpt: { type: String },
    featuredImage: { type: String },
    tags: [{ type: String }],
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM',
    },
    visibility: {
      type: String,
      enum: ['PUBLIC', 'PRIVATE'],
      default: 'PUBLIC',
      index: true,
    },
    status: {
      type: String,
      enum: ['PUBLISHED', 'DRAFT', 'BIN'],
      default: 'PUBLISHED',
      index: true,
    },
    views: { type: Number, default: 0 },
    sendPushNotification: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

AcademyNewsSchema.pre('save', function (next) {
  // Format publish date (e.g. "JAN 22, 2026")
  if (!this.formattedPublishDate && this.publishDate) {
    const months = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ];
    const d = new Date(this.publishDate);
    this.formattedPublishDate = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  // Auto-generate excerpt if not provided
  if (!this.excerpt && this.fullArticle) {
    const plain = this.fullArticle.replace(/<[^>]*>?/gm, '').trim();
    this.excerpt = plain.length > 120 ? `${plain.substring(0, 117)}...` : plain;
  }

  next();
});

AcademyNewsSchema.index({ academyId: 1, status: 1 });
AcademyNewsSchema.index({ academyId: 1, visibility: 1 });
AcademyNewsSchema.index({ academyId: 1, isDeleted: 1 });

export const AcademyNews = model<IAcademyNewsDocument>('AcademyNews', AcademyNewsSchema);

// ==========================================
// ACADEMY SUCCESS STORY MODEL (SCREENSHOTS)
// ==========================================
const AcademySuccessStorySchema = new Schema<IAcademySuccessStoryDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', required: true, index: true },
    storyTitle: { type: String, required: true, trim: true },
    playerName: { type: String, trim: true },
    position: { type: String, trim: true },
    currentAcademy: { type: String, trim: true },
    date: { type: Date, required: true, default: Date.now },
    formattedDate: { type: String },
    category: { type: String, required: true, trim: true },
    photo: { type: String, default: '' },
    storyContent: { type: String, default: '' },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    rejectionReason: { type: String },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

AcademySuccessStorySchema.pre('save', function (next) {
  if (this.date) {
    try {
      const d = new Date(this.date);
      this.formattedDate = d.toISOString().split('T')[0];
    } catch {
      // Ignore date formatting error
    }
  }
  next();
});

AcademySuccessStorySchema.index({ academyId: 1, status: 1 });
AcademySuccessStorySchema.index({ academyId: 1, isDeleted: 1 });

export const AcademySuccessStory = model<IAcademySuccessStoryDocument>(
  'AcademySuccessStory',
  AcademySuccessStorySchema,
);
