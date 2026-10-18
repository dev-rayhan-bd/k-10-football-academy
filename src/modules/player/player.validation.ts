import { z } from 'zod';
export const createPlayerProfileZodSchema = z.object({
  body: z.object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    position: z.string().min(1, 'Primary position is required'),
    secondaryPositions: z.array(z.string()).optional(),
    age: z.number().min(5).max(50),
    dateOfBirth: z.string().or(z.date()),
    country: z.string().min(2),
    dualNationality: z.string().optional(),
    currentClub: z.string().optional(),
    contractUntil: z.string().or(z.date()).optional(),
    marketValue: z.number().optional(),
    height: z.number().optional(),
    weight: z.number().optional(),
    preferredFoot: z.enum(['RIGHT', 'LEFT', 'BOTH']).optional(),
    profileViews: z.number().optional(),
    totalLikes: z.number().optional(),
  }),
});

export const updatePlayerProfileZodSchema = z.object({
  body: z.object({
    fullName: z.string().optional(),
    position: z.string().optional(),
    secondaryPositions: z.union([z.array(z.string()), z.string()]).optional(),
    age: z.union([z.number(), z.string()]).optional(),
    dateOfBirth: z.string().or(z.date()).optional(),
    country: z.string().optional(),
    dualNationality: z.string().optional(),
    currentClub: z.string().optional(),
    contractUntil: z.string().or(z.date()).optional(),
    marketValue: z.union([z.number(), z.string()]).optional(),
    height: z.union([z.number(), z.string()]).optional(),
    weight: z.union([z.number(), z.string()]).optional(),
    preferredFoot: z.enum(['RIGHT', 'LEFT', 'BOTH']).optional(),
    rightFootDominance: z.union([z.number(), z.string()]).optional(),
    leftFootDominance: z.union([z.number(), z.string()]).optional(),
    website: z.string().optional(),
    playerStyles: z.union([z.array(z.string()), z.string()]).optional(),
    languages: z.union([z.array(z.any()), z.string()]).optional(),
    accomplishments: z.union([z.array(z.any()), z.string()]).optional(),
    clubHistory: z.union([z.array(z.any()), z.string()]).optional(),
    positionMap: z.union([z.array(z.any()), z.string()]).optional(),
    futsalMap: z.union([z.array(z.any()), z.string()]).optional(),
    transferStatus: z.union([z.record(z.any()), z.string()]).optional(),
    coachVerification: z.union([z.record(z.any()), z.string()]).optional(),
    perceptionMetrics: z.union([z.record(z.any()), z.string()]).optional(),
    visionMetrics: z.union([z.record(z.any()), z.string()]).optional(),
    profileViews: z.union([z.number(), z.string()]).optional(),
    totalLikes: z.union([z.number(), z.string()]).optional(),
  }),
});

export const updatePlayerStylesZodSchema = z.object({
  body: z.object({
    playerStyles: z
      .array(z.string())
      .max(4, 'Maximum 4 player styles can be selected simultaneously'),
  }),
});

export const updateClubHistoryZodSchema = z.object({
  body: z.object({
    clubHistory: z
      .array(
        z.object({
          clubName: z.string().min(1, 'Club name is required'),
          logoUrl: z.string().optional(),
          period: z.string().min(1, 'Period is required'),
          isCurrent: z.boolean().optional(),
        }),
      )
      .max(6, 'Maximum 6 clubs allowed in career timeline'),
  }),
});

export const addClubHistoryItemZodSchema = z.object({
  body: z.object({
    clubName: z.string().min(1, 'Club name is required'),
    logoUrl: z.string().optional(),
    period: z.string().min(1, 'Period is required'),
    isCurrent: z.boolean().optional(),
  }),
});

export const updatePitchMapZodSchema = z.object({
  body: z.object({
    positionMap: z
      .array(
        z.object({
          slot: z.string(),
          position: z.string().optional(),
          role: z.string().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
        }),
      )
      .optional(),
    futsalMap: z
      .array(
        z.object({
          slot: z.string(),
          position: z.string().optional(),
          role: z.string().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
        }),
      )
      .optional(),
  }),
});

