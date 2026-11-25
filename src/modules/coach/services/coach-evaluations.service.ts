import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import QueryBuilder from '@/builder/QueryBuilder';
import { UserModel } from '@/modules/user/user.model';
import { CoachProfile } from '../coach.model';
import { PlayerProfile } from '@/modules/player/player.model';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { PlayerEvaluation, Team } from '@/modules/academy/academy.model';
import { playerCacheService } from '@/modules/player/services/player-cache.service';
import { NotificationService } from '@/modules/notification/notification.service';
import {
  EVALUATION_CYCLE_KEY,
  EVALUATION_CYCLE_LABEL,
  addEvaluationCycle,
  assertCanViewEvaluation,
  effectiveEvaluationStatus,
  getCoachTeamPlayerIds,
  gradeToScore,
  mapToObject,
  scoreToGrade,
} from '@/modules/academy/services/evaluation-rules';

const notificationService = new NotificationService();

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type CoachListStatus = 'PENDING' | 'EVALUATED' | 'EXPIRED';
const toCoachStatus = (ev: any): CoachListStatus => {
  const s = effectiveEvaluationStatus(ev);
  return s === 'NEED_EVALUATION' ? 'PENDING' : s;
};

const ALLOWED_GRADES = ['EXCELLENT', 'GOOD', 'IMPROVEMENT'];

/** Validates graded sections: each value must be a client grade (or a 0-100 number). */
const normalizeGrades = (section: unknown, name: string): Record<string, string> | undefined => {
  if (section === undefined || section === null) return undefined;
  if (typeof section !== 'object' || Array.isArray(section)) {
    throw new AppError(400, `${name} must be an object of { skill: grade }`);
  }
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(section as Record<string, unknown>)) {
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw === 'number') {
      if (raw < 0 || raw > 100) throw new AppError(400, `${name}.${key} must be 0-100`);
      out[key] = String(raw);
      continue;
    }
    const grade = String(raw).toUpperCase().trim();
    if (!ALLOWED_GRADES.includes(grade)) {
      throw new AppError(
        400,
        `Invalid grade "${raw}" for ${name}.${key}. Allowed: ${ALLOWED_GRADES.join(', ')}`,
      );
    }
    out[key] = grade;
  }
  return out;
};

