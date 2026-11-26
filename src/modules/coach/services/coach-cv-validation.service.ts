import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import QueryBuilder from '@/builder/QueryBuilder';
import { CV_VALIDATION_FEE } from '@/modules/player/services/player-cv-validation-request.service';

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
import { UserModel } from '@/modules/user/user.model';
import { UserSubscription } from '@/modules/subscription/subscription.model';
import { CoachProfile } from '../coach.model';
import { AcademyFinanceTransaction } from '@/modules/academy/academy.model';
import { ParentChild } from '@/modules/parent/parent.model';
import { PlayerProfile, MatchRecord, PlayerMentalAnalysis } from '@/modules/player/player.model';
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
      behavioralSkills?: Record<string, number>;
      mentalSkills?: Record<string, number>;
      physical?: Record<string, number>;
      technical?: Record<string, number>;
      behavioral?: Record<string, number>;
      mental?: Record<string, number>;
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

    // 1b. Active Coach Subscription check
    const coachSub = await UserSubscription.findOne({
      userId: coachUserId,
      status: 'ACTIVE',
    });
    if (!coachSub) {
      throw new AppError(
        402,
        'Payment Required: An active coach membership subscription is required to validate player CVs. Please complete your coach subscription payment.',
      );
    }
    if (coachSub.nextBillingDate && new Date(coachSub.nextBillingDate) < new Date()) {
      throw new AppError(
        402,
        'Subscription Expired: Your coach membership subscription has expired. Please renew your subscription to reactivate CV validation access.',
      );
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
    if (!Types.ObjectId.isValid(playerId)) {
      throw new AppError(400, 'Invalid player ID');
    }
    const player = await PlayerProfile.findById(playerId);
    if (!player) {
      throw new AppError(404, 'Player profile not found');
    }

    // 3. Only the coach the player requested (and paid for) may validate.
    const isDirectlyAssigned =
      player.coachVerification?.coachId &&
      player.coachVerification.coachId.toString() === coach.userId.toString();
    if (!isDirectlyAssigned) {
      throw new AppError(
        403,
        'This player has not requested CV validation from you. Only the coach selected in the player’s validation request can validate this CV.',
      );
    }

    const paymentStatus = player.coachVerification?.validationPaymentStatus;
    if (paymentStatus === 'USED') {
      throw new AppError(
        409,
        'This CV is already validated for the latest payment. The player must submit and pay a new validation request for re-validation.',
      );
    }
    if (paymentStatus !== 'PAID') {
      throw new AppError(
        402,
        'Payment Required: The player has not paid the CV validation fee yet. You can validate once the payment is completed.',
      );
    }

    // 4. Strict Permissions Lock: Coach has permission ONLY to edit and assess Physical Skills, Technical Skills & Behavioral/Mental Skills
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
    const behavioralKeys = [
      'creativity',
      'leadership',
      'confidence',
      'composure',
      'composition',
      'motivation',
      'focus',
      'determination',
      'workRate',
      'teamwork',
      'consistency',
      'concentration',
      'aggression',
      'bravery',
      'decisions',
      'decisionMaking',
    ];
    const mentalKeys = [
      'creativity',
      'leadership',
      'confidence',
      'composure',
      'motivation',
      'focus',
    ];

    const allowedSkillsToUpdate: Record<string, number> = {};
    const mentalToUpdate: Record<string, number> = {};

    const rawSkills = {
      ...(payload.physicalSkills || {}),
      ...(payload.technicalSkills || {}),
      ...(payload.behavioralSkills || {}),
      ...(payload.mentalSkills || {}),
      ...((payload as any).physical || {}),
      ...((payload as any).technical || {}),
      ...((payload as any).behavioral || {}),
      ...((payload as any).mental || {}),
      ...(payload.attributes || {}),
      ...(payload as any),
    };

    for (const [key, val] of Object.entries(rawSkills)) {
      if (
        physicalKeys.includes(key) ||
        technicalKeys.includes(key) ||
        behavioralKeys.includes(key)
      ) {
        allowedSkillsToUpdate[key] = Math.max(0, Math.min(100, Number(val)));
      }
      if (mentalKeys.includes(key)) {
        mentalToUpdate[key] = Math.max(0, Math.min(100, Number(val)));
      }
    }

    if (Object.keys(allowedSkillsToUpdate).length > 0) {
      // Same path as coach evaluations: save coach skills + run the shared recalculation.
      await playerStatsService.applyEvaluatorAttributes(player._id, allowedSkillsToUpdate);
    }

    if (Object.keys(mentalToUpdate).length > 0) {
      const mentalVals = Object.values(mentalToUpdate);
      const overallMentalScore = Math.round(
        mentalVals.reduce((a, b) => a + b, 0) / mentalVals.length,
      );
      await PlayerMentalAnalysis.findOneAndUpdate(
        { playerId: player._id },
        {
          $set: {
            ...mentalToUpdate,
            overallMentalScore,
          },
        },
        { upsert: true, new: true },
      );
    }

    // 5. Issue Validation Certificate with Digital Stamp and lock verification details
    const certId =
      player.coachVerification?.certificateId ||
      `K10-CV-${player._id.toString().slice(-6).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    const paymentRef = player.coachVerification?.transactionId;
    const paidFee = CV_VALIDATION_FEE;

    player.isVerifiedByCoach = true;
    player.verifyingCoachId = coach.userId;
    player.verifyingCoachLicense = coach.licenseStatus || 'UEFA Certified Coach';
    player.coachVerification = {
      isVerified: true,
      coachId: coach.userId,
      verifiedByCoachId: coach.userId,
      coachName: coach.fullName || 'Official Coach',
      licenseNumber: coach.licenseStatus || 'UEFA Licence',
      clubManaged: coachClub,
      verifiedAt: new Date(),
      digitalStamp: 'OFFICIALLY_VERIFIED_BY_K10',
      officialSealUrl:
        'https://res.cloudinary.com/k10-football/image/upload/v1/seals/k10-official-seal.png',
      certificateId: certId,
      // The payment is now consumed; a re-validation needs a new paid request
      validationPaymentStatus: 'USED',
      validationFee: paidFee,
      transactionId: paymentRef,
      requestedAt: player.coachVerification?.requestedAt,
      paidAt: player.coachVerification?.paidAt,
    };
    if (coach.academyId && !player.academyId) {
      player.academyId = coach.academyId;
    }

    await player.save({ validateModifiedOnly: true });

    // 5b. Record 3-way commission split (50% coach / 25% academy / 25% platform) for THIS payment.
    // Keyed by the Stripe session id so each paid validation is its own transaction.
    const targetAcademyId = coach.academyId || player.academyId;
    if (targetAcademyId) {
      const txFilter = paymentRef
        ? { paymentReference: paymentRef }
        : { playerId: player._id, transactionType: 'CV Validation', paymentReference: null };
      // The validation is done → the held (ON_HOLD) shares become payable (PENDING) for the coach
      // who did the work. A share that was already paid out is never re-assigned or re-opened.
      const existingTx = await AcademyFinanceTransaction.findOne(txFilter)
        .select('payoutStatusCoach payoutStatusAcademy')
        .lean();
      const coachShareUpdate =
        existingTx?.payoutStatusCoach === 'PAID'
          ? {}
          : { coachId: coach._id, payoutStatusCoach: 'PENDING' };
      const academyShareUpdate =
        existingTx?.payoutStatusAcademy === 'PAID'
          ? {}
          : { academyId: targetAcademyId, payoutStatusAcademy: 'PENDING' };
      await AcademyFinanceTransaction.findOneAndUpdate(
        txFilter,
        {
          ...(existingTx ? {} : { academyId: targetAcademyId }),
          ...academyShareUpdate,
          ...coachShareUpdate,
          playerId: player._id,
          paymentReference: paymentRef,
          transactionType: 'CV Validation',
          cost: paidFee,
          commissionAcademy: paidFee * 0.25,
          commissionCoach: paidFee * 0.5,
          commissionPlatform: paidFee * 0.25,
          payoutStatus: 'PENDING_TRANSFER',
          transactionDate: new Date(),
          status: 'COMPLETED',
          notes: `Official CV Validation Fee ($24.00) received by K10 Platform. Authorised Coach Share (50%): $12.00, Academy Admin Share (25%): $6.00, K10 Platform (25%): $6.00 (Awaiting Admin Payout). Verified by Coach ${coach.fullName} (${coachClub}). Certificate: ${certId}`,
        },
        { upsert: true, new: true },
      );
    }

    // 5c. Send in-app notification to Parent if linked
    try {
      const parentLinks = await ParentChild.find({ childPlayerId: player._id }).populate(
        'parentId',
      );
      for (const link of parentLinks) {
        const parent = link.parentId as any;
        if (parent?.userId) {
          await notificationService.createNotification({
            recipientId: parent.userId,
            recipientRole: 'PARENT',
            title: 'Child CV Officially Validated!',
            message: `Official validation completed for ${player.fullName} by Coach ${coach.fullName}. Digital Seal and upgraded tier unlocked.`,
            type: 'PLAYER_CV_VALIDATED',
            data: { playerId: player._id, certificateId: certId, verifiedAt: new Date() },
          });
        }
      }
    } catch {
      // ignore
    }

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

    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // A player is in this coach's list ONLY when:
    //  - the player requested THIS coach (coachVerification.coachId, set by requestCvValidation), or
    //  - THIS coach validated the CV (verifyingCoachId, set by validatePlayerCV).
    // Never the whole academy / club, never CVs verified by another coach.
    const me = coach.userId;
    const scope = {
      $or: [{ 'coachVerification.coachId': me }, { verifyingCoachId: me }],
    };

    // Payment states: UNPAID = checkout created, PAID = paid & waiting for coach, USED = validated
    const pendingFilter = {
      'coachVerification.coachId': me,
      'coachVerification.validationPaymentStatus': 'PAID',
    };
    const verifiedByMe = {
      verifyingCoachId: me,
      $or: [{ isVerifiedByCoach: true }, { 'coachVerification.isVerified': true }],
    };
    const statusFilters: Record<string, Record<string, unknown>> = {
      PENDING: pendingFilter,
      AWAITING_PAYMENT: {
        'coachVerification.coachId': me,
        'coachVerification.validationPaymentStatus': 'UNPAID',
        $nor: [verifiedByMe],
      },
      VERIFIED: {
        $and: [
          verifiedByMe,
          {
            $or: [
              { 'coachVerification.verifiedAt': { $gte: oneYearAgo } },
              { 'coachVerification.verifiedAt': { $exists: false } },
              { 'coachVerification.verifiedAt': null },
            ],
          },
        ],
        $nor: [pendingFilter],
      },
      EXPIRED: {
        $and: [verifiedByMe, { 'coachVerification.verifiedAt': { $lt: oneYearAgo } }],
        $nor: [pendingFilter],
      },
    };
    const inScope = (extra: Record<string, unknown>) => ({ $and: [scope, extra] });

    // Summary counts (always over the coach's full scope, independent of tab/search)
    const [pendingValidations, verifiedCvs, expiredStatus, awaitingPayment, updatedThisMonth] =
      await Promise.all([
        PlayerProfile.countDocuments(inScope(statusFilters.PENDING)),
        PlayerProfile.countDocuments(inScope(statusFilters.VERIFIED)),
        PlayerProfile.countDocuments(inScope(statusFilters.EXPIRED)),
        PlayerProfile.countDocuments(inScope(statusFilters.AWAITING_PAYMENT)),
        PlayerProfile.countDocuments({
          ...verifiedByMe,
          'coachVerification.verifiedAt': { $gte: startOfMonth },
        }),
      ]);

    // Resolve custom params into the base filter and strip them from the query.
    // Everything is wrapped in $and so QueryBuilder.search()'s $or cannot overwrite the scope.
    const listQuery: Record<string, unknown> = { ...query };
    const andParts: Record<string, unknown>[] = [scope];
    const statusParam =
      typeof listQuery.status === 'string' ? listQuery.status.toUpperCase().trim() : '';
    if (statusParam && statusParam !== 'ALL') {
      if (!statusFilters[statusParam]) {
        throw new AppError(
          400,
          `Invalid status. Allowed: ALL, ${Object.keys(statusFilters).join(', ')}`,
        );
      }
      andParts.push(statusFilters[statusParam]);
    }
    if (typeof listQuery.email === 'string' && listQuery.email.trim()) {
      const emailRegex = new RegExp(escapeRegex(listQuery.email.trim()), 'i');
      const matchedUserIds = await UserModel.find({ email: emailRegex }).distinct('_id');
      andParts.push({ userId: { $in: matchedUserIds } });
    }
    const baseFilter = { $and: andParts };
    ['status', 'email', 'academyId', 'clubName'].forEach((k) => delete listQuery[k]);
    delete listQuery.fields;

    const playerQuery = new QueryBuilder(PlayerProfile.find(baseFilter), listQuery)
      .search(['fullName', 'position', 'currentClub', 'country'])
      .filter()
      .sort()
      .paginate();
    const [players, meta] = await Promise.all([
      playerQuery.modelQuery.populate('userId', 'email name avatar').lean(),
      playerQuery.countTotal(),
    ]);

    const playerIds = (players as any[]).map((p) => p._id);
    const matchStatsAgg = playerIds.length
      ? await MatchRecord.aggregate([
          { $match: { playerId: { $in: playerIds } } },
          {
            $group: {
              _id: '$playerId',
              matches: { $sum: 1 },
              goals: { $sum: { $ifNull: ['$goals', { $ifNull: ['$stats.goalScored', 0] }] } },
              assists: { $sum: { $ifNull: ['$assists', { $ifNull: ['$stats.assists', 0] }] } },
            },
          },
        ])
      : [];
    const statsMap = new Map<string, any>();
    matchStatsAgg.forEach((s) => statsMap.set(s._id.toString(), s));

    const list = (players as any[]).map((p) => {
      const verifiedAt = p.coachVerification?.verifiedAt
        ? new Date(p.coachVerification.verifiedAt)
        : null;
      const meStr = me.toString();
      const requestedMe = p.coachVerification?.coachId?.toString() === meStr;
      const verifiedByMeRow =
        p.verifyingCoachId?.toString() === meStr &&
        Boolean(p.isVerifiedByCoach || p.coachVerification?.isVerified);
      const payStatus = p.coachVerification?.validationPaymentStatus;

      let status: 'VERIFIED' | 'EXPIRED' | 'PENDING' | 'AWAITING_PAYMENT';
      if (requestedMe && payStatus === 'PAID') status = 'PENDING';
      else if (verifiedByMeRow)
        status = verifiedAt && verifiedAt < oneYearAgo ? 'EXPIRED' : 'VERIFIED';
      else status = 'AWAITING_PAYMENT';

      const st = statsMap.get(p._id.toString()) || { goals: 0, assists: 0, matches: 0 };

      return {
        _id: p._id,
        name: p.fullName || '',
        email: (p.userId as any)?.email || '',
        position: p.position || '',
        avatar: p.profileImage || (p.userId as any)?.avatar || '',
        rating: p.overallRating || 0,
        club: p.currentClub || '',
        goals: st.goals || 0,
        assists: st.assists || 0,
        matches: st.matches || 0,
        lastValidated: verifiedAt ? verifiedAt.toISOString().split('T')[0] : null,
        status,
        paymentStatus: p.coachVerification?.validationPaymentStatus || null,
        canValidate: status === 'PENDING',
        createdAt: p.createdAt,
      };
    });

    return {
      meta,
      data: {
        summary: {
          pendingValidations,
          verifiedCvs,
          updatedThisMonth,
          expiredStatus,
          awaitingPayment,
        },
        players: list,
      },
    };
  }
}

export const coachCvValidationService = new CoachCvValidationService();
