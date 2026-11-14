export type PositionKey =
  'GK' | 'CB' | 'RB-LB' | 'RWB-LWB' | 'CDM' | 'CM' | 'CAM' | 'RW-LW' | 'CF' | 'ST';

export type CategoryKey =
  'Attack' | 'Passing' | 'Possession' | 'Defending' | 'Discipline' | 'Goalkeeping';

export interface IMatchEventDefinition {
  id: string;
  name: string;
  category: CategoryKey;
  basePoints: number;
}

export const MATCH_EVENTS: Record<string, IMatchEventDefinition> = {
  // Attack
  goal: { id: 'goal', name: 'Goal', category: 'Attack', basePoints: 8.0 },
  assist: { id: 'assist', name: 'Assist', category: 'Attack', basePoints: 6.0 },
  shot_on_target: {
    id: 'shot_on_target',
    name: 'Shot on Target',
    category: 'Attack',
    basePoints: 1.2,
  },
  shot_off_target: {
    id: 'shot_off_target',
    name: 'Shot off Target',
    category: 'Attack',
    basePoints: -0.4,
  },
  big_chance_created: {
    id: 'big_chance_created',
    name: 'Big Chance Created',
    category: 'Attack',
    basePoints: 2.5,
  },
  big_chance_missed: {
    id: 'big_chance_missed',
    name: 'Big Chance Missed',
    category: 'Attack',
    basePoints: -2.0,
  },
  successful_dribble: {
    id: 'successful_dribble',
    name: 'Successful Dribble',
    category: 'Attack',
    basePoints: 1.0,
  },
  failed_dribble: {
    id: 'failed_dribble',
    name: 'Failed Dribble',
    category: 'Attack',
    basePoints: -0.6,
  },
  penalty_won: { id: 'penalty_won', name: 'Penalty Won', category: 'Attack', basePoints: 3.0 },
  penalty_missed: {
    id: 'penalty_missed',
    name: 'Penalty Missed',
    category: 'Attack',
    basePoints: -5.0,
  },

  // Passing
  completed_pass: {
    id: 'completed_pass',
    name: 'Completed Pass',
    category: 'Passing',
    basePoints: 0.14,
  },
  incomplete_pass: {
    id: 'incomplete_pass',
    name: 'Incomplete Pass',
    category: 'Passing',
    basePoints: -0.1,
  },
  key_pass: { id: 'key_pass', name: 'Key Pass', category: 'Passing', basePoints: 1.2 },
  through_ball_completed: {
    id: 'through_ball_completed',
    name: 'Through Ball Completed',
    category: 'Passing',
    basePoints: 1.0,
  },
  long_pass_completed: {
    id: 'long_pass_completed',
    name: 'Long Pass Completed',
    category: 'Passing',
    basePoints: 0.35,
  },
  cross_completed: {
    id: 'cross_completed',
    name: 'Cross Completed',
    category: 'Passing',
    basePoints: 0.65,
  },
  cross_failed: { id: 'cross_failed', name: 'Cross Failed', category: 'Passing', basePoints: -0.2 },

  // Possession
  ball_retention: {
    id: 'ball_retention',
    name: 'Ball Retention Under Pressure',
    category: 'Possession',
    basePoints: 0.45,
  },
  turnover: {
    id: 'turnover',
    name: 'Turnover / Possession Lost',
    category: 'Possession',
    basePoints: -0.55,
  },
  free_kick_won: {
    id: 'free_kick_won',
    name: 'Fouled / Free Kick Won',
    category: 'Possession',
    basePoints: 0.3,
  },
  successful_carry: {
    id: 'successful_carry',
    name: 'Successful Carry',
    category: 'Possession',
    basePoints: 0.3,
  },

  // Defending
  tackle_won: { id: 'tackle_won', name: 'Tackle Won', category: 'Defending', basePoints: 0.9 },
  tackle_lost: { id: 'tackle_lost', name: 'Tackle Lost', category: 'Defending', basePoints: -0.45 },
  interception: {
    id: 'interception',
    name: 'Interception',
    category: 'Defending',
    basePoints: 1.0,
  },
  clearance: { id: 'clearance', name: 'Clearance', category: 'Defending', basePoints: 0.45 },
  block: { id: 'block', name: 'Block', category: 'Defending', basePoints: 0.85 },
  aerial_duel_won: {
    id: 'aerial_duel_won',
    name: 'Aerial Duel Won',
    category: 'Defending',
    basePoints: 0.65,
  },
  aerial_duel_lost: {
    id: 'aerial_duel_lost',
    name: 'Aerial Duel Lost',
    category: 'Defending',
    basePoints: -0.35,
  },
  ground_duel_won: {
    id: 'ground_duel_won',
    name: 'Ground Duel Won',
    category: 'Defending',
    basePoints: 0.55,
  },
  ground_duel_lost: {
    id: 'ground_duel_lost',
    name: 'Ground Duel Lost',
    category: 'Defending',
    basePoints: -0.3,
  },
  recovery: { id: 'recovery', name: 'Recovery', category: 'Defending', basePoints: 0.45 },
  defensive_error: {
    id: 'defensive_error',
    name: 'Defensive Error',
    category: 'Defending',
    basePoints: -3.5,
  },
  error_leading_to_goal: {
    id: 'error_leading_to_goal',
    name: 'Error Leading to Goal',
    category: 'Defending',
    basePoints: -7.0,
  },

  // Discipline
  foul_committed: {
    id: 'foul_committed',
    name: 'Foul Committed',
    category: 'Discipline',
    basePoints: -0.45,
  },
  yellow_card: { id: 'yellow_card', name: 'Yellow Card', category: 'Discipline', basePoints: -2.0 },
  red_card: { id: 'red_card', name: 'Red Card', category: 'Discipline', basePoints: -8.0 },

  // Goalkeeping
  save: { id: 'save', name: 'Save', category: 'Goalkeeping', basePoints: 1.1 },
  big_save: { id: 'big_save', name: 'Big Save', category: 'Goalkeeping', basePoints: 2.8 },
  goal_conceded: {
    id: 'goal_conceded',
    name: 'Goal Conceded',
    category: 'Goalkeeping',
    basePoints: -1.8,
  },
  clean_sheet: { id: 'clean_sheet', name: 'Clean Sheet', category: 'Goalkeeping', basePoints: 4.0 },
  cross_claimed: {
    id: 'cross_claimed',
    name: 'Cross Claimed',
    category: 'Goalkeeping',
    basePoints: 0.8,
  },
  cross_missed: {
    id: 'cross_missed',
    name: 'Cross Missed',
    category: 'Goalkeeping',
    basePoints: -1.2,
  },
  save_1v1: { id: 'save_1v1', name: '1v1 Save', category: 'Goalkeeping', basePoints: 2.5 },
  distribution_completed: {
    id: 'distribution_completed',
    name: 'Distribution Completed',
    category: 'Goalkeeping',
    basePoints: 0.18,
  },
  distribution_failed: {
    id: 'distribution_failed',
    name: 'Distribution Failed',
    category: 'Goalkeeping',
    basePoints: -0.3,
  },
};