export class CoachEvaluationsService {
  /**
   * Coach evaluation list. Scope = players the academy requested from this coach, players this
   * coach evaluated before, and players on the coach's assigned teams. Never the whole academy.
   */
  async getPlayerEvaluationsDashboard(userId: string, query: Record<string, unknown> = {}) {
    const coach = await CoachProfile.findOne({ userId });
    if (!coach) {
      throw new AppError(404, 'Coach profile not found');
    }

    const [coachEvals, { playerIds: teamPlayerIds }] = await Promise.all([
      PlayerEvaluation.find({ coachId: coach._id }).sort({ createdAt: -1 }).lean(),
      getCoachTeamPlayerIds(coach._id),
    ]);

    // Latest record (request or evaluation) and latest SUBMITTED evaluation per player
    const latestMap = new Map<string, any>();
    const lastEvaluatedMap = new Map<string, any>();
    for (const ev of coachEvals) {
      const pid = String(ev.playerId);
      if (!latestMap.has(pid)) latestMap.set(pid, ev);
      if (ev.status === 'EVALUATED' && !lastEvaluatedMap.has(pid)) lastEvaluatedMap.set(pid, ev);
    }

    const allIds = new Set<string>([...latestMap.keys(), ...teamPlayerIds]);
    const statusById = new Map<string, CoachListStatus>();
    const counts = { PENDING: 0, EVALUATED: 0, EXPIRED: 0 };
    allIds.forEach((pid) => {
      const st = toCoachStatus(latestMap.get(pid));
      statusById.set(pid, st);
      counts[st]++;
    });

    // Resolve custom params into the base filter, strip them from the QueryBuilder query
    const listQuery: Record<string, unknown> = { ...query };
    const statusParam = String(listQuery.status || 'PENDING')
      .toUpperCase()
      .trim();
    if (!['ALL', 'PENDING', 'EVALUATED', 'EXPIRED'].includes(statusParam)) {
      throw new AppError(400, 'Invalid status. Allowed: ALL, PENDING, EVALUATED, EXPIRED');
    }
    const idsForStatus = Array.from(allIds).filter(
      (pid) => statusParam === 'ALL' || statusById.get(pid) === statusParam,
    );
    const andParts: Record<string, unknown>[] = [
      { _id: { $in: idsForStatus.map((id) => new Types.ObjectId(id)) } },
    ];
    if (typeof listQuery.email === 'string' && listQuery.email.trim()) {
      const emailRegex = new RegExp(escapeRegex(listQuery.email.trim()), 'i');
      const matchedUserIds = await UserModel.find({ email: emailRegex }).distinct('_id');
      andParts.push({ userId: { $in: matchedUserIds } });
    }
    ['status', 'email', 'academyId', 'clubName', 'fields'].forEach((k) => delete listQuery[k]);

    const playerQuery = new QueryBuilder(PlayerProfile.find({ $and: andParts }), listQuery)
      .search(['fullName', 'position', 'currentClub', 'country'])
      .filter()
      .sort()
      .paginate();
    const [players, meta] = await Promise.all([
      playerQuery.modelQuery.populate('userId', 'email name avatar').lean(),
      playerQuery.countTotal(),
    ]);

    const rows = (players as any[]).map((p) => {
      const pid = String(p._id);
      const latest = latestMap.get(pid);
      const lastEvaluated = lastEvaluatedMap.get(pid);
      const status = statusById.get(pid) || 'PENDING';
      const rating = lastEvaluated?.overallRating ?? p.overallRating ?? 0;
      return {
        _id: p._id,
        evaluationId: latest?._id || null,
        name: p.fullName || '',
        avatar: p.profileImage || (p.userId as any)?.avatar || '',
        position: p.position || '',
        rating,
        overallRating: rating,
        academy: p.currentClub || '',
        lastEvaluationDate: lastEvaluated?.evaluationDate || null,
        nextEvaluationDue: lastEvaluated?.nextEvaluationDue || null,
        status,
        isEvaluated: status === 'EVALUATED',
        isPending: status === 'PENDING',
        isExpired: status === 'EXPIRED',
        requestedByAcademy: Boolean(latest && latest.status === 'NEED_EVALUATION'),
        canSubmit: status !== 'EVALUATED',
      };
    });

    return {
      meta,
      data: {
        summary: {
          total: allIds.size,
          pendingCount: counts.PENDING,
          evaluatedCount: counts.EVALUATED,
          expiredCount: counts.EXPIRED,
          overdueCount: counts.EXPIRED,
        },
        players: rows,
      },
    };
  }

  /** Resolve an evaluation id OR a player id into { evaluation, player }. */
  private async resolveTarget(
    targetId: string,
    opts: { coachProfileId?: Types.ObjectId; submittedOnly?: boolean },
  ) {
    if (!targetId || !Types.ObjectId.isValid(targetId)) {
      throw new AppError(400, 'Invalid evaluation or player ID');
    }
    let evaluation: any = await PlayerEvaluation.findById(targetId)
      .populate('coachId')
      .populate('academyId')
      .lean();
    let player: any;

    if (evaluation) {
      player = await PlayerProfile.findById(evaluation.playerId).lean();
    } else {
      player = await PlayerProfile.findById(targetId).lean();
      if (player) {
        const filter: Record<string, unknown> = { playerId: player._id };
        if (opts.coachProfileId) filter.coachId = opts.coachProfileId;
        if (opts.submittedOnly) filter.status = { $in: ['EVALUATED', 'EXPIRED', 'OVERDUE'] };
        evaluation = await PlayerEvaluation.findOne(filter)
          .sort({ evaluationDate: -1, createdAt: -1 })
          .populate('coachId')
          .populate('academyId')
          .lean();
      }
    }
    if (!player) {
      throw new AppError(404, 'Player or evaluation record not found');
    }
    return { evaluation, player };
  }

