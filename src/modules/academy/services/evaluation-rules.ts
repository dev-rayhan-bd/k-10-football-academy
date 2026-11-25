import { Types } from 'mongoose';
import { AppError } from '@/utils/AppError';
import { AcademyProfile, Team } from '../academy.model';
import { CoachProfile } from '@/modules/coach/coach.model';
import { PlayerProfile } from '@/modules/player/player.model';

/** Player evaluations are valid for 4 months (client rule). */
export const EVALUATION_CYCLE_MONTHS = 4;
export const EVALUATION_CYCLE_KEY = '4_MONTHS';
export const EVALUATION_CYCLE_LABEL = '4-Month Progress Evaluation';

/** Client-given grade → score values. */
export const EVALUATION_GRADE_SCORES = {
  EXCELLENT: 95,
  GOOD: 80,
  IMPROVEMENT: 65,
} as const;

export const addEvaluationCycle = (from: Date): Date => {
  const d = new Date(from);
  d.setMonth(d.getMonth() + EVALUATION_CYCLE_MONTHS);
  return d;
};

/** Grade string / number → score using ONLY the client values. Unknown → null (no fake score). */
export const gradeToScore = (val: unknown): number | null => {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string') {
    const upper = val.toUpperCase().trim();
    if (!upper) return null;
    if (upper.includes('EXCELLENT')) return EVALUATION_GRADE_SCORES.EXCELLENT;
    if (upper.includes('GOOD')) return EVALUATION_GRADE_SCORES.GOOD;
    if (upper.includes('IMPROVEMENT')) return EVALUATION_GRADE_SCORES.IMPROVEMENT;
    const parsed = Number(val);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
};

/**
 * Overall score (0-100) → grade label, using the midpoints between the client grade values
 * (95 / 80 / 65), so a score maps to the nearest client grade.
 */
export const scoreToGrade = (
  score?: number | null,
): 'EXCELLENT' | 'GOOD' | 'NEEDS_IMPROVEMENT' | null => {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  const { EXCELLENT, GOOD, IMPROVEMENT } = EVALUATION_GRADE_SCORES;
  if (score >= (EXCELLENT + GOOD) / 2) return 'EXCELLENT';
  if (score >= (GOOD + IMPROVEMENT) / 2) return 'GOOD';
  return 'NEEDS_IMPROVEMENT';
};

export type EffectiveEvaluationStatus = 'NEED_EVALUATION' | 'EVALUATED' | 'EXPIRED';

/** Status computed at read time (GET endpoints never write). */
export const effectiveEvaluationStatus = (ev: any, now = new Date()): EffectiveEvaluationStatus => {
  if (!ev) return 'NEED_EVALUATION';
  if (ev.status === 'EVALUATED' || ev.status === 'EXPIRED' || ev.status === 'OVERDUE') {
    if (ev.status !== 'EVALUATED') return 'EXPIRED';
    const due = ev.nextEvaluationDue || ev.expiresAt;
    return due && new Date(due).getTime() < now.getTime() ? 'EXPIRED' : 'EVALUATED';
  }
  return 'NEED_EVALUATION';
};

export const mapToObject = (v: any): Record<string, any> =>
  v ? (v instanceof Map ? Object.fromEntries(v) : v) : {};

const idOf = (v: any): string | null => (v ? String(v._id || v) : null);

/** Player ids on teams the coach is assigned to (Team.coachIds). */
export const getCoachTeamPlayerIds = async (coachProfileId: Types.ObjectId) => {
  const teams = await Team.find({ coachIds: coachProfileId }).select('playerIds academyId').lean();
  return {
    teams,
    playerIds: teams.flatMap((t: any) => (t.playerIds || []).map((p: any) => String(p))),
  };
};

/** Player ids that belong to an academy (academyId on the profile or on an academy team). */
export const getAcademyPlayerIds = async (academyId: Types.ObjectId) => {
  const [direct, teams] = await Promise.all([
    PlayerProfile.find({ academyId }).distinct('_id'),
    Team.find({ academyId }).select('playerIds').lean(),
  ]);
  const ids = new Set<string>(direct.map((d: any) => String(d)));
  teams.forEach((t: any) => (t.playerIds || []).forEach((p: any) => ids.add(String(p))));
  return Array.from(ids);
};

/**
 * Who may view an evaluation report:
 * - SUPER_ADMIN / ADMIN
 * - COACH: the coach on the evaluation, or the player is on one of the coach's teams
 * - PLAYER: their own report
 * - ACADEMY: the evaluation (or the player) belongs to their academy
 */
export const assertCanViewEvaluation = async (
  user: { userId?: string; role?: string } | undefined,
  evaluation: any,
  player: any,
) => {
  const role = user?.role;
  const userId = user?.userId;
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return;
  if (!userId) throw new AppError(401, 'Authentication required');

  const playerId = idOf(player);

  if (role === 'PLAYER') {
    if (player && idOf(player.userId) === String(userId)) return;
  } else if (role === 'COACH') {
    const coach = await CoachProfile.findOne({ userId }).select('_id');
    if (coach) {
      if (evaluation && idOf(evaluation.coachId) === String(coach._id)) return;
      if (playerId) {
        const { playerIds } = await getCoachTeamPlayerIds(coach._id);
        if (playerIds.includes(playerId)) return;
      }
    }
  } else if (role === 'ACADEMY') {
    const academy = await AcademyProfile.findOne({ userId }).select('_id');
    if (academy) {
      if (evaluation && idOf(evaluation.academyId) === String(academy._id)) return;
      if (playerId) {
        const ids = await getAcademyPlayerIds(academy._id);
        if (ids.includes(playerId)) return;
      }
    }
  }
  throw new AppError(403, 'You do not have access to this evaluation');
};

/**
 * Academy for the current user. ACADEMY users always get their OWN academy (an :academyId param
 * for a different academy is rejected); SUPER_ADMIN / ADMIN must pass the academy id.
 */
export const resolveAcademyForUser = async (
  user: { userId?: string; role?: string } | undefined,
  academyIdParam?: string,
) => {
  const role = user?.role;
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
    if (!academyIdParam || !Types.ObjectId.isValid(academyIdParam)) {
      throw new AppError(400, 'A valid academyId is required');
    }
    const academy = await AcademyProfile.findOne({
      $or: [{ _id: academyIdParam }, { userId: academyIdParam }],
    });
    if (!academy) throw new AppError(404, 'Academy profile not found');
    return academy;
  }
  const academy = await AcademyProfile.findOne({ userId: user?.userId });
  if (!academy) throw new AppError(404, 'Academy profile not found');
  if (
    academyIdParam &&
    academyIdParam !== 'me' &&
    academyIdParam !== String(academy._id) &&
    academyIdParam !== String(user?.userId)
  ) {
    throw new AppError(403, 'You can only access your own academy');
  }
  return academy;
};