/**
 * 12 Yellow Indicators (Excel rows 12-16, 20-22, 33, 35, 38-39)
 */
export const YELLOW_INDICATORS = [
  'shot_on_target',
  'shot_off_target',
  'big_chance_created',
  'big_chance_missed',
  'successful_dribble',
  'completed_pass',
  'incomplete_pass',
  'key_pass',
  'interception',
  'block',
  'ground_duel_won',
  'ground_duel_lost',
] as const;

/**
 * 12 Blue Indicators (Excel rows 11, 17-19, 23-30)
 */
export const BLUE_INDICATORS = [
  'assist',
  'failed_dribble',
  'penalty_won',
  'penalty_missed',
  'through_ball_completed',
  'long_pass_completed',
  'cross_completed',
  'cross_failed',
  'ball_retention',
  'turnover',
  'free_kick_won',
  'successful_carry',
] as const;

/**
 * 12 White Indicators (Excel rows 10, 31-32, 34, 36-37, 40-45)
 */
export const WHITE_INDICATORS = [
  'goal',
  'tackle_won',
  'tackle_lost',
  'clearance',
  'aerial_duel_won',
  'aerial_duel_lost',
  'recovery',
  'defensive_error',
  'error_leading_to_goal',
  'foul_committed',
  'yellow_card',
  'red_card',
] as const;

