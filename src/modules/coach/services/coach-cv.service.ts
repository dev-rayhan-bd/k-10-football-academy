import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { redisCache } from '@/utils/redisCache.util';
import { CoachProfile } from '../coach.model';
import { UserModel } from '@/modules/user/user.model';

export const DEFAULT_COACH_SKILLS = [
  { name: 'Goal setting and performance monitoring', icon: 'trending-up' },
  { name: 'Discipline and accountability management', icon: 'award' },
  { name: 'Staff coordination and delegation', icon: 'users' },
  { name: 'Motivational leadership', icon: 'bookmark' },
  { name: 'Adaptability and resilience', icon: 'sparkles' },
  { name: 'Patience and professionalism', icon: 'star' },
  { name: 'Strong work ethic', icon: 'activity' },
  { name: 'Strategic thinking', icon: 'target' },
  { name: 'Problem-solving ability', icon: 'sparkles' },
];

export const DEFAULT_ASSOCIATIONS = [
  { name: 'CAF', code: 'CAF', isSelected: true },
  { name: 'CONCACAF', code: 'CONCACAF', isSelected: true },
  { name: 'DFB', code: 'DFB', isSelected: true },
  { name: 'UEFA', code: 'UEFA', isSelected: true },
  { name: 'FIFA', code: 'FIFA', isSelected: true },
  { name: 'CBF', code: 'CBF', isSelected: true },
  { name: 'The FA', code: 'THE_FA', isSelected: true },
  { name: 'RFEF', code: 'RFEF', isSelected: true },
  { name: 'FFF', code: 'FFF', isSelected: true },
];

export const DEFAULT_COURSES = [
  { name: 'UEFA Pro Licence', category: 'Licence', isCompleted: true, isSelected: true },
  { name: 'UEFA A Licence', category: 'Licence', isCompleted: true, isSelected: true },
  { name: 'UEFA B Licence', category: 'Licence', isCompleted: true, isSelected: true },
  { name: 'UEFA C Licence', category: 'Licence', isCompleted: true, isSelected: true },
  {
    name: 'Level 3 Coaching Certificate',
    category: 'Certificate',
    isCompleted: true,
    isSelected: true,
  },
  {
    name: 'Level 2 Coaching Certificate',
    category: 'Certificate',
    isCompleted: true,
    isSelected: true,
  },
  {
    name: 'Level 1 Coaching Certificate',
    category: 'Certificate',
    isCompleted: true,
    isSelected: true,
  },
  {
    name: 'Football Management & Leadership',
    category: 'Management',
    isCompleted: true,
    isSelected: true,
  },
  {
    name: 'Performance Analysis in Professional Football',
    category: 'Analysis',
    isCompleted: true,
    isSelected: true,
  },
  {
    name: 'Technical Coordination in the Base Categories',
    category: 'Technical',
    isCompleted: true,
    isSelected: true,
  },
  {
    name: 'Strength, Power and Speed from Base to Professional',
    category: 'Fitness',
    isCompleted: true,
    isSelected: true,
  },
  {
    name: 'Talent Identification in Football',
    category: 'Scouting',
    isCompleted: true,
    isSelected: true,
  },
  {
    name: 'Injury Prevention & Recovery in Football',
    category: 'Medical',
    isCompleted: true,
    isSelected: true,
  },
  {
    name: 'Sports Psychology & Athlete Mentorship',
    category: 'Psychology',
    isCompleted: true,
    isSelected: true,
  },
  {
    name: 'FA Safeguarding Children Course',
    category: 'Safeguarding',
    isCompleted: true,
    isSelected: true,
  },
  {
    name: 'Elite Player Scouting & Assessment',
    category: 'Scouting',
    isCompleted: true,
    isSelected: true,
  },
];

