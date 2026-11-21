import {
  calculateMatchPerformance,
  calculatePositionRating,
  formatAttributeLabel,
  getInterpretationScore,
  POSITION_ATTRIBUTE_COEFFICIENTS,
  PositionKey,
} from './ratingCalculator';

describe('Rating Calculator Utility Tests', () => {
  describe('calculatePositionRating', () => {
    it('should match the exact client CB Excel sheet worked example (Weighted Sum 71.64 -> Overall 72)', () => {
      const cbAttributes = {
        positioning: 85, // Defensive Positioning 12% -> 10.20
        marking: 75, // Marking 10% -> 7.50
        tackling: 65, // Tackling 11% -> 7.15
        interceptions: 70, // Interceptions 10% -> 7.00
        anticipation: 71, // Anticipation 9% -> 6.39
        aerialDuels: 57, // Aerial Duels 9% -> 5.13
        strength: 69, // Strength 8% -> 5.52
        defensiveAwareness: 70, // Defensive Awareness 10% -> 7.00
        shortPassing: 87, // Passing 5% -> 4.35
        ballControl: 81, // Ball Control 4% -> 3.24
        decisions: 63, // Decision Making 7% -> 4.41
        composure: 75, // Composure 5% -> 3.75
      };

      const rating = calculatePositionRating('CB', cbAttributes);
      expect(rating).toBe(72);
    });

    it('should ensure all 10 positions have exactly 12 attributes with weights summing to 100%', () => {
      const positions = Object.keys(POSITION_ATTRIBUTE_COEFFICIENTS) as PositionKey[];
      expect(positions).toHaveLength(10);

      for (const pos of positions) {
        const entries = Object.entries(POSITION_ATTRIBUTE_COEFFICIENTS[pos]);
        expect(entries).toHaveLength(12);
        const totalWeight = entries.reduce((sum, [, w]) => sum + Math.round(w * 100), 0);
        expect(totalWeight).toBe(100);
      }
    });

    it('should return exact client Excel attribute labels for position-specific keys', () => {
      expect(formatAttributeLabel('positioning', 'GK')).toBe('GK Positioning');
      expect(formatAttributeLabel('oneOnOne', 'GK')).toBe('One-on-One');
      expect(formatAttributeLabel('positioning', 'CB')).toBe('Defensive Positioning');
      expect(formatAttributeLabel('aerialDuels', 'CB')).toBe('Aerial Duels');
      expect(formatAttributeLabel('shortPassing', 'CB')).toBe('Passing');
      expect(formatAttributeLabel('offTheBall', 'RB-LB')).toBe('Off-the-Ball Movement');
      expect(formatAttributeLabel('oneOnOne', 'RB-LB')).toBe('One-on-One Defending');
      expect(formatAttributeLabel('oneOnOneAttacking', 'RW-LW')).toBe('One-on-One Attacking');
      expect(formatAttributeLabel('decisions', 'ST')).toBe('Decision Making');
      expect(formatAttributeLabel('oneOnOneFinishing', 'ST')).toBe('One-on-One Finishing');
      expect(formatAttributeLabel('linkUpPlay', 'CF')).toBe('Link-Up Play');
    });

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