  async getPlayerEvaluationDetails(user: { userId?: string; role?: string }, targetId: string) {
    const coach =
      user?.role === 'COACH' ? await CoachProfile.findOne({ userId: user.userId }) : null;
    const { evaluation, player } = await this.resolveTarget(targetId, {
      coachProfileId: coach?._id,
    });
    await assertCanViewEvaluation(user, evaluation, player);

    const status = evaluation ? effectiveEvaluationStatus(evaluation) : null;
    const submitted = status === 'EVALUATED' || status === 'EXPIRED';

    return {
      player: {
        _id: player._id,
        name: player.fullName || '',
        age: player.age ?? null,
        avatar: player.profileImage || '',
        position: player.position || '',
        centre: player.currentClub || '',
        rating: (submitted ? evaluation?.overallRating : null) ?? player.overallRating ?? 0,
      },
      evaluation: {
        _id: evaluation?._id || null,
        date: submitted ? evaluation?.evaluationDate || null : null,
        status: status || 'NEED_EVALUATION',
        overallRating: submitted ? (evaluation?.overallRating ?? null) : null,
        technicalScore: evaluation?.technicalScore ?? null,
        physicalScore: evaluation?.physicalScore ?? null,
        mentalScore: evaluation?.mentalScore ?? null,
        techniques: mapToObject(evaluation?.techniques),
        characteristics: mapToObject(evaluation?.characteristics),
        physical: mapToObject(evaluation?.physical),
        notes: evaluation?.notes || '',
        coachFeedback: evaluation?.coachFeedback || '',
        nextEvaluationDue: submitted ? evaluation?.nextEvaluationDue || null : null,
        requestedAt: evaluation?.createdAt || null,
      },
    };
  }

  /** Data for the downloadable progress report. Only SUBMITTED evaluations have a report. */
  async getPlayerEvaluationProgressPdfData(
    user: { userId?: string; role?: string } | undefined,
    targetId: string,
  ) {
    const { evaluation, player } = await this.resolveTarget(targetId, { submittedOnly: true });
    await assertCanViewEvaluation(user, evaluation, player);

    if (!evaluation || !['EVALUATED', 'EXPIRED', 'OVERDUE'].includes(evaluation.status)) {
      throw new AppError(404, 'No submitted evaluation report found for this player');
    }

    const coach = evaluation.coachId as any;
    const academy = evaluation.academyId as any;
    const status = effectiveEvaluationStatus(evaluation);
    const overallRating = evaluation.overallRating ?? null;
    const fmt = (d?: Date | string | null) =>
      d
        ? new Date(d).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : '';
    const evalDate = evaluation.evaluationDate || null;
    const nextDue =
      evaluation.nextEvaluationDue || (evalDate ? addEvaluationCycle(new Date(evalDate)) : null);

    return {
      reportTitle: 'Player Development Programme Progress Report',
      evaluationId: evaluation._id,
      evaluationDate: evalDate,
      formattedDate: fmt(evalDate),
      cycle: EVALUATION_CYCLE_LABEL,
      status,
      nextEvaluationDue: nextDue,
      formattedNextEvaluationDue: fmt(nextDue),
      overallRating,
      grade: scoreToGrade(overallRating),
      categoryScores: {
        technical: evaluation.technicalScore ?? null,
        physical: evaluation.physicalScore ?? null,
        mental: evaluation.mentalScore ?? null,
      },
      improvementDelta: evaluation.improvementDelta ?? 0,
      player: {
        id: player._id,
        name: player.fullName || '',
        position: player.position || '',
        age: player.age ?? null,
        avatar: player.profileImage || '',
        academy: academy?.name || '',
        currentClub: player.currentClub || '',
      },
      coach: {
        id: coach?._id || null,
        name: coach?.fullName || '',
        club: coach?.currentClub || '',
        avatar: coach?.profileImage || '',
        license: coach?.coachingLicenseLevel || coach?.licenseStatus || '',
      },
      academy: {
        id: academy?._id || null,
        name: academy?.name || '',
        logo: academy?.logo || '',
      },
      breakdown: {
        techniques: mapToObject(evaluation.techniques),
        characteristics: mapToObject(evaluation.characteristics),
        physical: mapToObject(evaluation.physical),
      },
      coachFeedback: evaluation.coachFeedback || '',
      notes: evaluation.notes || '',
      isOfficial: true,
      generatedAt: new Date(),
    };
  }

