import { z } from 'zod';

export const createInvoiceZodSchema = z.object({
  body: z.object({
    parentId: z.string().optional(),
    childPlayerId: z.string().min(1),
    academyId: z.string().min(1),
    title: z.string().min(2),
    amount: z.number().positive('Amount must be positive'),
    dueDate: z.string().or(z.date()),
  }),
});

export const updateInvoiceStatusZodSchema = z.object({
  body: z.object({
    status: z.enum(['UNPAID', 'PAID', 'OVERDUE']),
  }),
});