export const updatePlayerAttributesZodSchema = z.object({
  body: z
    .object({
      ballControl: z.number().min(1).max(99).optional(),
      dribbling: z.number().min(1).max(99).optional(),
      shortPassing: z.number().min(1).max(99).optional(),
      longPassing: z.number().min(1).max(99).optional(),
      crossing: z.number().min(1).max(99).optional(),
      shooting: z.number().min(1).max(99).optional(),
      finishing: z.number().min(1).max(99).optional(),
      longShots: z.number().min(1).max(99).optional(),
      firstTouch: z.number().min(1).max(99).optional(),
      positioning: z.number().min(1).max(99).optional(),
      vision: z.number().min(1).max(99).optional(),
      anticipation: z.number().min(1).max(99).optional(),
      composure: z.number().min(1).max(99).optional(),
      teamwork: z.number().min(1).max(99).optional(),
      workRate: z.number().min(1).max(99).optional(),
      decisions: z.number().min(1).max(99).optional(),
      attPosition: z.number().min(1).max(99).optional(),
      acceleration: z.number().min(1).max(99).optional(),
      sprintSpeed: z.number().min(1).max(99).optional(),
      stamina: z.number().min(1).max(99).optional(),
      strength: z.number().min(1).max(99).optional(),
      balance: z.number().min(1).max(99).optional(),
      agility: z.number().min(1).max(99).optional(),
      reactions: z.number().min(1).max(99).optional(),
      jumping: z.number().min(1).max(99).optional(),
      aggression: z.number().min(1).max(99).optional(),
      interceptions: z.number().min(1).max(99).optional(),
      marking: z.number().min(1).max(99).optional(),
      leadership: z.number().min(1).max(99).optional(),
      bravery: z.number().min(1).max(99).optional(),
      determination: z.number().min(1).max(99).optional(),
      heading: z.number().min(1).max(99).optional(),
      influence: z.number().min(1).max(99).optional(),
      tackling: z.number().min(1).max(99).optional(),
      offTheBall: z.number().min(1).max(99).optional(),
      oneOnOneFinishing: z.number().min(1).max(99).optional(),
      aerialAbility: z.number().min(1).max(99).optional(),
      shotAccuracy: z.number().min(1).max(99).optional(),
      reflexes: z.number().min(1).max(99).optional(),
      handling: z.number().min(1).max(99).optional(),
      oneOnOne: z.number().min(1).max(99).optional(),
      crossClaiming: z.number().min(1).max(99).optional(),
      shotStopping: z.number().min(1).max(99).optional(),
      footwork: z.number().min(1).max(99).optional(),
      distribution: z.number().min(1).max(99).optional(),
      communication: z.number().min(1).max(99).optional(),
      defensiveAwareness: z.number().min(1).max(99).optional(),
      throughPassing: z.number().min(1).max(99).optional(),
      creativity: z.number().min(1).max(99).optional(),
      chanceCreation: z.number().min(1).max(99).optional(),
      linkUpPlay: z.number().min(1).max(99).optional(),
      awareness: z.number().min(1).max(99).optional(),
      composition: z.number().min(1).max(99).optional(),
      concentration: z.number().min(1).max(99).optional(),
      consistency: z.number().min(1).max(99).optional(),
      shotPower: z.number().min(1).max(99).optional(),
      curve: z.number().min(1).max(99).optional(),
      freeKick: z.number().min(1).max(99).optional(),
      penalties: z.number().min(1).max(99).optional(),
      volleys: z.number().min(1).max(99).optional(),
      headingAccuracy: z.number().min(1).max(99).optional(),
      weakFoot: z.number().min(1).max(99).optional(),
      standingTackle: z.number().min(1).max(99).optional(),
      slidingTackle: z.number().min(1).max(99).optional(),
      aerialDuels: z.number().min(1).max(99).optional(),
      clearance: z.number().min(1).max(99).optional(),
      pressing: z.number().min(1).max(99).optional(),

      // Support category-wise updates
      technical: z.record(z.any()).optional(),
      tactical: z.record(z.any()).optional(),
      physical: z.record(z.any()).optional(),
      mental: z.record(z.any()).optional(),
      attacking: z.record(z.any()).optional(),
      defending: z.record(z.any()).optional(),
      categories: z.record(z.any()).optional(),
    })
    .passthrough(),
});

export const createMatchRecordZodSchema = z.object({
  body: z.object({
    playerId: z.string().optional(),
    matchDate: z.string().or(z.date()),
    leagueType: z.string().min(1),
    homeTeam: z.string().min(1),
    awayTeam: z.string().min(1),
    homeScore: z.number().min(0),
    awayScore: z.number().min(0),
    result: z.enum(['W', 'D', 'L']),
    location: z.string().optional(),
    playerRating: z.number().min(0).max(100).optional(),
    goals: z.number().optional(),
    assists: z.number().optional(),
    passes: z.number().optional(),
    minutesPlayed: z.number().optional(),
    events: z
      .array(
        z.object({
          eventId: z.string(),
          count: z.number().min(0),
        }),
      )
      .optional(),
    plottedEventsJson: z.string().optional(),
  }),
});
