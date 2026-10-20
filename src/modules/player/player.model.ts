import { Schema, model } from 'mongoose';
import {
  IPlayerProfileDocument,
  IPlayerAttributesDocument,
  IPlayerMentalAnalysisDocument,
  IPlayerFullPotentialDocument,
  IFifaCardStatsDocument,
  IMatchRecordDocument,
  IPlayerCvValidationDocument,
  IPlayerMediaDocument,
} from './player.interface';

const PlayerProfileSchema = new Schema<IPlayerProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true },
    position: { type: String, required: true },
    secondaryPositions: [{ type: String }],
    age: { type: Number, default: 18 },
    dateOfBirth: { type: Date },
    country: { type: String, default: 'Bangladesh' },
    dualNationality: { type: String },
    currentClub: { type: String },
    clubLogo: { type: String },
    academy: { type: String },
    contractUntil: { type: Date },
    marketValue: { type: Number, default: 0 },
    overallRating: { type: Number, default: 50 },
    cvTier: { type: String, enum: ['BRONZE', 'SILVER', 'GOLD'], default: 'BRONZE' },
    profileCompletion: { type: Number, default: 0 },
    profileImage: { type: String },
    highlightVideo: { type: String },
    height: { type: Number },
    weight: { type: Number },
    preferredFoot: { type: String, enum: ['RIGHT', 'LEFT', 'BOTH'], default: 'RIGHT' },
    rightFootDominance: { type: Number, min: 0, max: 100 },
    leftFootDominance: { type: Number, min: 0, max: 100 },
    isVerifiedByCoach: { type: Boolean, default: false },
    verifyingCoachId: { type: Schema.Types.ObjectId, ref: 'User' },
    verifyingCoachLicense: { type: String },
    profileViews: { type: Number, default: 0 },
    totalLikes: { type: Number, default: 0 },
    clubsInterested: [
      {
        clubName: { type: String, required: true },
        logoUrl: { type: String },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
    website: { type: String },
    playerStyles: [{ type: String }],
    languages: [
      {
        language: { type: String, required: true },
        proficiency: { type: String, default: 'Intermediate' },
      },
    ],
    accomplishments: [
      {
        year: { type: Number, required: true },
        title: { type: String, required: true },
      },
    ],
    clubHistory: [
      {
        clubName: { type: String, required: true },
        logoUrl: { type: String },
        from: { type: String },
        to: { type: String },
        period: { type: String },
        isCurrent: { type: Boolean, default: false },
      },
    ],
    positionMap: [
      {
        slot: { type: String, required: true },
        position: { type: String },
        role: { type: String },
        x: { type: Number },
        y: { type: Number },
      },
    ],
    futsalMap: [
      {
        slot: { type: String, required: true },
        position: { type: String },
        role: { type: String },
        x: { type: Number },
        y: { type: Number },
      },
    ],
    agentStatus: {
      type: String,
      default: 'UNREPRESENTED',
    },
    agentName: { type: String, default: '' },
    agencyName: { type: String, default: '' },
    clubStatus: {
      type: String,
      default: 'WITHOUT_CLUB',
    },
    transferStatus: {
      status: { type: String, default: 'Active' },
      contractUntil: { type: Date },
      agentName: { type: String },
      agencyName: { type: String },
    },
    playerEvaluation: {
      agentStatus: { type: String, default: 'UNREPRESENTED' },
      hasAgent: { type: Boolean, default: false },
      agentName: { type: String, default: '' },
      agencyName: { type: String, default: '' },
      clubStatus: { type: String, default: 'WITHOUT_CLUB' },
      hasClub: { type: Boolean, default: false },
      currentClub: { type: String, default: '' },
      contractUntil: { type: Date },
      marketValue: { type: Number, default: 0 },
    },
    coachVerification: {
      isVerified: { type: Boolean, default: false },
      coachName: { type: String },
      licenseNumber: { type: String },
      clubManaged: { type: String },
      verifiedAt: { type: Date },
    },
    perceptionMetrics: {
      spaceAwareness: {
        score: { type: Number, default: 92 },
        trend: { type: Number, default: 3 },
        grade: { type: String, default: 'EXCELLENT' },
      },
      opponentReading: {
        score: { type: Number, default: 88 },
        trend: { type: Number, default: 5 },
        grade: { type: String, default: 'GOOD' },
      },
      gameFlowUnderstanding: {
        score: { type: Number, default: 85 },
        trend: { type: Number, default: 2 },
        grade: { type: String, default: 'GOOD' },
      },
      pressureHandling: {
        score: { type: Number, default: 90 },
        trend: { type: Number, default: 4 },
        grade: { type: String, default: 'EXCELLENT' },
      },
    },
    visionMetrics: {
      peripheralVision: {
        score: { type: Number, default: 87 },
        trend: { type: Number, default: 3 },
        grade: { type: String, default: 'GOOD' },
      },
      focusControl: {
        score: { type: Number, default: 85 },
        trend: { type: Number, default: 2 },
        grade: { type: String, default: 'GOOD' },
      },
      patternRecognition: {
        score: { type: Number, default: 89 },
        trend: { type: Number, default: 4 },
        grade: { type: String, default: 'GOOD' },
      },
      decisionSpeed: {
        score: { type: Number, default: 91 },
        trend: { type: Number, default: 5 },
        grade: { type: String, default: 'EXCELLENT' },
      },
      visualAcuity: {
        score: { type: Number, default: 86 },
        trend: { type: Number, default: 1 },
        grade: { type: String, default: 'GOOD' },
      },
      visionField: {
        score: { type: Number, default: 85 },
        trend: { type: Number, default: 0 },
        grade: { type: String, default: 'GOOD' },
      },
      targetFinding: {
        score: { type: Number, default: 85 },
        trend: { type: Number, default: 0 },
        grade: { type: String, default: 'GOOD' },
      },
    },
    documents: [
      {
        title: { type: String, required: true },
        url: { type: String, required: true },
        fileType: { type: String },
        size: { type: Number },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

PlayerProfileSchema.index({ overallRating: -1 });
PlayerProfileSchema.index({ cvTier: 1 });
PlayerProfileSchema.index({ position: 1 });
PlayerProfileSchema.index({ createdAt: -1 });

const PlayerAttributesSchema = new Schema<IPlayerAttributesDocument>(
  {
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, unique: true },
    ballControl: { type: Number, default: 50 },
    dribbling: { type: Number, default: 50 },
    shortPassing: { type: Number, default: 50 },
    longPassing: { type: Number, default: 50 },
    crossing: { type: Number, default: 50 },
    shooting: { type: Number, default: 50 },
    finishing: { type: Number, default: 50 },
    longShots: { type: Number, default: 50 },
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
    concentration: { type: Number, default: 50 },
    consistency: { type: Number, default: 50 },
    interceptions: { type: Number, default: 50 },
    marking: { type: Number, default: 50 },
    leadership: { type: Number, default: 50 },
    bravery: { type: Number, default: 50 },
    determination: { type: Number, default: 50 },
    heading: { type: Number, default: 50 },
    influence: { type: Number, default: 50 },
    composition: { type: Number, default: 50 },

    // Attacking (8)
    firstTouch: { type: Number, default: 50 },
    shotPower: { type: Number, default: 50 },
    curve: { type: Number, default: 50 },
    freeKick: { type: Number, default: 50 },
    penalties: { type: Number, default: 50 },
    volleys: { type: Number, default: 50 },
    headingAccuracy: { type: Number, default: 50 },
    weakFoot: { type: Number, default: 50 },

    // Defending (8)
    standingTackle: { type: Number, default: 50 },
    slidingTackle: { type: Number, default: 50 },
    tackling: { type: Number, default: 50 },
    aerialDuels: { type: Number, default: 50 },
    clearance: { type: Number, default: 50 },
    pressing: { type: Number, default: 50 },
    defensiveAwareness: { type: Number, default: 50 },
  },
  { strict: false, timestamps: true },
);

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
    playerInfo: {
      playerName: { type: String },
      dateOfBirth: { type: Schema.Types.Mixed },
      clubName: { type: String },
      position: { type: String },
      foot: { type: String },
      characteristics: [{ type: String }],
      weight: { type: Number },
      height: { type: Number },
    },
    gameType: { type: String },
    gameDate: { type: Schema.Types.Mixed },
    gameLocation: { type: String },
    matchResult: { type: String },
    weather: { type: String },
    temperature: { type: Number },
    scoutName: { type: String },
    reportCompletionType: { type: String, enum: ['SELF', 'COACH'], default: 'SELF' },
    // Legacy optional fields
    matchDate: { type: Date, default: Date.now },
    leagueType: { type: String, default: 'Championship' },
    homeTeam: { type: String, default: 'Home Team' },
    awayTeam: { type: String, default: 'Away Team' },
    homeScore: { type: Number, default: 0 },
    awayScore: { type: Number, default: 0 },
    result: { type: String, enum: ['W', 'D', 'L'], default: 'W' },
    location: { type: String },
    playerRating: { type: Number, default: 6.0 },
    goals: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    passes: { type: Number, default: 0 },
    passAccuracy: { type: Number, default: 0 },
    minutesPlayed: { type: Number, default: 0 },
    matchDuration: { type: String },
    yellowCards: { type: Number, default: 0 },
    redCards: { type: Number, default: 0 },
    tackles: { type: Number, default: 0 },
    events: [
      {
        eventId: { type: String, required: true },
        count: { type: Number, required: true },
      },
    ],
    stats: {
      shotsOnGoal: { type: Number, default: 0 },
      goalScored: { type: Number, default: 0 },
      assists: { type: Number, default: 0 },
      passAccurate: { type: Number, default: 0 },
      wrongPass: { type: Number, default: 0 },
      penaltiesTaken: { type: Number, default: 0 },
      freeKick: { type: Number, default: 0 },
      cornerKick: { type: Number, default: 0 },
      standTackle: { type: Number, default: 0 },
      slidingTackle: { type: Number, default: 0 },
      interception: { type: Number, default: 0 },
      appearances: { type: Number, default: 1 },
      fault: { type: Number, default: 0 },
      yellowCard: { type: Number, default: 0 },
      redCard: { type: Number, default: 0 },
      savesAccurate: { type: Number, default: 0 },
      goalUnsave: { type: Number, default: 0 },
      penaltiesSaves: { type: Number, default: 0 },
      punching: { type: Number, default: 0 },
      handling: { type: Number, default: 0 },
      reflex: { type: Number, default: 0 },
      aerialAbility: { type: Number, default: 0 },
      throwing: { type: Number, default: 0 },
      reactions: { type: Number, default: 0 },
    },
    accurateShots: [
      {
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        target: { type: String, enum: ['goal', 'saved', 'missed'], default: 'goal' },
      },
    ],
    accurateAssists: [
      {
        x: { type: Number },
        y: { type: Number },
        fromX: { type: Number },
        fromY: { type: Number },
        toX: { type: Number },
        toY: { type: Number },
        assistType: {
          type: String,
          enum: ['ground', 'through', 'aerial', 'cross'],
          default: 'ground',
        },
      },
    ],
    coachReview: {
      coachId: { type: Schema.Types.ObjectId, ref: 'User' },
      coachEmail: { type: String },
      coachName: { type: String },
      paymentStatus: { type: String, enum: ['UNPAID', 'PAID', 'FREE'], default: 'FREE' },
      paymentAmount: { type: Number, default: 0 },
      transactionId: { type: String },
      status: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'UNREQUESTED'],
        default: 'UNREQUESTED',
      },
      evaluatedAt: { type: Date },
      coachRating: { type: Number },
      coachFeedback: { type: String },
    },
    positivePoints: { type: Number },
    negativePoints: { type: Number },
    netContribution: { type: Number },
    interpretation: { type: String },
    categoryScores: { type: Map, of: Number },
    categoryRatings: { type: Map, of: Number },
    plottedEventsJson: { type: String },
    reportPdfUrl: { type: String },
  },
  { timestamps: true },
);

MatchRecordSchema.index({ playerId: 1, matchDate: -1 });

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

const PlayerMediaSchema = new Schema<IPlayerMediaDocument>(
  {
    playerId: { type: Schema.Types.ObjectId, ref: 'PlayerProfile', required: true },
    url: { type: String, required: true },
    title: { type: String, required: true },
    mediaType: { type: String, enum: ['IMAGE', 'VIDEO'], required: true },
    thumbnailUrl: { type: String },
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const PlayerMedia = model<IPlayerMediaDocument>('PlayerMedia', PlayerMediaSchema);
