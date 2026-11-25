/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';

// ---- Model / service mocks (tests run without MongoDB) ----
jest.mock('@/modules/coach/coach.model', () => ({ CoachProfile: { findOne: jest.fn() } }));
jest.mock('@/modules/academy/academy.model', () => ({
  PlayerEvaluation: Object.assign(jest.fn(), { findById: jest.fn(), findOne: jest.fn() }),
  AcademyProfile: { findOne: jest.fn() },
  AcademyCoach: {},
  Team: { findOne: jest.fn(), find: jest.fn() },
}));
jest.mock('@/modules/player/player.model', () => ({
  PlayerProfile: { findById: jest.fn(), updateOne: jest.fn() },
  PlayerAttributes: { findOneAndUpdate: jest.fn() },
  FifaCardStats: { updateOne: jest.fn() },
  MatchRecord: {},
  PlayerMedia: {},
}));
jest.mock('@/modules/player/services/player-cache.service', () => ({
  playerCacheService: { invalidatePlayerCache: jest.fn() },
}));
jest.mock('@/modules/notification/notification.service', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({ createNotification: jest.fn() })),
  notificationService: { createNotification: jest.fn() },
}));

import { CoachProfile } from '@/modules/coach/coach.model';
import { PlayerEvaluation, Team } from '@/modules/academy/academy.model';
import { PlayerProfile, PlayerAttributes, FifaCardStats } from '@/modules/player/player.model';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { coachEvaluationsService } from './coach-evaluations.service';

const playerId = new Types.ObjectId();
const coachId = new Types.ObjectId();

const makeEvaluation = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  playerId,
  coachId,
  status: 'NEED_EVALUATION',
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

afterEach(() => jest.restoreAllMocks());