/**
 * 9 Red Goalkeeping Indicators (Excel rows 46-54)
 */
export const RED_INDICATORS = [
  'save',
  'big_save',
  'goal_conceded',
  'clean_sheet',
  'cross_claimed',
  'cross_missed',
  'save_1v1',
  'distribution_completed',
  'distribution_failed',
] as const;

/**
 * Client Instruction Sequence for Field Players:
 * First Yellow (12), Second Blue (12), Third White (12) -> Exactly 36 indicators
 */
export const FIELD_PLAYER_INDICATORS = [
  ...YELLOW_INDICATORS,
  ...BLUE_INDICATORS,
  ...WHITE_INDICATORS,
] as const;

/**
 * Client Instruction Sequence for Goalkeepers:
 * First Red plus (red card, Yellow card and foul committed) (12), Second Yellow (12), Third Blue (12), Fourth White (9) -> Exactly 45 indicators
 */
export const GOALKEEPER_INDICATORS = [
  // First: 9 Red Goalkeeping + 3 Discipline
  ...RED_INDICATORS,
  'red_card',
  'yellow_card',
  'foul_committed',
  // Second: 12 Yellow
  ...YELLOW_INDICATORS,
  // Third: 12 Blue
  ...BLUE_INDICATORS,
  // Fourth: 9 White (remaining defending/attacking white indicators)
  'goal',
  'tackle_won',
  'tackle_lost',
  'clearance',
  'aerial_duel_won',
  'aerial_duel_lost',
  'recovery',
  'defensive_error',
  'error_leading_to_goal',
] as const;

export const POSITION_CATEGORY_MULTIPLIERS: Record<PositionKey, Record<CategoryKey, number>> = {
  GK: {
    Attack: 0.15,
    Passing: 0.65,
    Possession: 0.6,
    Defending: 0.8,
    Discipline: 1.0,
    Goalkeeping: 1.6,
  },
  CB: {
    Attack: 0.55,
    Passing: 0.9,
    Possession: 0.85,
    Defending: 1.35,
    Discipline: 1.0,
    Goalkeeping: 0.0,
  },
  'RB-LB': {
    Attack: 0.8,
    Passing: 1.0,
    Possession: 1.0,
    Defending: 1.15,
    Discipline: 1.0,
    Goalkeeping: 0.0,
  },
  'RWB-LWB': {
    Attack: 1.0,
    Passing: 1.05,
    Possession: 1.05,
    Defending: 0.95,
    Discipline: 1.0,
    Goalkeeping: 0.0,
  },
  CDM: {
    Attack: 0.65,
    Passing: 1.15,
    Possession: 1.1,
    Defending: 1.3,
    Discipline: 1.0,
    Goalkeeping: 0.0,
  },
  CM: {
    Attack: 0.85,
    Passing: 1.3,
    Possession: 1.2,
    Defending: 0.85,
    Discipline: 1.0,
    Goalkeeping: 0.0,
  },
  CAM: {
    Attack: 1.25,
    Passing: 1.3,
    Possession: 1.2,
    Defending: 0.45,
    Discipline: 1.0,
    Goalkeeping: 0.0,
  },
  'RW-LW': {
    Attack: 1.35,
    Passing: 1.0,
    Possession: 1.2,
    Defending: 0.4,
    Discipline: 1.0,
    Goalkeeping: 0.0,
  },
  CF: {
    Attack: 1.35,
    Passing: 0.95,
    Possession: 1.05,
    Defending: 0.35,
    Discipline: 1.0,
    Goalkeeping: 0.0,
  },
  ST: {
    Attack: 1.5,
    Passing: 0.75,
    Possession: 0.95,
    Defending: 0.3,
    Discipline: 1.0,
    Goalkeeping: 0.0,
  },
};

