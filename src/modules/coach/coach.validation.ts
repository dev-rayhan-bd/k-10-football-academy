import { z } from 'zod';

export const createCoachProfileZodSchema = z.object({
  body: z.object({
    userId: z.string().min(1, 'User ID is required'),
    coachType: z.enum(['INDIVIDUAL_COACH', 'CLUB_COACH']).optional(),
    fullName: z.string().min(2),
    title: z.string().min(2).optional(),
    yearsExperience: z.number().min(0).optional(),
    licenseStatus: z.string().optional(),
    speciality: z.string().optional(),
    additionalNotes: z.string().optional(),
  }),
});

export const updateCoachProfileZodSchema = z.object({
  body: z
    .object({
      data: z.string().optional(),
      coachType: z.enum(['INDIVIDUAL_COACH', 'CLUB_COACH']).optional(),
      fullName: z.string().optional(),
      title: z.string().optional(),
      yearsExperience: z.number().optional(),
      overallRatingScore: z.number().optional(),
      licenseStatus: z.string().optional(),
      speciality: z.string().optional(),
      status: z.enum(['AVAILABLE', 'CONTRACTED', 'ACTIVE', 'INACTIVE']).optional(),
      additionalNotes: z.string().optional(),

      // Personal info & Hero
      dateOfBirth: z.any().optional(),
      age: z.any().optional(),
      birthCountry: z.string().optional(),
      birthCountryFlag: z.string().optional(),
      dualNationality: z.string().optional(),
      dualNationalityFlag: z.string().optional(),
      currentClub: z.string().optional(),
      clubLogo: z.string().optional(),
      website: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      location: z.string().optional(),
      validationStatus: z.string().optional(),

      // Nested objects
      personalInformation: z.any().optional(),
      contact: z.any().optional(),
      seasonStats: z.any().optional(),
      transferStatus: z.any().optional(),

      // Sub-arrays
      accomplishments: z.any().optional(),
      coachStyles: z.any().optional(),
      languages: z.any().optional(),
      majorTrophies: z.any().optional(),
      cupsPlayed: z.any().optional(),
      keySkills: z.any().optional(),
      clubHistory: z.any().optional(),
      addClub: z.any().optional(),
      associations: z.any().optional(),
      courses: z.any().optional(),
      formations: z.any().optional(),
      documents: z.any().optional(),
    })
    .passthrough(),
});

export const createCoachTestimonialZodSchema = z.object({
  body: z.object({
    authorName: z.string().min(2),
    authorRole: z.string().min(2),
    authorAvatar: z.string().optional(),
    rating: z.number().min(1).max(5),
    comment: z.string().min(3),
  }),
});

export const updateCoachTestimonialZodSchema = z.object({
  body: z.object({
    authorName: z.string().optional(),
    authorRole: z.string().optional(),
    authorAvatar: z.string().optional(),
    rating: z.number().min(1).max(5).optional(),
    comment: z.string().optional(),
  }),
});

export const submitPlayerEvaluationZodSchema = z.object({
  body: z
    .object({
      playerId: z.string().optional(),
      evaluationId: z.string().optional(),
      overallRating: z.number().min(0).max(100).optional(),
      technicalScore: z.number().min(0).max(100).optional(),
      physicalScore: z.number().min(0).max(100).optional(),
      mentalScore: z.number().min(0).max(100).optional(),
      techniques: z.record(z.any()).optional(),
      characteristics: z.record(z.any()).optional(),
      physical: z.record(z.any()).optional(),
      notes: z.string().optional(),
      coachFeedback: z.string().optional(),
    })
    .passthrough(),
});

export const coachAttendanceTickZodSchema = z.object({
  body: z
    .object({
      playerId: z.string({ required_error: 'Player ID is required' }),
      sessionId: z.string().optional(),
      teamId: z.string().optional(),
      date: z.string().optional(),
      isIn: z.boolean().optional(),
      status: z.enum(['PRESENT', 'LATE', 'ABSENT', 'UNMARKED', 'EXCUSED']).optional(),
      time: z.string().optional(),
      notes: z.string().optional(),
    })
    .passthrough(),
});

export const coachAttendanceBulkZodSchema = z.object({
  body: z
    .object({
      sessionId: z.string().optional(),
      teamId: z.string().optional(),
      date: z.string().optional(),
      markAll: z.enum(['PRESENT', 'ABSENT', 'CLEAR', 'UNMARKED']).optional(),
      attendances: z
        .array(
          z.object({
            playerId: z.string({ required_error: 'Player ID is required' }),
            isIn: z.boolean().optional(),
            status: z.enum(['PRESENT', 'LATE', 'ABSENT', 'UNMARKED', 'EXCUSED']).optional(),
            notes: z.string().optional(),
          }),
        )
        .optional(),
    })
    .passthrough(),
});