  /**
   * Coach submits an evaluation.
   * targetId = an open evaluation request id (assigned to this coach), OR a player id:
   *   - uses the coach's open request for that player if there is one,
   *   - otherwise the player must be on one of the coach's assigned teams.
   */
  async submitPlayerEvaluation(
    user: { userId?: string; role?: string },
    targetId: string,
    payload: any,
  ) {
    const coach = await CoachProfile.findOne({ userId: user?.userId });
    if (!coach) {
      throw new AppError(403, 'Only coaches can submit player evaluations');
    }
    if (!targetId || !Types.ObjectId.isValid(targetId)) {
      throw new AppError(400, 'Invalid evaluation or player ID');
    }

    let evaluation: any = await PlayerEvaluation.findById(targetId);
    let player: any;

    if (evaluation) {
      if (String(evaluation.coachId) !== String(coach._id)) {
        throw new AppError(403, 'Only the assigned coach can submit this player evaluation');
      }
      if (evaluation.status !== 'NEED_EVALUATION') {
        throw new AppError(
          409,
          'This evaluation has already been submitted. To re-evaluate, submit using the player ID.',
        );
      }
      player = await PlayerProfile.findById(evaluation.playerId);
      if (!player) throw new AppError(404, 'Player not found');
    } else {
      player = await PlayerProfile.findById(targetId);
      if (!player) throw new AppError(404, 'Player or evaluation request not found');

      evaluation = await PlayerEvaluation.findOne({
        playerId: player._id,
        coachId: coach._id,
        status: 'NEED_EVALUATION',
      }).sort({ createdAt: -1 });

      if (!evaluation) {
        const team = await Team.findOne({ coachIds: coach._id, playerIds: player._id })
          .select('academyId')
          .lean();
        if (!team) {
          throw new AppError(
            403,
            'You can only evaluate players on your assigned teams or players the academy requested from you.',
          );
        }
        evaluation = new PlayerEvaluation({
          playerId: player._id,
          coachId: coach._id,
          academyId: (team as any).academyId,
          status: 'NEED_EVALUATION',
        });
      }
    }

    // Graded sections (client grades only), falling back to what the request already holds
    const techniques =
      normalizeGrades(payload.techniques, 'techniques') ?? mapToObject(evaluation.techniques);
    const characteristics =
      normalizeGrades(payload.characteristics, 'characteristics') ??
      mapToObject(evaluation.characteristics);
    const physical =
      normalizeGrades(payload.physical, 'physical') ?? mapToObject(evaluation.physical);

    const explicitScore = (val: any): number | null => {
      if (val === undefined || val === null || val === '') return null;
      const n = Number(val);
      return Number.isFinite(n) ? n : null;
    };
    const categoryAvg = (obj: Record<string, any>): number | null => {
      const scores = Object.values(obj || {})
        .map(gradeToScore)
        .filter((v): v is number => v !== null);
      return scores.length
        ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length)
        : null;
    };

