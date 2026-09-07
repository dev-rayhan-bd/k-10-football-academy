import { Schema, model } from 'mongoose';
import { IShopProductDocument, IShopOrderDocument } from './shop.interface';

const ShopProductSchema = new Schema<IShopProductDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile' },
    title: { type: String, required: true },
    category: {
      type: String,
      enum: ['JERSEYS', 'KITS', 'ACCESSORIES'],
      required: true,
    },
    price: { type: Number, required: true },
    image: { type: String },
    availableSizes: [{ type: String }],
    stockQuantity: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const ShopOrderSchema = new Schema<IShopOrderDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderNumber: { type: String, required: true, unique: true },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'ShopProduct', required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true },
        size: { type: String },
      },
    ],
    totalAmount: { type: Number, required: true },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED'],
      default: 'PENDING',
    },
    orderStatus: {
      type: String,
      enum: ['PROCESSING', 'SHIPPED', 'DELIVERED'],
      default: 'PROCESSING',
    },
  },
  { timestamps: true },
);

export const ShopProduct = model<IShopProductDocument>('ShopProduct', ShopProductSchema);
export const ShopOrder = model<IShopOrderDocument>('ShopOrder', ShopOrderSchema);