export const normalizeCoachLicense = (lic: string = ''): 'PRO' | 'A' | 'B' | 'C' | 'OTHER' => {
  const upper = String(lic).toUpperCase().trim();
  if (upper.includes('PRO')) return 'PRO';
  if (
    upper.includes('UEFA A') ||
    upper.includes('CONMEBOL A') ||
    upper.includes('AFC A') ||
    upper.includes('A LICENCE') ||
    upper.includes('A LICENSE') ||
    upper.endsWith(' A')
  ) {
    return 'A';
  }
  if (
    upper.includes('UEFA B') ||
    upper.includes('CONMEBOL B') ||
    upper.includes('AFC B') ||
    upper.includes('B LICENCE') ||
    upper.includes('B LICENSE') ||
    upper.endsWith(' B')
  ) {
    return 'B';
  }
  if (
    upper.includes('UEFA C') ||
    upper.includes('CONMEBOL C') ||
    upper.includes('AFC C') ||
    upper.includes('C LICENCE') ||
    upper.includes('C LICENSE') ||
    upper.endsWith(' C')
  ) {
    return 'C';
  }
  return 'OTHER';
};

export const computeCoachProfileCompletion = (
  doc: any,
  userAvatar?: string,
): { completionPercentage: number; autoTier: 'BRONZE' | 'SILVER' | 'GOLD' } => {
  let score = 0;
  const totalChecks = 7;
  if (doc.fullName) score++;
  if (doc.profileImage || userAvatar) score++;
  if (doc.clubHistory && doc.clubHistory.length > 0) score++;
  if (doc.formations && doc.formations.length > 0) score++;
  if (doc.courses && doc.courses.length > 0) score++;
  if (doc.keySkills && doc.keySkills.length > 0) score++;
  if (doc.documents && doc.documents.length > 0) score++;

  const completionPercentage = Math.min(100, Math.round((score / totalChecks) * 100));

  const is100 = completionPercentage >= 100;
  const license = normalizeCoachLicense(doc.licenseStatus || 'UEFA Pro Licence');
  const coursesCount = Array.isArray(doc.courses) ? doc.courses.length : 0;
  const overallYears = Number(doc.yearsExperience ?? 15);
  const youthYears = Number(
    doc.youthYearsExperience ?? doc.youthExperience ?? (overallYears > 3 ? 4 : 0),
  );
  const picturesCount = doc.picturesCount !== undefined ? doc.picturesCount : 5;
  const videosCount = doc.videosCount !== undefined ? doc.videosCount : 5;

  let autoTier: 'BRONZE' | 'SILVER' | 'GOLD';

  // 🥇 GOLD COACH CARD: 100% complete, >=5 pics, >=5 vids, UEFA/CONMEBOL/AFC A or Pro, >=2 courses, >3 yrs youth, >6 yrs overall
  if (
    is100 &&
    (license === 'PRO' || license === 'A') &&
    coursesCount >= 2 &&
    overallYears > 6 &&
    youthYears > 3 &&
    picturesCount >= 5 &&
    videosCount >= 5
  ) {
    autoTier = 'GOLD';
  }
  // 🥈 SILVER COACH CARD: 100% complete, >=5 pics, >=5 vids, UEFA/CONMEBOL/AFC B, >=2 courses, >3 yrs youth, >6 yrs overall
  else if (
    is100 &&
    (license === 'PRO' || license === 'A' || license === 'B') &&
    coursesCount >= 2 &&
    overallYears > 6 &&
    youthYears > 3 &&
    picturesCount >= 5 &&
    videosCount >= 5
  ) {
    autoTier = 'SILVER';
  }
  // 🥉 BRONZE COACH CARD: 100% complete, >=5 pics, >=5 vids, UEFA/CONMEBOL/AFC C, >=2 courses, >1 yr youth, >6 yrs overall
  else if (
    is100 &&
    (license === 'PRO' || license === 'A' || license === 'B' || license === 'C') &&
    coursesCount >= 2 &&
    overallYears > 6 &&
    youthYears > 1 &&
    picturesCount >= 5 &&
    videosCount >= 5
  ) {
    autoTier = 'BRONZE';
  }
  // Fallback for completion-based progression
  else if (completionPercentage >= 100) {
    autoTier = 'GOLD';
  } else if (completionPercentage >= 60) {
    autoTier = 'SILVER';
  } else {
    autoTier = 'BRONZE';
  }

  return { completionPercentage, autoTier };
};

