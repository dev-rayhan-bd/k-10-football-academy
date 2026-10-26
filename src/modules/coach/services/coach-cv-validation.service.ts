import { AppError } from '@/utils/AppError';
import { UserModel } from '@/modules/user/user.model';
import { CoachProfile } from '../coach.model';
import { PlayerProfile, PlayerAttributes, MatchRecord } from '@/modules/player/player.model';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { NotificationService } from '@/modules/notification/notification.service';

const notificationService = new NotificationService();

export class CoachCvValidationService {
  async validatePlayerCV(
    coachUserId: string,
    playerId: string,
    payload: {
      physicalSkills?: Record<string, number>;
      technicalSkills?: Record<string, number>;
      attributes?: Record<string, number>;
      coachFeedback?: string;
      certificateNote?: string;
    },
  ) {
    // 1. Check Coach registration with an official football club or academy
    const coach = await CoachProfile.findOne({ userId: coachUserId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    // 1. Strict Club/Academy Registration Check: Coach MUST have an officially approved academy affiliation
    if (!coach.isVerifiedByAcademy || !coach.academyId) {
      throw new AppError(
        403,
        'Only coaches who are officially registered and approved by a football club or academy are authorised to validate player CVs.',
      );
    }

    const coachClub = coach.currentClub || 'Official Academy';

    // 2. Check Player existence
    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(404, 'Player profile not found');
    }

    // 3. Strict Supervision Check: Coaches cannot validate players from other teams or clubs
    const isSameAcademy =
      player.academyId &&
      coach.academyId &&
      player.academyId.toString() === coach.academyId.toString();

    const playerClub = player.currentClub || player.academy;
    const isSameClub =
      playerClub && coachClub && playerClub.trim().toLowerCase() === coachClub.trim().toLowerCase();

    const isDirectlyAssigned =
      player.verifyingCoachId && player.verifyingCoachId.toString() === coach.userId.toString();

    if (!isSameAcademy && !isSameClub && !isDirectlyAssigned) {
      throw new AppError(
        403,
        `Coaches are not permitted to validate CVs belonging to players from other teams or clubs. You can only validate players currently registered with your approved academy (${coachClub}).`,
      );
    }

    // 4. Strict Permissions Lock: Coach has permission ONLY to edit and assess Physical Skills & Technical Skills
    const physicalKeys = [
      'pace',
      'acceleration',
      'sprintSpeed',
      'stamina',
      'strength',
      'balance',
      'agility',
      'jumping',
      'reactions',
    ];
    const technicalKeys = [
      'ballControl',
      'dribbling',
      'shortPassing',
      'longPassing',
      'crossing',
      'shooting',
      'finishing',
      'longShots',
      'headingAccuracy',
      'weakFoot',
      'firstTouch',
      'tackling',
      'standingTackle',
      'slidingTackle',
      'interception',
      'interceptions',
    ];

    const allowedSkillsToUpdate: Record<string, number> = {};
    const rawSkills = {
      ...(payload.physicalSkills || {}),
      ...(payload.technicalSkills || {}),
      ...((payload as any).physical || {}),
      ...((payload as any).technical || {}),
      ...(payload.attributes || {}),
      ...(payload as any),
    };

    for (const [key, val] of Object.entries(rawSkills)) {
      if (physicalKeys.includes(key) || technicalKeys.includes(key)) {
        allowedSkillsToUpdate[key] = Math.max(0, Math.min(100, Number(val)));
      }
    }

    if (Object.keys(allowedSkillsToUpdate).length > 0) {
      await PlayerAttributes.findOneAndUpdate(
        { playerId: player._id },
        { $set: allowedSkillsToUpdate },
        { upsert: true, new: true },
      );
    }

    // 5. Issue Validation Certificate and lock verification details
    player.isVerifiedByCoach = true;
    player.verifyingCoachId = coach.userId;
    player.verifyingCoachLicense = coach.licenseStatus || 'UEFA Certified Coach';
    player.coachVerification = {
      isVerified: true,
      coachName: coach.fullName || 'Official Coach',
      licenseNumber: coach.licenseStatus || 'UEFA Licence',
      clubManaged: coachClub,
      verifiedAt: new Date(),
    };
    if (coach.academyId && !player.academyId) {
      player.academyId = coach.academyId;
    }

    await player.save({ validateModifiedOnly: true });

    // 6. Recalculate stats & Tier
    await playerStatsService.recalculatePlayerStats(player._id);
    await playerCacheService.invalidatePlayerCache(player._id, player.userId);

    // 7. Send notification to player
    if (player.userId) {
      await notificationService.createNotification({
        recipientId: player.userId,
        recipientRole: 'PLAYER',
        title: 'Player CV Officially Validated!',
        message: `Your coach ${coach.fullName} (${coachClub}) has validated your CV and assessed your physical and technical skills.`,
        type: 'PLAYER_CV_VALIDATED',
        data: {
          coachId: coach._id,
          club: coachClub,
          license: coach.licenseStatus,
          verifiedAt: new Date(),
        },
      });
    }

    return {
      message: 'Player CV validated successfully by club coach',
      playerId: player._id,
      coachName: coach.fullName,
      club: coachClub,
      isVerified: true,
      updatedSkills: allowedSkillsToUpdate,
      verification: player.coachVerification,
    };
  }

  async getPlayerCvValidationsDashboard(userId: string, query: Record<string, unknown> = {}) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);

