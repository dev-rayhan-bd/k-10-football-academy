import { z } from 'zod';

export const createTrainingSessionZodSchema = z.object({
  body: z
    .object({
      sessionName: z.string({ required_error: 'Session name is required' }).min(2),
      teamId: z.string({ required_error: 'Team is required' }).min(1),
      coachId: z.string().optional(),
      sessionDate: z.string({ required_error: 'Session date is required' }).or(z.date()),
      startTime: z.string({ required_error: 'Start time is required' }).min(1),
      endTime: z.string({ required_error: 'End time is required' }).min(1),
      trainingLocation: z.string().optional().default('Main Field A'),
      locationField: z.string().optional(),
      sessionType: z.string().optional().default('Technical'),
      focusArea: z.string().optional().default('General Practice'),
      maxParticipants: z.number().or(z.string().regex(/^\d+$/).transform(Number)).optional(),
      sessionDescription: z.string().optional(),
      requiredEquipment: z.string().optional(),
      additionalNotes: z.string().optional(),
    })
    .passthrough(),
});

export const updateTrainingSessionZodSchema = z.object({
  body: z
    .object({
      sessionName: z.string().min(2).optional(),
      teamId: z.string().optional(),
      coachId: z.string().optional(),
      sessionDate: z.string().or(z.date()).optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      trainingLocation: z.string().optional(),
      locationField: z.string().optional(),
      sessionType: z.string().optional(),
      focusArea: z.string().optional(),
      maxParticipants: z.number().or(z.string().regex(/^\d+$/).transform(Number)).optional(),
      sessionDescription: z.string().optional(),
      requiredEquipment: z.string().optional(),
      additionalNotes: z.string().optional(),
    })
    .passthrough(),
});

export const saveAttendanceZodSchema = z.object({
  body: z
    .object({
      attendances: z
        .array(
          z.object({
            playerId: z.string({ required_error: 'Player ID is required' }),
            status: z.enum(['PRESENT', 'LATE', 'ABSENT', 'UNMARKED', 'EXCUSED']),
            notes: z.string().optional(),
          }),
        )
        .optional(),
      markAll: z.enum(['PRESENT', 'ABSENT', 'CLEAR', 'UNMARKED']).optional(),
      childPlayerId: z.string().optional(),
      attendanceStatus: z.enum(['PRESENT', 'LATE', 'ABSENT', 'UNMARKED', 'EXCUSED']).optional(),
      status: z.enum(['PRESENT', 'LATE', 'ABSENT', 'UNMARKED', 'EXCUSED']).optional(),
    })
    .passthrough(),
});

export const updateAttendanceZodSchema = saveAttendanceZodSchema;