describe('PlayerStatsService.applyEvaluatorAttributes', () => {
  it('saves only provided scores, clears manual card stats and runs the shared recalculation', async () => {
    const recalc = jest
      .spyOn(playerStatsService, 'recalculatePlayerStats')
      .mockResolvedValue({ overallRating: 71 } as any);

    await playerStatsService.applyEvaluatorAttributes(playerId, {
      stamina: 88,
      strength: 120, // clamped to 100
      ballControl: null, // not provided -> untouched
      dribbling: undefined,
    });

    expect(PlayerAttributes.findOneAndUpdate).toHaveBeenCalledWith(
      { playerId },
      { $set: { stamina: 88, strength: 100 } },
      expect.objectContaining({ upsert: true }),
    );
    expect(FifaCardStats.updateOne).toHaveBeenCalledWith(
      { playerId },
      { $unset: { manualStats: '' } },
    );
    expect(recalc).toHaveBeenCalledWith(playerId);
  });

  it('does not write attributes when no score was provided', async () => {
    jest.spyOn(playerStatsService, 'recalculatePlayerStats').mockResolvedValue(undefined);
    await playerStatsService.applyEvaluatorAttributes(playerId, { stamina: null });
    expect(PlayerAttributes.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('Coach evaluation uses the same recalculation as a player profile edit', () => {
  beforeEach(() => {
    (CoachProfile.findOne as jest.Mock).mockResolvedValue({ _id: coachId, fullName: 'Coach' });
    // previous-evaluation lookup: PlayerEvaluation.findOne(...).sort(...)
    (PlayerEvaluation.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    (PlayerProfile.findById as jest.Mock).mockResolvedValue({
      _id: playerId,
      userId: new Types.ObjectId(),
      overallRating: 60,
    });
  });

  it('coach module: overall comes from recalculatePlayerStats, not a separate average', async () => {
    const evaluation = makeEvaluation();
    (PlayerEvaluation.findById as jest.Mock).mockResolvedValue(evaluation);
    const apply = jest
      .spyOn(playerStatsService, 'applyEvaluatorAttributes')
      .mockResolvedValue({ overallRating: 73 } as any);

    const result = await coachEvaluationsService.submitPlayerEvaluation(
      { userId: 'u1', role: 'COACH' },
      evaluation._id.toString(),
      {
        techniques: { dribbling: 'Excellent', firstTouch: 'Good' }, // avg 88
        physical: { strength: 70, agility: 90 }, // avg 80
      },
    );

    expect(apply).toHaveBeenCalledWith(playerId, {
      stamina: 80,
      strength: 80,
      ballControl: 88,
      dribbling: 88,
    });
    // (88 + 80) / 2 would be 84 with the old separate formula; the formula result wins.
    expect(result.player.overallRating).toBe(73);
    expect((evaluation as any).overallRating).toBe(73);
    expect((evaluation as any).improvementDelta).toBe(13);
    expect((evaluation as any).mentalScore).toBeUndefined(); // no fabricated 75
  });

  it('coach module: a missing category is not replaced by 75', async () => {
    const evaluation = makeEvaluation();
    (PlayerEvaluation.findById as jest.Mock).mockResolvedValue(evaluation);
    const apply = jest
      .spyOn(playerStatsService, 'applyEvaluatorAttributes')
      .mockResolvedValue({ overallRating: 65 } as any);

    await coachEvaluationsService.submitPlayerEvaluation(
      { userId: 'u1', role: 'COACH' },
      evaluation._id.toString(),
      { techniques: { dribbling: 'Good', firstTouch: '' } }, // empty grade skipped, avg 80
    );

    expect(apply).toHaveBeenCalledWith(playerId, {
      stamina: null,
      strength: null,
      ballControl: 80,
      dribbling: 80,
    });
  });

  it('coach module: rejects an evaluation without any score', async () => {
    const evaluation = makeEvaluation();
    (PlayerEvaluation.findById as jest.Mock).mockResolvedValue(evaluation);
    const apply = jest.spyOn(playerStatsService, 'applyEvaluatorAttributes');

    await expect(
      coachEvaluationsService.submitPlayerEvaluation(
        { userId: 'u1', role: 'COACH' },
        evaluation._id.toString(),
        { notes: 'no scores' },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(apply).not.toHaveBeenCalled();
    expect(evaluation.save).not.toHaveBeenCalled();
  });

  it('sets the next evaluation 4 months ahead', async () => {
    const evaluation = makeEvaluation();
    (PlayerEvaluation.findById as jest.Mock).mockResolvedValue(evaluation);
    jest
      .spyOn(playerStatsService, 'applyEvaluatorAttributes')
      .mockResolvedValue({ overallRating: 70 } as any);

    await coachEvaluationsService.submitPlayerEvaluation(
      { userId: 'u1', role: 'COACH' },
      evaluation._id.toString(),
      { technicalScore: 70 },
    );
    const due = (evaluation as any).nextEvaluationDue as Date;
    const expected = new Date((evaluation as any).evaluationDate);
    expected.setMonth(expected.getMonth() + 4);
    expect(due.getTime()).toBe(expected.getTime());
  });

  it('rejects a grade that is not a client grade', async () => {
    const evaluation = makeEvaluation();
    (PlayerEvaluation.findById as jest.Mock).mockResolvedValue(evaluation);
    await expect(
      coachEvaluationsService.submitPlayerEvaluation(
        { userId: 'u1', role: 'COACH' },
        evaluation._id.toString(),
        { techniques: { dribbling: 'n/a' } },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an evaluation request assigned to another coach', async () => {
    const evaluation = makeEvaluation({ coachId: new Types.ObjectId() });
    (PlayerEvaluation.findById as jest.Mock).mockResolvedValue(evaluation);
    await expect(
      coachEvaluationsService.submitPlayerEvaluation(
        { userId: 'u1', role: 'COACH' },
        evaluation._id.toString(),
        { technicalScore: 80 },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects re-submitting an already submitted evaluation', async () => {
    const evaluation = makeEvaluation({ status: 'EVALUATED' });
    (PlayerEvaluation.findById as jest.Mock).mockResolvedValue(evaluation);
    await expect(
      coachEvaluationsService.submitPlayerEvaluation(
        { userId: 'u1', role: 'COACH' },
        evaluation._id.toString(),
        { technicalScore: 80 },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects a player id that is not on the coach team and has no open request', async () => {
    (PlayerEvaluation.findById as jest.Mock).mockResolvedValue(null);
    (Team.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });
    const apply = jest.spyOn(playerStatsService, 'applyEvaluatorAttributes');
    await expect(
      coachEvaluationsService.submitPlayerEvaluation(
        { userId: 'u1', role: 'COACH' },
        playerId.toString(),
        { technicalScore: 80 },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(apply).not.toHaveBeenCalled();
  });
});
