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
}

/**
 * Calculates Position Overall Rating (0-100) based on position weighted coefficients
 */
export const calculatePositionRating = (
  position: string,
  attributes: Record<string, number>,
): number => {
  const normPos = (
    position.toUpperCase() in POSITION_ATTRIBUTE_COEFFICIENTS ? position.toUpperCase() : 'CM'
  ) as PositionKey;

  const coefficients = POSITION_ATTRIBUTE_COEFFICIENTS[normPos];
  let totalScore = 0;
  let totalWeight = 0;

  for (const [attr, weight] of Object.entries(coefficients)) {
    const val = attributes[attr] ?? 50;
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
  const normPos = (
    position.toUpperCase() in POSITION_CATEGORY_MULTIPLIERS ? position.toUpperCase() : 'CM'
  ) as PositionKey;

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

  // Round category scores to 2 decimal places
  for (const cat in categoryAdjustedScores) {
    const key = cat as CategoryKey;
    categoryAdjustedScores[key] = Math.round(categoryAdjustedScores[key] * 100) / 100;
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
  };
};