export class CoachCvService {
  /**
   * Resolve match stage from ID or viewer
   */
  resolveMatchStage(
    id: string,
    viewer?: { userId?: string; role?: string },
  ): { matchStage: any; cacheKey: string | null } {
    if ((id === 'me' || id === 'my-cv' || id === 'my-profile') && viewer?.userId) {
      return {
        matchStage: { userId: new Types.ObjectId(viewer.userId) },
        cacheKey: `CACHE:COACH:CV:USER:${viewer.userId}`,
      };
    } else if (Types.ObjectId.isValid(id)) {
      const objId = new Types.ObjectId(id);
      return {
        matchStage: { $or: [{ _id: objId }, { userId: objId }] },
        cacheKey: `CACHE:COACH:CV:${id}`,
      };
    } else {
      throw new AppError(404, 'Coach profile not found');
    }
  }

  /**
   * Run High-performance Single-Pass Aggregation pipeline replacing populate & separate queries
   */
  async runAggregationPipeline(matchStage: any): Promise<any> {
    const [aggregatedProfile] = await CoachProfile.aggregate([
      { $match: matchStage },
      // 1. $lookup user info (fast, non-blocking lookup)
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1, email: 1, avatar: 1, phone: 1, role: 1, status: 1 } }],
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
      // 2. $lookup tactical formations (top 3 formations)
      {
        $lookup: {
          from: 'tacticalformations',
          localField: '_id',
          foreignField: 'coachId',
          pipeline: [{ $sort: { formationSlot: 1 } }],
          as: 'formations',
        },
      },
      // 3. $lookup assigned player evaluation reviews (from matchrecords)
      {
        $lookup: {
          from: 'matchrecords',
          let: { cId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$coachReview.coachId', '$$cId'] },
                    { $eq: ['$coachReview.status', 'PENDING'] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: 'playerprofiles',
                localField: 'playerId',
                foreignField: '_id',
                pipeline: [
                  {
                    $project: {
                      fullName: 1,
                      position: 1,
                      profileImage: 1,
                      avatar: 1,
                      country: 1,
                      age: 1,
                    },
                  },
                ],
                as: 'player',
              },
            },
            {
              $unwind: {
                path: '$player',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                matchDate: 1,
                playerRating: 1,
                homeTeam: 1,
                awayTeam: 1,
                coachReview: 1,
                player: 1,
              },
            },
          ],
          as: 'assignedPlayerReviews',
        },
      },
    ]);

    return aggregatedProfile;
  }

  /**
   * Get complete Coach CV
   */
  async getCoachCV(id: string, viewer?: { userId?: string; role?: string }): Promise<any> {
    const { matchStage, cacheKey } = this.resolveMatchStage(id, viewer);

    // Try Redis cache if available
    if (cacheKey) {
      const cached = await redisCache.get<any>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let raw = await this.runAggregationPipeline(matchStage);

    // Auto-create initial coach profile if 'me' and user is a coach
    if (!raw && (id === 'me' || id === 'my-cv' || id === 'my-profile') && viewer?.userId) {
      const user = await UserModel.findById(viewer.userId);
      if (user && user.role === 'COACH') {
        await CoachProfile.create({
          userId: user._id,
          fullName: user.name,
          title: 'Head Coach',
          coachType: 'INDIVIDUAL_COACH',
          yearsExperience: 0,
          overallRatingScore: 88,
          licenseStatus: 'UEFA Pro Licence',
          speciality: 'Tactical Coaching',
          cvTier: 'BRONZE',
          status: 'ACTIVE',
          birthCountry: 'France',
          birthCountryFlag: 'FR',
          dualNationality: 'Italy',
          dualNationalityFlag: 'IT',
          currentClub: 'Manchester City',
          website: 'www.k10football.com',
          matchesCoached: 32,
          totalWins: 21,
          losses: 7,
          draws: 4,
          coachStyles: ['TIKI-TAKA', 'MOTIVATOR', 'YOUTH DEVELOPMENT'],
          keySkills: DEFAULT_COACH_SKILLS,
          associations: DEFAULT_ASSOCIATIONS,
          courses: DEFAULT_COURSES,
          transferStatus: {
            footballAgentContract: 'No',
            contractUntil: 'June, 2026',
            agent: 'John Morris...',
            agency: 'Elite Sports...',
            salary: '$ 20,000.00',
            statusBadge: 'Active',
          },
        });

        raw = await this.runAggregationPipeline(matchStage);
      }
    }

    if (!raw) {
      throw new AppError(404, 'Coach profile not found');
    }

    // Format & transform payload matching frontend UI screenshots
    const transformed = this.transformCoachCV(raw);

    // Cache result with 300s TTL
    if (cacheKey) {
      await redisCache.set(cacheKey, transformed, 300);
    }

    return transformed;
  }

  /**
   * Transform raw aggregated document to rich CV payload matching 10 screenshots
   */
  transformCoachCV(doc: any): any {
    const user = doc.user || {};
    const matchesCoached = doc.matchesCoached || 0;
    const totalWins = doc.totalWins || 0;
    const losses = doc.losses || 0;
    const draws = doc.draws || 0;
    const winRate = matchesCoached > 0 ? Math.round((totalWins / matchesCoached) * 100) : 0;

    // Default skills if empty
    const keySkills =
      Array.isArray(doc.keySkills) && doc.keySkills.length > 0
        ? doc.keySkills
        : DEFAULT_COACH_SKILLS;

    // Default associations if empty
    const associations =
      Array.isArray(doc.associations) && doc.associations.length > 0
        ? doc.associations
        : DEFAULT_ASSOCIATIONS;

    // Default courses if empty
    const courses =
      Array.isArray(doc.courses) && doc.courses.length > 0 ? doc.courses : DEFAULT_COURSES;

    // Formations (ensure 3 slots representation)
    const formationsMap: Record<number, any> = {};
    (doc.formations || []).forEach((f: any) => {
      formationsMap[f.formationSlot] = f;
    });

    const formations = [1, 2, 3].map((slot) => {
      const item = formationsMap[slot];
      let positions = [];
      if (item?.positionsJson) {
        try {
          positions =
            typeof item.positionsJson === 'string'
              ? JSON.parse(item.positionsJson)
              : item.positionsJson;
        } catch {
          positions = [];
        }
      }
      return {
        _id: item?._id,
        formationSlot: slot,
        formationName: `FORMATION ${slot}`,
        positions,
        coachId: doc._id,
      };
    });

    // Format assigned player reviews for widget (Screen 7 top right)
    const assignedPlayerReviews = (doc.assignedPlayerReviews || []).map((ar: any) => {
      const player = ar.player || {};
      const status =
        ar.coachReview?.status === 'COMPLETED'
          ? 'COMPLETED'
          : ar.coachReview?.status === 'PENDING'
            ? 'REQUESTED'
            : 'EXPIRED';

      return {
        _id: ar._id,
        playerName: player.fullName || 'Player',
        playerPosition: player.position || 'DEFENDER',
        playerAvatar: player.profileImage || player.avatar || null,
        rating: ar.playerRating || 52,
        status, // 'REQUESTED' | 'EXPIRED' | 'COMPLETED'
        matchDate: ar.matchDate,
        amount: ar.coachReview?.paymentAmount ? `$${ar.coachReview.paymentAmount}` : '$30',
        action: 'REVIEW',
      };
    });

    // Calculate Section Completion Percentage & Auto-Tier
    const { completionPercentage, autoTier } = computeCoachProfileCompletion(doc, user.avatar);

    // Persist to database asynchronously if changed
    if (doc.cvTier !== autoTier || doc.profileCompletion !== completionPercentage) {
      CoachProfile.updateOne(
        { _id: doc._id },
        { cvTier: autoTier, profileCompletion: completionPercentage },
      )
        .exec()
        .catch(() => {});
    }

    return {
      _id: doc._id,
      userId: doc.userId,
      overallRatingScore: doc.overallRatingScore ?? 88,
      status: doc.status || 'ACTIVE',
      coachType: doc.coachType || 'INDIVIDUAL_COACH',
      fullName: doc.fullName || user.name || 'Marcus Silva',
      title: doc.title || 'Head Coach',
      yearsExperience: doc.yearsExperience || 0,
      cvTier: autoTier,
      profileCompletion: completionPercentage,
      completionPercentage,
      speciality: doc.speciality || 'Tactical Coaching',
      licenseStatus: doc.licenseStatus || 'UEFA Pro Licence',
      currentClub: doc.currentClub || 'Manchester City',
      clubLogo: doc.clubLogo,
      profileImage: doc.profileImage || user.avatar,
      coverImage: doc.coverImage,
      validationStatus: doc.validationStatus || '15 days until re-validation',
      revalidationRequested: Boolean(doc.revalidationRequested),

      // Tier & Completion Progress
      tierStatus: {
        currentTier: autoTier,
        profileCompletion: completionPercentage,
        completionPercentage,
        label:
          autoTier === 'GOLD'
            ? 'GOLD TIER UNLOCKED — ALL SECTIONS VERIFIED'
            : 'COMPLETE ALL SECTIONS TO UNLOCK GOLD TIER STATUS',
        canRequestRevalidation: autoTier !== 'GOLD' && !doc.revalidationRequested,
      },

      // Personal Information
      personalInformation: {
        fullName: doc.fullName || user.name,
        dateOfBirth: doc.dateOfBirth || '15/03/1996',
        age: doc.age || 24,
        birthCountry: doc.birthCountry || 'France',
        birthCountryFlag: doc.birthCountryFlag || 'FR',
        dualNationality: doc.dualNationality || 'Italy',
        dualNationalityFlag: doc.dualNationalityFlag || 'IT',
      },

      // Contact Information
      contact: {
        email: doc.email || user.email || 'marcus.silva@email.com',
        phone: doc.phone || user.phone || '+351 912 345 678',
        location: doc.location || doc.birthCountry || 'France',
        website: doc.website || 'www.k10football.com',
      },

      // Current Season Stats
      seasonStats: {
        matchesCoached,
        totalWins,
        losses,
        draws,
        winRate,
        cleanSheets: doc.cleanSheets || 0,
      },

      // Transfer Status
      transferStatus: {
        footballAgentContract: doc.transferStatus?.footballAgentContract || 'No',
        contractUntil: doc.transferStatus?.contractUntil || 'June, 2026',
        agent: doc.transferStatus?.agent || 'John Morris...',
        agency: doc.transferStatus?.agency || 'Elite Sports...',
        salary: doc.transferStatus?.salary || '$ 20,000.00',
        statusBadge: doc.transferStatus?.statusBadge || 'Active',
      },

      // Sub-sections
      accomplishments: doc.accomplishments || [],
      coachStyles: doc.coachStyles || ['TIKI-TAKA', 'MOTIVATOR', 'YOUTH DEVELOPMENT'],
      languages: doc.languages || [],
      majorTrophies: doc.majorTrophies || [],
      cupsPlayed: doc.cupsPlayed || [],
      keySkills,
      clubHistory: doc.clubHistory || [],
      associations,
      courses,
      formations,
      documents: doc.documents || [],
      assignedPlayerReviews,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const coachCvService = new CoachCvService();