    const technicalScore = explicitScore(payload.technicalScore) ?? categoryAvg(techniques);
    const mentalScore = explicitScore(payload.mentalScore) ?? categoryAvg(characteristics);
    const physicalScore = explicitScore(payload.physicalScore) ?? categoryAvg(physical);

    if (technicalScore === null && mentalScore === null && physicalScore === null) {
      throw new AppError(
        400,
        'Evaluation requires at least one score (technicalScore, mentalScore, physicalScore, or graded techniques / characteristics / physical).',
      );
    }

    const ratingBefore = player.overallRating;

    // Coach-updated attributes, then the SAME Excel recalculation a profile edit triggers.
    const recalculated = await playerStatsService.applyEvaluatorAttributes(player._id, {
      stamina: physicalScore,
      strength: physicalScore,
      ballControl: technicalScore,
      dribbling: technicalScore,
    });
    const overallRating = recalculated?.overallRating ?? ratingBefore ?? 0;

    const previousEvaluation = await PlayerEvaluation.findOne({
      playerId: player._id,
      _id: { $ne: evaluation._id },
      status: { $in: ['EVALUATED', 'EXPIRED', 'OVERDUE'] },
    }).sort({ evaluationDate: -1, createdAt: -1 });

    const improvementDelta =
      typeof previousEvaluation?.overallRating === 'number'
        ? overallRating - previousEvaluation.overallRating
        : typeof ratingBefore === 'number'
          ? overallRating - ratingBefore
          : 0;

    const now = new Date();
    const nextDue = addEvaluationCycle(now);

    evaluation.evaluationDate = now;
    evaluation.overallRating = overallRating;
    evaluation.improvementDelta = improvementDelta;
    evaluation.technicalScore = technicalScore ?? undefined;
    evaluation.mentalScore = mentalScore ?? undefined;
    evaluation.physicalScore = physicalScore ?? undefined;
    evaluation.techniques = techniques;
    evaluation.characteristics = characteristics;
    evaluation.physical = physical;
    evaluation.status = 'EVALUATED';
    evaluation.nextEvaluationDue = nextDue;
    evaluation.expiresAt = nextDue;
    evaluation.coachFeedback = payload.coachFeedback ?? evaluation.coachFeedback;
    evaluation.notes = payload.notes ?? evaluation.notes;
    await evaluation.save();

    await PlayerProfile.updateOne(
      { _id: player._id },
      {
        $set: {
          'playerEvaluation.lastEvaluationDate': now,
          'playerEvaluation.nextEvaluationDue': nextDue,
          'playerEvaluation.overallRating': overallRating,
          'playerEvaluation.evaluationCycle': EVALUATION_CYCLE_KEY,
        },
      },
    );
    await playerCacheService.invalidatePlayerCache(player._id, player.userId);

    if (player.userId) {
      await notificationService.createNotification({
        recipientId: player.userId,
        recipientRole: 'PLAYER',
        title: 'Player Evaluation Completed',
        message: `Coach ${coach.fullName || ''} has completed your 4-month progress evaluation. Overall Rating: ${overallRating}/100.`,
        type: 'PLAYER_EVALUATION_COMPLETED',
        data: { evaluationId: evaluation._id, overallRating },
      });
    }
    if (evaluation.requestedByManagerId) {
      await notificationService.createNotification({
        recipientId: evaluation.requestedByManagerId,
        recipientRole: 'ACADEMY',
        title: 'Requested Player Evaluation Submitted',
        message: `Coach ${coach.fullName || ''} submitted the evaluation for ${player.fullName || 'the player'}. Overall Rating: ${overallRating}/100.`,
        type: 'PLAYER_EVALUATION_COMPLETED',
        data: { evaluationId: evaluation._id, playerId: player._id, overallRating },
      });
    }

    return {
      evaluation,
      player: {
        _id: player._id,
        name: player.fullName || '',
        overallRating,
      },
    };
  }
}

export const coachEvaluationsService = new CoachEvaluationsService();