export const POSITION_ATTRIBUTE_COEFFICIENTS: Record<PositionKey, Record<string, number>> = {
  GK: {
    reflexes: 0.12,
    handling: 0.09,
    positioning: 0.11,
    oneOnOne: 0.1,
    aerialAbility: 0.08,
    crossClaiming: 0.07,
    shotStopping: 0.12,
    footwork: 0.06,
    distribution: 0.07,
    decisions: 0.07,
    communication: 0.05,
    composure: 0.06,
  },
  CB: {
    positioning: 0.12,
    marking: 0.1,
    tackling: 0.11,
    interceptions: 0.1,
    anticipation: 0.09,
    aerialAbility: 0.09,
    strength: 0.08,
    defensiveAwareness: 0.1,
    shortPassing: 0.05,
    ballControl: 0.04,
    decisions: 0.07,
    composure: 0.05,
  },
  'RB-LB': {
    positioning: 0.1,
    oneOnOne: 0.1,
    tackling: 0.09,
    interceptions: 0.07,
    acceleration: 0.09,
    sprintSpeed: 0.09,
    stamina: 0.09,
    crossing: 0.09,
    shortPassing: 0.07,
    ballControl: 0.06,
    attPosition: 0.07,
    decisions: 0.08,
  },
  'RWB-LWB': {
    acceleration: 0.1,
    sprintSpeed: 0.1,
    stamina: 0.11,
    dribbling: 0.09,
    ballControl: 0.08,
    crossing: 0.11,
    shortPassing: 0.07,
    attPosition: 0.08,
    offTheBall: 0.08,
    oneOnOne: 0.07,
    positioning: 0.06,
    decisions: 0.05,
  },
  CDM: {
    positioning: 0.11,
    interceptions: 0.11,
    tackling: 0.09,
    defensiveAwareness: 0.1,
    anticipation: 0.08,
    shortPassing: 0.09,
    longPassing: 0.07,
    ballControl: 0.07,
    vision: 0.06,
    decisions: 0.09,
    composure: 0.06,
    stamina: 0.07,
  },
  CM: {
    firstTouch: 0.08,
    ballControl: 0.09,
    shortPassing: 0.11,
    longPassing: 0.08,
    vision: 0.1,
    decisions: 0.1,
    awareness: 0.09,
    composure: 0.08,
    offTheBall: 0.06,
    interceptions: 0.06,
    stamina: 0.08,
    teamwork: 0.07,
  },
  CAM: {
    firstTouch: 0.09,
    ballControl: 0.1,
    dribbling: 0.1,
    shortPassing: 0.08,
    throughPassing: 0.09,
    vision: 0.11,
    creativity: 0.11,
    decisions: 0.08,
    attPosition: 0.07,
    offTheBall: 0.06,
    finishing: 0.05,
    composure: 0.06,
  },
  'RW-LW': {
    acceleration: 0.1,
    sprintSpeed: 0.09,
    agility: 0.08,
    dribbling: 0.12,
    ballControl: 0.09,
    firstTouch: 0.07,
    oneOnOne: 0.11,
    crossing: 0.07,
    chanceCreation: 0.07,
    offTheBall: 0.07,
    finishing: 0.06,
    decisions: 0.07,
  },
  CF: {
    firstTouch: 0.09,
    ballControl: 0.08,
    attPosition: 0.1,
    offTheBall: 0.09,
    linkUpPlay: 0.09,
    finishing: 0.11,
    shooting: 0.08,
    dribbling: 0.07,
    shortPassing: 0.07,
    strength: 0.06,
    decisions: 0.08,
    composure: 0.08,
  },
  ST: {
    finishing: 0.13,
    attPosition: 0.11,
    offTheBall: 0.09,
    firstTouch: 0.08,
    shotAccuracy: 0.09,
    oneOnOneFinishing: 0.1,
    aerialAbility: 0.07,
    strength: 0.06,
    acceleration: 0.07,
    anticipation: 0.07,
    decisions: 0.06,
    composure: 0.07,
  },
};

