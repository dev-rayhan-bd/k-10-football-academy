import { z } from 'zod';

export const createProductZodSchema = z.object({
  body: z.object({
    productName: z.string().min(2).optional(),
    title: z.string().min(2).optional(),
    category: z.string().min(1, 'Category is required'),
    sku: z.string().optional(),
    regularPrice: z.coerce.number().min(0).optional(),
    price: z.coerce.number().min(0).optional(),
    salePrice: z.coerce.number().min(0).nullable().optional(),
    productDescription: z.string().min(2).optional(),
    description: z.string().min(2).optional(),
    availableSizes: z.union([z.array(z.string()), z.string()]).optional(),
    availableColors: z.union([z.array(z.string()), z.string()]).optional(),
    stockQuantity: z.coerce.number().min(0).default(0),
    minStockLevel: z.coerce.number().min(0).optional(),
    maxOrderQuantity: z.coerce.number().min(1).optional(),
    productImage: z.string().optional(),
    image: z.string().optional(),
    images: z.union([z.array(z.string()), z.string()]).optional(),
    isActive: z.union([z.boolean(), z.string()]).optional(),
    isAvailable: z.union([z.boolean(), z.string()]).optional(),
    isFeatured: z.union([z.boolean(), z.string()]).optional(),
  }),
});

export const updateProductZodSchema = z.object({
  body: z.object({
    productName: z.string().min(2).optional(),
    title: z.string().min(2).optional(),
    category: z.string().min(1).optional(),
    sku: z.string().optional(),
    regularPrice: z.coerce.number().min(0).optional(),
    price: z.coerce.number().min(0).optional(),
    salePrice: z.coerce.number().min(0).nullable().optional(),
    productDescription: z.string().min(2).optional(),
    description: z.string().min(2).optional(),
    availableSizes: z.union([z.array(z.string()), z.string()]).optional(),
    availableColors: z.union([z.array(z.string()), z.string()]).optional(),
    stockQuantity: z.coerce.number().min(0).optional(),
    minStockLevel: z.coerce.number().min(0).optional(),
    maxOrderQuantity: z.coerce.number().min(1).optional(),
    productImage: z.string().optional(),
    image: z.string().optional(),
    images: z.union([z.array(z.string()), z.string()]).optional(),
    isActive: z.union([z.boolean(), z.string()]).optional(),
    isAvailable: z.union([z.boolean(), z.string()]).optional(),
    isFeatured: z.union([z.boolean(), z.string()]).optional(),
  }),
});

export const createOrderZodSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1, 'Product ID is required'),
          quantity: z.number().int().min(1, 'Quantity must be at least 1'),
          price: z.number().positive().optional(),
          size: z.string().optional(),
          color: z.string().optional(),
        }),
      )
      .optional(),
    totalAmount: z.number().positive().optional(),
    shippingAddress: z.string().optional(),
    customerEmail: z.string().email().optional(),
  }),
});

export const addToCartZodSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'Product ID is required'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1').default(1),
    size: z.string().optional(),
    color: z.string().optional(),
  }),
});

export const updateCartItemZodSchema = z.object({
  body: z.object({
    quantity: z.number().int().min(0, 'Quantity cannot be negative').optional(),
    size: z.string().optional(),
    color: z.string().optional(),
  }),
});
