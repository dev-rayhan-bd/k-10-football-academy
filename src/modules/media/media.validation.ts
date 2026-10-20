import { z } from 'zod';

export const createMediaZodSchema = z.object({
  body: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      mediaType: z.enum(['IMAGE', 'VIDEO']).optional(),
      url: z.string().url().optional(),
      thumbnailUrl: z.string().url().optional(),
      isPublic: z.union([z.boolean(), z.string().transform((v) => v === 'true')]).optional(),
      tags: z
        .union([
          z.array(z.string()),
          z.string().transform((v) => v.split(',').map((s) => s.trim())),
        ])
        .optional(),
      data: z.any().optional(),
    })
    .passthrough(),
});

export const updateMediaZodSchema = z.object({
  body: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      isPublic: z.union([z.boolean(), z.string().transform((v) => v === 'true')]).optional(),
      tags: z
        .union([
          z.array(z.string()),
          z.string().transform((v) => v.split(',').map((s) => s.trim())),
        ])
        .optional(),
      data: z.any().optional(),
    })
    .passthrough(),
});
