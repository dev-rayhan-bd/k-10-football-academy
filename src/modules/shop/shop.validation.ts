import { z } from 'zod';

export const createProductZodSchema = z.object({
  body: z.object({
    title: z.string().min(2),
    category: z.enum(['JERSEYS', 'KITS', 'ACCESSORIES']),
    price: z.number().positive(),
    image: z.string().optional(),
    availableSizes: z.array(z.string()).optional(),
    stockQuantity: z.number().min(0),
  }),
});

export const createOrderZodSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().min(1),
          price: z.number().positive(),
          size: z.string().optional(),
        }),
      )
      .min(1, 'Order must contain at least 1 item'),
    totalAmount: z.number().positive(),
  }),
});