export interface IMatchEventInput {
  eventId: string;
  count: number;
}

export interface IMatchPerformanceResult {
  overallRating: number;
  positivePoints: number;
  negativePoints: number;
  netContribution: number;
  interpretation: string;
  categoryAdjustedScores: Record<CategoryKey, number>;
  categoryRatings: Record<CategoryKey, number>;
}

export const normalizePositionKey = (pos: string): PositionKey => {
  if (!pos) return 'CM';
  const clean = pos.trim().toUpperCase();
  if (clean in POSITION_ATTRIBUTE_COEFFICIENTS) {
    return clean as PositionKey;
  }
  if (clean === 'RB/LB' || clean === 'LB/RB') return 'RB-LB';
  if (clean === 'RWB/LWB' || clean === 'LWB/RWB') return 'RWB-LWB';
  if (clean === 'RW/LW' || clean === 'LW/RW') return 'RW-LW';

  // 1. Goalkeeping
  if (clean.includes('GK') || clean.includes('GOAL') || clean.includes('KEEP')) {
    return 'GK';
  }

  // 2. Wing Backs (must check before Fullbacks & Wingers)
  if (
    clean.includes('RWB') ||
    clean.includes('LWB') ||
    clean.includes('WING BACK') ||
    clean.includes('WINGBACK')
  ) {
    return 'RWB-LWB';
  }

  // 3. Full Backs (must check before CB)
  if (
    clean.includes('RB') ||
    clean.includes('LB') ||
    clean.includes('RIGHT BACK') ||
    clean.includes('LEFT BACK') ||
    clean.includes('FULL BACK') ||
    clean.includes('FULLBACK')
  ) {
    return 'RB-LB';
  }

  // 4. Center Back
  if (
    clean.includes('CB') ||
    clean.includes('CENTER BACK') ||
    clean.includes('CENTRE BACK') ||
    clean.includes('DEFEND')
  ) {
    return 'CB';
  }

  // 5. Attacking Midfielder (must check before Attack / Forward / CM)
  if (
    clean.includes('CAM') ||
    clean.includes('ATTACKING MID') ||
    clean.includes('ATTACKING-MID') ||
    clean.includes('PLAYMAKER')
  ) {
    return 'CAM';
  }

  // 6. Defensive Midfielder (must check before CM)
  if (clean.includes('CDM') || clean.includes('DEFENSIVE MID') || clean.includes('HOLDING MID')) {
    return 'CDM';
  }

  // 7. Wingers
  if (
    clean.includes('RW') ||
    clean.includes('LW') ||
    clean.includes('RIGHT WING') ||
    clean.includes('LEFT WING') ||
    clean.includes('WINGER') ||
    clean.includes('WING')
  ) {
    return 'RW-LW';
  }

  // 8. Centre Forward
  if (
    clean === 'CF' ||
    clean.includes('CENTRE FORWARD') ||
    clean.includes('CENTER FORWARD') ||
    clean.includes('SECOND STRIKER') ||
    clean.includes('SHADOW STRIKER')
  ) {
    return 'CF';
  }

  // 9. Strikers & Attackers
  if (
    clean.includes('ST') ||
    clean.includes('FORWARD') ||
    clean.includes('STRIKER') ||
    clean.includes('ATTACK')
  ) {
    return 'ST';
  }

  // 10. Central Midfielder
  if (clean.includes('CM') || clean.includes('MID')) {
    return 'CM';
  }

  return 'CM';
};

