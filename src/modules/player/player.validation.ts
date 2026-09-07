import { z } from 'zod';

export const createPlayerProfileZodSchema = z.object({
  body: z.object({
    userId: z.string().min(1, 'User ID is required'),
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
  }),
});

export const updatePlayerProfileZodSchema = z.object({
  body: z.object({
    fullName: z.string().optional(),
    position: z.string().optional(),
    secondaryPositions: z.array(z.string()).optional(),
    age: z.number().optional(),
    dateOfBirth: z.string().or(z.date()).optional(),
    country: z.string().optional(),
    dualNationality: z.string().optional(),
    currentClub: z.string().optional(),
    contractUntil: z.string().or(z.date()).optional(),
    marketValue: z.number().optional(),
    height: z.number().optional(),
    weight: z.number().optional(),
    preferredFoot: z.enum(['RIGHT', 'LEFT', 'BOTH']).optional(),
  }),
});

export const updatePlayerAttributesZodSchema = z.object({
  body: z.object({
    ballControl: z.number().min(1).max(99).optional(),
    dribbling: z.number().min(1).max(99).optional(),
    shortPassing: z.number().min(1).max(99).optional(),
    longPassing: z.number().min(1).max(99).optional(),
    shooting: z.number().min(1).max(99).optional(),
    finishing: z.number().min(1).max(99).optional(),
    acceleration: z.number().min(1).max(99).optional(),
    sprintSpeed: z.number().min(1).max(99).optional(),
    stamina: z.number().min(1).max(99).optional(),
    strength: z.number().min(1).max(99).optional(),
  }),
});

export const createMatchRecordZodSchema = z.object({
  body: z.object({
    playerId: z.string().min(1),
    matchDate: z.string().or(z.date()),
    leagueType: z.string().min(1),
    homeTeam: z.string().min(1),
    awayTeam: z.string().min(1),
    homeScore: z.number().min(0),
    awayScore: z.number().min(0),
    result: z.enum(['W', 'D', 'L']),
    location: z.string().optional(),
    playerRating: z.number().min(1).max(10).optional(),
    goals: z.number().optional(),
    assists: z.number().optional(),
    passes: z.number().optional(),
    minutesPlayed: z.number().optional(),
  }),
});