    const targetAcademyId = (query.academyId as string) || coach.academyId;
    const targetClub = (query.clubName as string) || coach.currentClub;

    // Filter players under coach's academy/club or verified by coach
    const playerFilter: any = {};
    if (targetAcademyId) {
      playerFilter.$or = [{ academyId: targetAcademyId }];
      if (targetClub) {
        playerFilter.$or.push({ currentClub: targetClub });
      }
    } else if (targetClub) {
      playerFilter.currentClub = targetClub;
    } else {
      playerFilter.$or = [
        { verifyingCoachId: coach.userId },
        { 'coachVerification.coachName': coach.fullName },
      ];
    }

    // Direct email search
    if (query.email && typeof query.email === 'string') {
      const emailRegex = new RegExp(String(query.email).trim(), 'i');
      const matchedUserIds = await UserModel.find({ email: emailRegex }).distinct('_id');
      playerFilter.userId = { $in: matchedUserIds };
      delete playerFilter.$or;
      delete playerFilter.currentClub;
    }

    // Search term filter (?searchTerm=...)
    if (query.searchTerm && typeof query.searchTerm === 'string') {
      const term = query.searchTerm.trim();
      const searchRegex = new RegExp(term, 'i');
      const matchedUserIds = await UserModel.find({
        $or: [{ email: searchRegex }, { name: searchRegex }],
      }).distinct('_id');

      const orClauses: any[] = [
        { fullName: searchRegex },
        { position: searchRegex },
        { currentClub: searchRegex },
        { country: searchRegex },
      ];

      if (matchedUserIds.length > 0) {
        orClauses.push({ userId: { $in: matchedUserIds } });
      }

      playerFilter.$and = playerFilter.$and || [];
      playerFilter.$and.push({ $or: orClauses });
    }

    const allMatchingPlayers = await PlayerProfile.find(playerFilter)
      .populate('userId', 'email name avatar')
      .lean();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    let pendingCount = 0;
    let verifiedCount = 0;
    let updatedThisMonthCount = 0;
    let expiredCount = 0;

    const playerIds = allMatchingPlayers.map((p) => p._id);

    // Aggregate match stats (goals, assists)
    const matchStatsAgg = await MatchRecord.aggregate([
      { $match: { playerId: { $in: playerIds } } },
      {
        $group: {
          _id: '$playerId',
          matches: { $sum: 1 },
          goals: {
            $sum: {
              $ifNull: ['$goals', { $ifNull: ['$stats.goalScored', 0] }],
            },
          },
          assists: {
            $sum: {
              $ifNull: ['$assists', { $ifNull: ['$stats.assists', 0] }],
            },
          },
        },
      },
    ]);

    const statsMap = new Map<string, any>();
    matchStatsAgg.forEach((s) => statsMap.set(s._id.toString(), s));

    const processedList: any[] = [];

    allMatchingPlayers.forEach((p: any) => {
      const verifiedAt = p.coachVerification?.verifiedAt
        ? new Date(p.coachVerification.verifiedAt)
        : null;
      const isVerified = Boolean(p.isVerifiedByCoach || p.coachVerification?.isVerified);

      let status: 'VERIFIED' | 'PENDING' | 'EXPIRED';

      if (isVerified && verifiedAt) {
        if (verifiedAt < oneYearAgo) {
          status = 'EXPIRED';
          expiredCount++;
        } else {
          status = 'VERIFIED';
          verifiedCount++;
        }
      } else {
        status = 'PENDING';
        pendingCount++;
      }

      const updatedAt = new Date(p.updatedAt || p.createdAt || 0);
      if (updatedAt >= startOfMonth || (verifiedAt && verifiedAt >= startOfMonth)) {
        updatedThisMonthCount++;
      }

      const st = statsMap.get(p._id.toString()) || { goals: 0, assists: 0, matches: 0 };

      processedList.push({
        _id: p._id,
        name: p.fullName,
        email: (p.userId as any)?.email || '',
        position: p.position,
        avatar: p.profileImage || (p.userId as any)?.avatar || '',
        rating: p.overallRating || 0,
        club: p.currentClub || coach.currentClub || 'Academy Player',
        goals: st.goals,
        assists: st.assists,
        matches: st.matches,
        lastValidated: verifiedAt ? verifiedAt.toISOString().split('T')[0] : 'Never',
        status,
        createdAt: p.createdAt,
      });
    });

    // Filter by tab status if passed (?status=VERIFIED or PENDING or EXPIRED)
    let filteredList = processedList;
    if (query.status && typeof query.status === 'string' && query.status !== 'ALL') {
      const s = query.status.toUpperCase().trim();
      filteredList = processedList.filter((item) => item.status === s);
    }

    const total = filteredList.length;
    const totalPage = Math.ceil(total / limit) || 1;
    const skip = (page - 1) * limit;
    const paginatedList = filteredList.slice(skip, skip + limit);

    return {
      meta: {
        page,
        limit,
        total,
        totalPage,
      },
      data: {
        summary: {
          pendingValidations: pendingCount,
          verifiedCvs: verifiedCount,
          updatedThisMonth: updatedThisMonthCount,
          expiredStatus: expiredCount,
        },
        players: paginatedList,
      },
    };
  }
}

export const coachCvValidationService = new CoachCvValidationService();