/**
 * Short FIFA card badge position abbreviation (max 3-4 uppercase characters)
 * e.g. "Central Attacking Midfielder" -> "CAM", "Forward" -> "FWD", "Goalkeeper (GK)" -> "GK"
 */
export const formatCardPosition = (pos?: string): string => {
  if (!pos) return 'FWD';
  const clean = pos.trim().toUpperCase();
  if (
    [
      'ST',
      'CF',
      'RW',
      'LW',
      'CAM',
      'CM',
      'CDM',
      'CB',
      'LB',
      'RB',
      'LWB',
      'RWB',
      'GK',
      'FWD',
      'MID',
      'DEF',
    ].includes(clean)
  ) {
    return clean;
  }
  const parenMatch = clean.match(/\(([A-Z]{2,4})\)/);
  if (parenMatch) return parenMatch[1];

  if (clean.includes('GK') || clean.includes('GOAL')) return 'GK';
  if (clean.includes('ATTACKING MID') || clean.includes('CAM')) return 'CAM';
  if (clean.includes('DEFENSIVE MID') || clean.includes('CDM')) return 'CDM';
  if (clean.includes('CENTRAL MID') || clean.includes('CM')) return 'CM';
  if (clean.includes('WING BACK')) {
    return clean.includes('RIGHT') || clean.includes('RWB') ? 'RWB' : 'LWB';
  }
  if (clean.includes('FULL BACK') || clean.includes('BACK')) {
    if (clean.includes('CENTER') || clean.includes('CENTRE') || clean.includes('CB')) return 'CB';
    if (clean.includes('RIGHT') || clean.includes('RB')) return 'RB';
    if (clean.includes('LEFT') || clean.includes('LB')) return 'LB';
    return 'CB';
  }
  if (clean.includes('WINGER') || clean.includes('WING')) {
    return clean.includes('RIGHT') || clean.includes('RW') ? 'RW' : 'LW';
  }
  if (clean.includes('STRIKER') || clean.includes('ST')) return 'ST';
  if (clean.includes('FORWARD')) return 'FWD';
  if (clean.includes('MID')) return 'MID';
  if (clean.includes('DEF')) return 'DEF';

  return clean.slice(0, 4);
};

/**
 * Calculates Position Overall Rating (0-100) based on position weighted coefficients
 */
export const calculatePositionRating = (
  position: string,
  attributes: Record<string, number>,
): number => {
  const normPos = normalizePositionKey(position);

  const coefficients = POSITION_ATTRIBUTE_COEFFICIENTS[normPos];
  let totalScore = 0;
  let totalWeight = 0;

  for (const [attr, weight] of Object.entries(coefficients)) {
    let val = attributes[attr];
    if (val === undefined) {
      if (attr === 'attPosition') val = attributes.attackingPositioning ?? attributes.attPosition;
      else if (attr === 'decisions') val = attributes.decisionMaking ?? attributes.decisions;
      else if (attr === 'composure') val = attributes.composition ?? attributes.composure;
      else if (attr === 'tackling') val = attributes.standingTackle ?? attributes.tackling;
      else if (attr === 'interceptions') val = attributes.interception ?? attributes.interceptions;
      else if (attr === 'aerialAbility' || attr === 'aerialDuels')
        val = attributes.aerialDuels ?? attributes.heading ?? attributes.aerialAbility;
      else if (attr === 'oneOnOne' || attr === 'oneOnOneDefending')
        val =
          attributes.oneOnOneDefending ??
          attributes.standingTackle ??
          attributes.tackling ??
          attributes.oneOnOne;
      else if (attr === 'defensivePositioning')
        val = attributes.positioning ?? attributes.defensivePositioning;
      else if (attr === 'defensiveAwareness')
        val = attributes.defensiveAwareness ?? attributes.awareness;
      else if (attr === 'shortPassing' || attr === 'passing')
        val = attributes.shortPassing ?? attributes.passing;
      else if (attr === 'oneOnOneFinishing')
        val = attributes.finishing ?? attributes.oneOnOneFinishing;
      else if (attr === 'shotAccuracy')
        val =
          attributes.shooting ??
          attributes.finishing ??
          attributes.shotPower ??
          attributes.shotAccuracy;
      else if (attr === 'offTheBall')
        val = attributes.attPosition ?? attributes.positioning ?? attributes.offTheBall;
      else if (attr === 'throughPassing')
        val = attributes.vision ?? attributes.shortPassing ?? attributes.throughPassing;
      else if (attr === 'oneOnOneAttacking')
        val = attributes.dribbling ?? attributes.oneOnOneAttacking;
      else if (attr === 'chanceCreation')
        val =
          attributes.vision ??
          attributes.shortPassing ??
          attributes.crossing ??
          attributes.chanceCreation;
      else if (attr === 'linkUpPlay')
        val = attributes.teamwork ?? attributes.shortPassing ?? attributes.linkUpPlay;
      else val = 50;
    }
    val = val ?? 50;
    totalScore += val * weight;
    totalWeight += weight;
  }

  const result = totalWeight > 0 ? totalScore / totalWeight : 50;
  return Math.min(100, Math.max(0, Math.round(result)));
};

