import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import QueryBuilder from '@/builder/QueryBuilder';
import { IPlayerEvaluation } from '../academy.interface';
import { PlayerEvaluation, AcademyCoach, Team } from '../academy.model';
import { NotificationService } from '@/modules/notification/notification.service';
import { PlayerProfile } from '@/modules/player/player.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import {
  EVALUATION_CYCLE_LABEL,
  EVALUATION_CYCLE_MONTHS,
  addEvaluationCycle,
  assertCanViewEvaluation,
  effectiveEvaluationStatus,
  getAcademyPlayerIds,
  mapToObject,
  resolveAcademyForUser,
  scoreToGrade,
} from './evaluation-rules';

const notificationService = new NotificationService();

type AuthUser = { userId?: string; role?: string } | undefined;

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const outOf10 = (v?: number | null) =>
  typeof v === 'number' && Number.isFinite(v) ? +(v / 10).toFixed(1) : null;
const outOf20 = (v?: number | null) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(20, Math.max(0, Math.round(v / 5))) : null;
const fmtDate = (d?: Date | string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

/** Age group of a player = ageGroup of the academy team they play in ('' if none). */
const buildAgeGroupMap = async (academyId: Types.ObjectId) => {
  const teams = await Team.find({ academyId }).select('ageGroup playerIds').lean();
  const map = new Map<string, string>();
  teams.forEach((t: any) =>
    (t.playerIds || []).forEach((p: any) => {
      if (!map.has(String(p))) map.set(String(p), t.ageGroup || '');
    }),
  );
  return map;
};

const SUBMITTED = ['EVALUATED', 'EXPIRED', 'OVERDUE'];

export class AcademyEvaluationsService {
  async createPlayerEvaluation(academyId: string, payload: Partial<IPlayerEvaluation>) {
    return PlayerEvaluation.create({ ...payload, academyId });
  }

  /**
   * Evaluation history, scoped by role:
   * ACADEMY → own academy, COACH → own evaluations, PLAYER → own submitted evaluations,
   * SUPER_ADMIN/ADMIN → ?academyId (or all).
   */
  async getPlayerEvaluations(user: AuthUser, query: { academyId?: string; playerId?: string }) {
    const filter: Record<string, unknown> = {};
    const role = user?.role;

    if (query.playerId) {
      if (!Types.ObjectId.isValid(query.playerId)) throw new AppError(400, 'Invalid player ID');
      filter.playerId = new Types.ObjectId(query.playerId);
    }

    if (role === 'ACADEMY') {
      const academy = await resolveAcademyForUser(user, query.academyId);
      filter.academyId = academy._id;
    } else if (role === 'COACH') {
      const coach = await CoachProfile.findOne({ userId: user?.userId }).select('_id');
      if (!coach) throw new AppError(404, 'Coach profile not found');
      filter.coachId = coach._id;
    } else if (role === 'PLAYER') {
      const player = await PlayerProfile.findOne({ userId: user?.userId }).select('_id');
      if (!player) throw new AppError(404, 'Player profile not found');
      filter.playerId = player._id;
      filter.status = { $in: SUBMITTED };
    } else if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      if (query.academyId) {
        const academy = await resolveAcademyForUser(user, query.academyId);
        filter.academyId = academy._id;
      }
    } else {
      throw new AppError(403, 'You do not have access to player evaluations');
    }

    const list = await PlayerEvaluation.find(filter)
      .populate('playerId', 'fullName position profileImage overallRating currentClub')
      .populate('coachId', 'fullName title profileImage licenseStatus')
      .sort({ evaluationDate: -1, createdAt: -1 })
      .lean();
    return list.map((ev: any) => ({ ...ev, status: effectiveEvaluationStatus(ev) }));
  }

  /** Academy analytics page: metrics, widgets and the evaluations table (QueryBuilder). */
  async getAcademyPlayerEvaluationDashboard(
    user: AuthUser,
    academyIdParam: string | undefined,
    query: Record<string, unknown> = {},
  ) {
    const academy = await resolveAcademyForUser(user, academyIdParam);
    const academyPlayerIds = (await getAcademyPlayerIds(academy._id)).map(
      (id) => new Types.ObjectId(id),
    );
    const scope = {
      $or: [{ academyId: academy._id }, { playerId: { $in: academyPlayerIds } }],
    };
    const ageGroupMap = await buildAgeGroupMap(academy._id);

    // ---- Metrics & widgets over SUBMITTED evaluations only ----
    const submitted = await PlayerEvaluation.find({ $and: [scope, { status: { $in: SUBMITTED } }] })
      .populate('playerId', 'fullName position profileImage overallRating')
      .sort({ evaluationDate: -1, createdAt: -1 })
      .lean();
    const openRequests = await PlayerEvaluation.countDocuments({
      $and: [scope, { status: 'NEED_EVALUATION' }],
    });

    const now = new Date();
    let sum = 0;
    let rated = 0;
    let evaluatedThisMonth = 0;
    const latestByPlayer = new Map<string, any>();
    for (const ev of submitted as any[]) {
      if (typeof ev.overallRating === 'number') {
        sum += ev.overallRating;
        rated++;
      }
      const d = ev.evaluationDate ? new Date(ev.evaluationDate) : null;
      if (d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        evaluatedThisMonth++;
      }
      const pid = ev.playerId ? String(ev.playerId._id || ev.playerId) : null;
      if (pid && !latestByPlayer.has(pid)) latestByPlayer.set(pid, ev);
    }
    const latest = Array.from(latestByPlayer.entries()).filter(([, ev]) => ev.playerId);

    const mostImproved = latest
      .filter(([, ev]) => typeof ev.improvementDelta === 'number' && ev.improvementDelta !== 0)
      .sort((a, b) => b[1].improvementDelta - a[1].improvementDelta)
      .slice(0, 5)
      .map(([pid, ev]) => {
        const delta = +(ev.improvementDelta / 10).toFixed(1); // same /10 scale as ratings
        return {
          playerId: pid,
          playerName: ev.playerId.fullName || '',
          ageGroup: ageGroupMap.get(pid) || '',
          delta: delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1),
          deltaValue: delta,
          isPositive: delta >= 0,
        };
      });

    const topPerformers = latest
      .filter(([, ev]) => typeof ev.overallRating === 'number')
      .sort((a, b) => b[1].overallRating - a[1].overallRating)
      .slice(0, 5)
      .map(([pid, ev], idx) => ({
        rank: idx + 1,
        playerId: pid,
        playerName: ev.playerId.fullName || '',
        ageGroup: ageGroupMap.get(pid) || '',
        position: (ev.playerId.position || '').toUpperCase(),
        rating: outOf10(ev.overallRating),
      }));

    // ---- Evaluations table (requests + submitted), QueryBuilder ----
    const listQuery: Record<string, unknown> = { ...query };
    const andParts: Record<string, unknown>[] = [scope];
    const term = typeof listQuery.searchTerm === 'string' ? listQuery.searchTerm.trim() : '';
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      const [pIds, cIds] = await Promise.all([
        PlayerProfile.find({
          _id: { $in: academyPlayerIds },
          $or: [{ fullName: rx }, { position: rx }, { currentClub: rx }],
        }).distinct('_id'),
        CoachProfile.find({ fullName: rx }).distinct('_id'),
      ]);
      andParts.push({ $or: [{ playerId: { $in: pIds } }, { coachId: { $in: cIds } }] });
    }
    const ageGroup = typeof listQuery.ageGroup === 'string' ? listQuery.ageGroup.trim() : '';
    if (ageGroup) {
      const ids = Array.from(ageGroupMap.entries())
        .filter(([, g]) => g.toLowerCase() === ageGroup.toLowerCase())
        .map(([pid]) => new Types.ObjectId(pid));
      andParts.push({ playerId: { $in: ids } });
    }
    const status = typeof listQuery.status === 'string' ? listQuery.status.toUpperCase() : '';
    if (status && status !== 'ALL') {
      if (status === 'NEED_EVALUATION') andParts.push({ status: 'NEED_EVALUATION' });
      else if (status === 'EVALUATED')
        andParts.push({
          status: 'EVALUATED',
          $or: [{ nextEvaluationDue: { $gte: now } }, { nextEvaluationDue: null }],
        });
      else if (status === 'EXPIRED')
        andParts.push({
          $or: [
            { status: { $in: ['EXPIRED', 'OVERDUE'] } },
            { status: 'EVALUATED', nextEvaluationDue: { $lt: now } },
          ],
        });
      else
        throw new AppError(
          400,
          'Invalid status. Allowed: ALL, NEED_EVALUATION, EVALUATED, EXPIRED',
        );
    }
    ['searchTerm', 'ageGroup', 'status', 'academyId', 'fields'].forEach((k) => delete listQuery[k]);
    if (!listQuery.sort) listQuery.sort = '-evaluationDate,-createdAt';

    const evalQuery = new QueryBuilder(PlayerEvaluation.find({ $and: andParts }), listQuery)
      .filter()
      .sort()
      .paginate();
    const [rows, meta] = await Promise.all([
      evalQuery.modelQuery
        .populate('playerId', 'fullName position profileImage currentClub tier overallRating')
        .populate('coachId', 'fullName title profileImage')
        .lean(),
      evalQuery.countTotal(),
    ]);

    const evaluations = (rows as any[]).map((ev) => {
      const p = ev.playerId as any;
      const c = ev.coachId as any;
      const pid = p?._id ? String(p._id) : '';
      const st = effectiveEvaluationStatus(ev);
      const isSubmitted = st !== 'NEED_EVALUATION';
      const rating = isSubmitted ? (ev.overallRating ?? null) : null;
      const position = p?.position || '';
      const tier = p?.tier || '';
      return {
        _id: ev._id,
        evaluationId: ev._id,
        evaluationDate: isSubmitted ? ev.evaluationDate || null : null,
        formattedDate: isSubmitted ? fmtDate(ev.evaluationDate) : '',
        requestedAt: ev.createdAt || null,
        ageGroup: ageGroupMap.get(pid) || '',
        player: {
          _id: p?._id || null,
          name: p?.fullName || '',
          avatar: p?.profileImage || '',
          position,
          tier,
          tierBadge: [position, tier].filter(Boolean).join(' - ').toUpperCase(),
          currentClub: p?.currentClub || '',
        },
        coach: {
          _id: c?._id || null,
          name: c?.fullName || '',
          avatar: c?.profileImage || '',
          title: c?.title || '',
        },
        overallRating: outOf10(rating),
        overallRatingFormatted: rating !== null ? `(${outOf10(rating)}/10)` : '',
        rawOverallRating: rating,
        scores: {
          technical: outOf20(ev.technicalScore),
          physical: outOf20(ev.physicalScore),
          mental: outOf20(ev.mentalScore),
          technicalScore: ev.technicalScore ?? null,
          physicalScore: ev.physicalScore ?? null,
          mentalScore: ev.mentalScore ?? null,
        },
        improvementDelta: ev.improvementDelta ?? 0,
        status: st,
        nextEvaluationDue: isSubmitted ? ev.nextEvaluationDue || null : null,
        reminderCount: ev.reminderCount || 0,
      };
    });

    return {
      metrics: {
        avgOverallRating: rated ? outOf10(sum / rated) : 0,
        improvingPlayers: latest.filter(([, ev]) => (ev.improvementDelta || 0) > 0).length,
        evaluatedThisMonth,
        totalEvaluations: submitted.length,
        openRequests,
        evaluationCycleMonths: EVALUATION_CYCLE_MONTHS,
      },
      mostImproved,
      topPerformers,
      evaluations,
      meta,
    };
  }

  /** Full evaluation sheet (technical / mental / physical sections) for academy & player views. */
  async getAcademyPlayerEvaluationDetails(user: AuthUser, targetId: string) {
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
        evaluation = await PlayerEvaluation.findOne({ playerId: player._id })
          .sort({ evaluationDate: -1, createdAt: -1 })
          .populate('coachId')
          .populate('academyId')
          .lean();
      }
    }
    if (!player) throw new AppError(404, 'Player evaluation report not found');
    await assertCanViewEvaluation(user, evaluation, player);

    const techniques = mapToObject(evaluation?.techniques);
    const characteristics = mapToObject(evaluation?.characteristics);
    const physical = mapToObject(evaluation?.physical);
    const coach = evaluation?.coachId as any;
    const academy = evaluation?.academyId as any;
    const st = evaluation ? effectiveEvaluationStatus(evaluation) : 'NEED_EVALUATION';
    const isSubmitted = st !== 'NEED_EVALUATION';
    const evalDate = isSubmitted ? evaluation?.evaluationDate || null : null;
    const nextDue = isSubmitted
      ? evaluation?.nextEvaluationDue || (evalDate ? addEvaluationCycle(new Date(evalDate)) : null)
      : null;
    const rawRating = isSubmitted ? (evaluation?.overallRating ?? null) : null;

    // Client evaluation sheet keys. A skill without a grade stays null (never a default grade).
    const section = (cfg: Array<{ key: string; label: string }>, values: Record<string, any>) =>
      cfg.map((item) => ({
        key: item.key,
        skill: item.label,
        rating: values[item.key] ? String(values[item.key]).toUpperCase() : null,
      }));

    const technicalList = section(
      [
        { key: 'dribbling', label: 'Dribbling' },
        { key: 'ballMastery', label: 'Ball Mastery' },
        { key: 'runningWithBall', label: 'Running with Ball' },
        { key: 'rangeOfPassing', label: 'Range of Passing' },
        { key: 'strikingFinishing', label: 'Striking / Finishing' },
        { key: 'defending', label: 'Defending' },
        { key: 'firstTouch', label: 'First Touch' },
        { key: 'nonDominantFoot', label: 'Non dominant foot' },
      ],
      techniques,
    );
    const mentalList = section(
      [
        { key: 'gameAwareness', label: 'Game Awareness' },
        { key: 'gamesUnderstanding', label: 'Games Understanding' },
        { key: 'decisionMaking', label: 'Decision Making' },
        { key: 'concentration', label: 'Concentration' },
        { key: 'leadership', label: 'Leadership' },
        { key: 'desire', label: 'Desire' },
        { key: 'maturity', label: 'Maturity' },
      ],
      characteristics,
    );
    const physicalList = section(
      [
        { key: 'speedAcceleration', label: 'Speed & Acceleration' },
        { key: 'movement', label: 'Movement' },
        { key: 'balance', label: 'Balance' },
        { key: 'power', label: 'Power' },
        { key: 'strength', label: 'Strength' },
        { key: 'agility', label: 'Agility' },
        { key: 'coordination', label: 'Coordination' },
      ],
      physical,
    );

    const position = player.position || '';
    const tier = player.tier || '';

    return {
      reportTitle: 'PLAYER EVALUATION REPORT',
      subtitle: player.fullName
        ? `DEVELOPMENT REPORT SHEET FOR ${String(player.fullName).toUpperCase()}`
        : 'DEVELOPMENT REPORT SHEET',
      evaluationId: evaluation?._id || null,
      evaluationDate: evalDate,
      formattedDate: fmtDate(evalDate),
      cycle: EVALUATION_CYCLE_LABEL,
      status: st,
      nextEvaluationDue: nextDue,
      formattedNextEvaluationDue: fmtDate(nextDue),
      overallRating: outOf10(rawRating),
      overallRatingFormatted: rawRating !== null ? `(${outOf10(rawRating)}/10)` : '',
      rawOverallRating: rawRating,
      grade: scoreToGrade(rawRating),
      categoryScores: {
        technical: outOf20(evaluation?.technicalScore),
        physical: outOf20(evaluation?.physicalScore),
        mental: outOf20(evaluation?.mentalScore),
        technicalScore: evaluation?.technicalScore ?? null,
        physicalScore: evaluation?.physicalScore ?? null,
        mentalScore: evaluation?.mentalScore ?? null,
      },
      player: {
        _id: player._id,
        name: player.fullName || '',
        position,
        age: player.age ?? null,
        avatar: player.profileImage || '',
        academy: academy?.name || '',
        currentClub: player.currentClub || '',
        overallRating: outOf10(player.overallRating),
        tier,
        tierBadge: [position, tier].filter(Boolean).join(' - ').toUpperCase(),
      },
      coach: {
        _id: coach?._id || null,
        name: coach?.fullName || '',
        club: coach?.currentClub || '',
        avatar: coach?.profileImage || '',
        license: coach?.coachingLicenseLevel || coach?.licenseStatus || '',
      },
      academy: {
        _id: academy?._id || null,
        name: academy?.name || '',
        logo: academy?.logo || '',
      },
      sections: {
        technical: technicalList,
        mental: mentalList,
        physical: physicalList,
      },
      techniquesRaw: techniques,
      characteristicsRaw: characteristics,
      physicalRaw: physical,
      coachFeedback: evaluation?.coachFeedback || '',
      notes: evaluation?.notes || '',
    };
  }

  /** Request/reminder management page: due (open requests), overdue (expired), evaluated. */
  async getEvaluationDashboard(user: AuthUser, academyIdParam?: string) {
    const academy = await resolveAcademyForUser(user, academyIdParam);

    const evaluations = await PlayerEvaluation.find({ academyId: academy._id })
      .populate('playerId', 'fullName position profileImage overallRating currentClub')
      .populate('coachId', 'fullName title profileImage phone email licenseStatus')
      .sort({ createdAt: -1 })
      .lean();

    // Status computed at read time — this GET never writes to the database.
    const now = new Date();
    const evaluated: any[] = [];
    const due: any[] = [];
    const overdue: any[] = [];
    for (const item of evaluations as any[]) {
      const st = effectiveEvaluationStatus(item, now);
      const row = { ...item, status: st };
      if (st === 'EVALUATED') evaluated.push(row);
      else if (st === 'EXPIRED') overdue.push(row);
      else due.push(row);
    }

    return {
      summary: {
        totalEvaluations: evaluations.length,
        evaluatedCount: evaluated.length,
        dueCount: due.length,
        overdueCount: overdue.length,
        evaluationCycleMonths: EVALUATION_CYCLE_MONTHS,
      },
      due,
      overdue,
      evaluated,
    };
  }

  async requestPlayerEvaluation(
    user: AuthUser,
    academyIdParam: string | undefined,
    payload: { playerId: string; coachId: string; notes?: string },
  ) {
    const academy = await resolveAcademyForUser(user, academyIdParam);

    if (!payload?.playerId || !Types.ObjectId.isValid(payload.playerId)) {
      throw new AppError(400, 'A valid playerId is required');
    }
    if (!payload?.coachId || !Types.ObjectId.isValid(payload.coachId)) {
      throw new AppError(400, 'A valid coachId is required');
    }

    const player = await PlayerProfile.findById(payload.playerId);
    if (!player) throw new AppError(404, 'Player not found');

    const academyPlayerIds = await getAcademyPlayerIds(academy._id);
    if (!academyPlayerIds.includes(String(player._id))) {
      throw new AppError(
        400,
        `${player.fullName || 'This player'} is not a player of ${academy.name}.`,
      );
    }

    const coach = await CoachProfile.findOne({
      $or: [{ _id: payload.coachId }, { userId: payload.coachId }],
    });
    if (!coach) throw new AppError(404, 'Coach not found');

    const approvedAffiliation = await AcademyCoach.findOne({
      academyId: academy._id,
      coachId: coach._id,
      status: 'APPROVED',
    });
    if (!approvedAffiliation) {
      throw new AppError(
        400,
        `Coach ${coach.fullName} is not an officially approved coach of ${academy.name}. Only verified academy coaches can evaluate academy players.`,
      );
    }

    const openRequest = await PlayerEvaluation.findOne({
      playerId: player._id,
      academyId: academy._id,
      status: 'NEED_EVALUATION',
    });
    if (openRequest) {
      throw new AppError(
        409,
        'An evaluation request for this player is already open. Send a reminder instead.',
      );
    }

    const evaluation = await PlayerEvaluation.create({
      academyId: academy._id,
      playerId: player._id,
      coachId: coach._id,
      status: 'NEED_EVALUATION',
      requestedByManagerId: user?.userId ? new Types.ObjectId(user.userId) : undefined,
      notes: payload.notes || '',
    });

    await notificationService.createNotification({
      recipientId: coach.userId,
      recipientRole: 'COACH',
      title: 'Player Evaluation Required',
      message: `${academy.name} has requested an evaluation for ${player.fullName}. Evaluations are valid for ${EVALUATION_CYCLE_MONTHS} months.`,
      type: 'PLAYER_EVALUATION_REQUESTED',
      data: {
        evaluationId: evaluation._id,
        playerId: player._id,
        playerName: player.fullName,
      },
    });

    return evaluation;
  }

  async sendEvaluationReminder(user: AuthUser, evaluationId: string) {
    if (!Types.ObjectId.isValid(evaluationId)) {
      throw new AppError(400, 'Invalid evaluation ID');
    }
    const evaluation = await PlayerEvaluation.findById(evaluationId)
      .populate('playerId', 'fullName')
      .populate('coachId', 'userId fullName');
    if (!evaluation) throw new AppError(404, 'Player evaluation record not found');

    if (user?.role !== 'SUPER_ADMIN' && user?.role !== 'ADMIN') {
      const academy = await resolveAcademyForUser(user);
      if (String(evaluation.academyId) !== String(academy._id)) {
        throw new AppError(403, 'This evaluation does not belong to your academy');
      }
    }
    if (evaluation.status !== 'NEED_EVALUATION') {
      throw new AppError(400, 'Reminders can only be sent for open evaluation requests');
    }

    const coach = evaluation.coachId as any;
    const player = evaluation.playerId as any;
    if (!coach?.userId) throw new AppError(404, 'Assigned coach not found');

    evaluation.reminderCount = (evaluation.reminderCount || 0) + 1;
    evaluation.reminderSentAt = new Date();
    await evaluation.save();

    await notificationService.createNotification({
      recipientId: coach.userId,
      recipientRole: 'COACH',
      title: 'Reminder: Player Evaluation Due',
      message: `Player evaluation for ${player?.fullName || 'your player'} is due. Please submit the evaluation.`,
      type: 'PLAYER_EVALUATION_REMINDER',
      data: {
        evaluationId: evaluation._id,
        reminderCount: evaluation.reminderCount,
      },
    });

    return {
      message: 'Evaluation reminder sent to coach successfully',
      evaluationId: evaluation._id,
      coachId: coach._id,
      reminderCount: evaluation.reminderCount,
      sentAt: evaluation.reminderSentAt,
    };
  }
}

export const academyEvaluationsService = new AcademyEvaluationsService();
