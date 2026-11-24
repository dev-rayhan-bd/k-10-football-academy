/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';

// ---- Model / service mocks (tests run without MongoDB) ----
jest.mock('@/modules/coach/coach.model', () => ({ CoachProfile: { findOne: jest.fn() } }));
jest.mock('@/modules/academy/academy.model', () => ({
  PlayerEvaluation: Object.assign(jest.fn(), { findById: jest.fn(), findOne: jest.fn() }),
  AcademyProfile: { findOne: jest.fn() },
  AcademyCoach: {},
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
import { PlayerEvaluation } from '@/modules/academy/academy.model';
import { PlayerProfile, PlayerAttributes, FifaCardStats } from '@/modules/player/player.model';
import { playerStatsService } from '@/modules/player/services/player-stats.service';
import { coachEvaluationsService } from './coach-evaluations.service';
import { academyEvaluationsService } from '@/modules/academy/services/academy-evaluations.service';

const playerId = new Types.ObjectId();
const coachId = new Types.ObjectId();

const makeEvaluation = () => ({
  _id: new Types.ObjectId(),
  playerId,
  coachId,
  save: jest.fn().mockResolvedValue(undefined),
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
      { techniques: { dribbling: 'Good', unknownGrade: 'n/a' } }, // 'n/a' skipped, avg 80
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

  it('academy module (assigned coach): same shared recalculation', async () => {
    const evaluation = makeEvaluation();
    (PlayerEvaluation.findById as jest.Mock).mockResolvedValue(evaluation);
    (PlayerEvaluation.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    const apply = jest
      .spyOn(playerStatsService, 'applyEvaluatorAttributes')
      .mockResolvedValue({ overallRating: 77 } as any);

    const result: any = await academyEvaluationsService.submitPlayerEvaluation(
      evaluation._id.toString(),
      'u1',
      { technicalScore: 90, physicalScore: 70 } as any,
    );

    expect(apply).toHaveBeenCalledWith(playerId, {
      stamina: 70,
      strength: 70,
      ballControl: 90,
      dribbling: 90,
    });
    expect(result.overallRating).toBe(77); // not (90 + 70) / 2
    expect(result.mentalScore).toBeUndefined();
  });
});