/**
 * Interpretation scale helper
 */
export const getInterpretationScore = (score: number): string => {
  if (score >= 90) return 'Outstanding';
  if (score >= 85) return 'Excellent';
  if (score >= 80) return 'Very Good';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Developing / Average';
  return 'Needs Development';
};

/**
 * Calculates Match Performance Score (0-100) using 90-minute normalized formula and baseline 50
 */
export const calculateMatchPerformance = (
  position: string,
  minutesPlayed: number,
  events: IMatchEventInput[],
): IMatchPerformanceResult => {
  const normPos = normalizePositionKey(position);

  const validMinutes = Math.max(1, minutesPlayed);
  const timeFactor = 90 / validMinutes;
  const multipliers = POSITION_CATEGORY_MULTIPLIERS[normPos];

  let positivePoints = 0;
  let negativePoints = 0;

  const categoryAdjustedScores: Record<CategoryKey, number> = {
    Attack: 0,
    Passing: 0,
    Possession: 0,
    Defending: 0,
    Discipline: 0,
    Goalkeeping: 0,
  };

  for (const item of events) {
    const eventDef = MATCH_EVENTS[item.eventId];
    if (!eventDef || item.count <= 0) continue;

    const catMultiplier = multipliers[eventDef.category] ?? 1.0;
    const rawContribution = item.count * eventDef.basePoints * catMultiplier;
    const adjustedContribution = rawContribution * timeFactor;

    if (adjustedContribution >= 0) {
      positivePoints += adjustedContribution;
    } else {
      negativePoints += adjustedContribution; // Note: negativePoints is negative number
    }

    categoryAdjustedScores[eventDef.category] += adjustedContribution;
  }

  const categoryRatings: Record<CategoryKey, number> = {
    Attack: 50,
    Passing: 50,
    Possession: 50,
    Defending: 50,
    Discipline: 50,
    Goalkeeping: 50,
  };

  // Round category scores and calculate 0-100 category ratings (50 + adjusted)
  for (const cat in categoryAdjustedScores) {
    const key = cat as CategoryKey;
    categoryAdjustedScores[key] = Math.round(categoryAdjustedScores[key] * 100) / 100;
    categoryRatings[key] = Math.min(100, Math.max(0, Math.round(50 + categoryAdjustedScores[key])));
  }

  const netContribution = positivePoints + negativePoints;
  const rawOverall = 50 + netContribution;
  const overallRating = Math.min(100, Math.max(0, Math.round(rawOverall)));

  return {
    overallRating,
    positivePoints: Math.round(positivePoints * 100) / 100,
    negativePoints: Math.round(negativePoints * 100) / 100,
    netContribution: Math.round(netContribution * 100) / 100,
    interpretation: getInterpretationScore(overallRating),
    categoryAdjustedScores,
    categoryRatings,
  };
};

