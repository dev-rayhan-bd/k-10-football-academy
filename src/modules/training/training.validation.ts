import { z } from 'zod';

export const createTrainingSessionZodSchema = z.object({
  body: z.object({
    academyId: z.string().min(1),
    teamId: z.string().optional(),
    coachId: z.string().optional(),
    sessionTitle: z.string().min(2),
    sessionDate: z.string().or(z.date()),
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    locationField: z.string().min(2),
  }),
});

export const updateAttendanceZodSchema = z.object({
  body: z.object({
    childPlayerId: z.string().min(1),
    rsvpStatus: z.enum(['PENDING', 'CONFIRMED', 'DECLINED']).optional(),
    attendanceStatus: z.enum(['PRESENT', 'ABSENT', 'EXCUSED']).optional(),
  }),
});
