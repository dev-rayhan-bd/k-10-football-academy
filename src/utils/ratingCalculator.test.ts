import {
  calculateMatchPerformance,
  calculatePositionRating,
  getInterpretationScore,
} from './ratingCalculator';

describe('Rating Calculator Utility Tests', () => {
  describe('calculatePositionRating', () => {
    it('should calculate weighted rating for ST position correctly', () => {
      const attributes = {
        finishing: 80,
        attPosition: 75,
        offTheBall: 70,
        firstTouch: 85,
        shotAccuracy: 80,
        oneOnOneFinishing: 75,
        aerialAbility: 70,
        strength: 65,
        acceleration: 85,
        anticipation: 75,
        decisions: 80,
        composure: 80,
      };

      const rating = calculatePositionRating('ST', attributes);
      expect(rating).toBeGreaterThanOrEqual(70);
      expect(rating).toBeLessThanOrEqual(85);
    });

    it('should handle missing attributes gracefully with default rating', () => {
      const rating = calculatePositionRating('GK', {});
      expect(rating).toBe(50);
    });
  });

  describe('calculateMatchPerformance', () => {
    it('should match client CDM sheet sample calculation (76 minutes, Overall ~ 87)', () => {
      const cdmEvents = [
        // Attack
        { eventId: 'goal', count: 1 },
        { eventId: 'assist', count: 1 },
        { eventId: 'shot_on_target', count: 3 },
        { eventId: 'shot_off_target', count: 2 },
        { eventId: 'big_chance_created', count: 2 },
        { eventId: 'big_chance_missed', count: 2 },
        { eventId: 'successful_dribble', count: 7 },
        { eventId: 'failed_dribble', count: 2 },

        // Passing
        { eventId: 'completed_pass', count: 65 },
        { eventId: 'incomplete_pass', count: 12 },
        { eventId: 'key_pass', count: 3 },
        { eventId: 'through_ball_completed', count: 1 },
        { eventId: 'long_pass_completed', count: 6 },
        { eventId: 'cross_completed', count: 2 },
        { eventId: 'cross_failed', count: 2 },

        // Possession
        { eventId: 'ball_retention', count: 2 },
        { eventId: 'turnover', count: 1 },
        { eventId: 'free_kick_won', count: 2 },

        // Defending
        { eventId: 'tackle_won', count: 2 },
        { eventId: 'tackle_lost', count: 2 },
        { eventId: 'interception', count: 2 },
        { eventId: 'clearance', count: 2 },
        { eventId: 'block', count: 1 },
        { eventId: 'ground_duel_won', count: 2 },
        { eventId: 'recovery', count: 2 },
        { eventId: 'defensive_error', count: 2 },

        // Discipline
        { eventId: 'foul_committed', count: 2 },
        { eventId: 'yellow_card', count: 1 },
      ];

      const result = calculateMatchPerformance('CDM', 76, cdmEvents);

      expect(result.overallRating).toBe(87);
      expect(result.interpretation).toBe('Excellent');
      expect(result.categoryAdjustedScores.Passing).toBeCloseTo(21.11, 1);
    });

    it('should clamp overall rating between 0 and 100', () => {
      const extremeGood = calculateMatchPerformance('ST', 90, [
        { eventId: 'goal', count: 20 },
        { eventId: 'assist', count: 10 },
      ]);
      expect(extremeGood.overallRating).toBe(100);

      const extremeBad = calculateMatchPerformance('CB', 90, [
        { eventId: 'error_leading_to_goal', count: 10 },
        { eventId: 'red_card', count: 1 },
      ]);
      expect(extremeBad.overallRating).toBe(0);
    });
  });

  describe('getInterpretationScore', () => {
    it('should categorize scores correctly', () => {
      expect(getInterpretationScore(95)).toBe('Outstanding');
      expect(getInterpretationScore(87)).toBe('Excellent');
      expect(getInterpretationScore(82)).toBe('Very Good');
      expect(getInterpretationScore(77)).toBe('Good');
      expect(getInterpretationScore(65)).toBe('Developing / Average');
      expect(getInterpretationScore(45)).toBe('Needs Development');
    });
  });
});