export const formatAttributeLabel = (key: string): string => {
  const map: Record<string, string> = {
    finishing: 'Finishing',
    attPosition: 'Att. Positioning',
    offTheBall: 'Off the Ball',
    firstTouch: 'First Touch',
    shotAccuracy: 'Shot Accuracy',
    oneOnOneFinishing: '1v1 Finishing',
    aerialAbility: 'Aerial Ability',
    strength: 'Strength',
    acceleration: 'Acceleration',
    anticipation: 'Anticipation',
    decisions: 'Decisions',
    composure: 'Composure',
    positioning: 'Positioning',
    marking: 'Marking',
    tackling: 'Tackling',
    interceptions: 'Interceptions',
    defensiveAwareness: 'Def. Awareness',
    shortPassing: 'Short Passing',
    ballControl: 'Ball Control',
    sprintSpeed: 'Sprint Speed',
    stamina: 'Stamina',
    crossing: 'Crossing',
    dribbling: 'Dribbling',
    longPassing: 'Long Passing',
    vision: 'Vision',
    awareness: 'Awareness',
    teamwork: 'Teamwork',
    throughPassing: 'Through Passing',
    creativity: 'Creativity',
    chanceCreation: 'Chance Creation',
    linkUpPlay: 'Link-up Play',
    reflexes: 'Reflexes',
    handling: 'Handling',
    oneOnOne: '1v1 Defending',
    crossClaiming: 'Cross Claiming',
    shotStopping: 'Shot Stopping',
    footwork: 'Footwork',
    distribution: 'Distribution',
    communication: 'Communication',
    standingTackle: 'Standing Tackle',
    slidingTackle: 'Sliding Tackle',
    aerialDuels: 'Aerial Duels',
    clearance: 'Clearance',
    pressing: 'Pressing',
    shotPower: 'Shot Power',
    curve: 'Curve',
    freeKick: 'Free Kick',
    penalties: 'Penalties',
    volleys: 'Volleys',
    headingAccuracy: 'Heading Accuracy',
    weakFoot: 'Weak Foot',
    aggression: 'Aggression',
    concentration: 'Concentration',
    consistency: 'Consistency',
    leadership: 'Leadership',
    bravery: 'Bravery',
    determination: 'Determination',
    heading: 'Heading',
    influence: 'Influence',
    balance: 'Balance',
    agility: 'Agility',
    reactions: 'Reactions',
    jumping: 'Jumping',
  };
  return map[key] || key.charAt(0).toUpperCase() + key.slice(1);
};

export const formatMarketValue = (
  val?: number | null,
  currency = '$',
): { formatted: string; short: string } => {
  if (val === undefined || val === null || isNaN(Number(val))) {
    return { formatted: `${currency}0`, short: '0' };
  }
  const num = Number(val);
  if (num === 0) {
    return { formatted: `${currency}0`, short: '0' };
  }

  let short = `${num}`;
  const abs = Math.abs(num);

  if (abs >= 1_000_000_000) {
    short = `${(num / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  } else if (abs >= 1_000_000) {
    short = `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  } else if (abs >= 1_000) {
    short = `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }

  return {
    formatted: `${currency}${short}`,
    short,
  };
};

export const calculateMetricGrade = (score: number | string): 'EXCELLENT' | 'GOOD' | 'AVERAGE' => {
  const num = Number(score);
  if (isNaN(num)) return 'GOOD';
  if (num >= 80) return 'EXCELLENT';
  if (num >= 60) return 'GOOD';
  return 'AVERAGE';
};

/**
 * Accurately calculate age from date of birth, respecting month and day boundaries
 */
export const calculateAgeFromDob = (dob: Date | string | null | undefined): number => {
  if (!dob) return 18;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return 18;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return Math.max(0, age);
};
