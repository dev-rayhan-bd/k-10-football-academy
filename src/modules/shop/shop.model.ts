import { Schema, model } from 'mongoose';
import { IShopProductDocument, IShopOrderDocument } from './shop.interface';

const ShopProductSchema = new Schema<IShopProductDocument>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'AcademyProfile', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    productName: { type: String, required: true, trim: true, index: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    sku: { type: String, trim: true, index: true },
    regularPrice: { type: Number, required: true, min: 0, index: true },
    salePrice: { type: Number, default: null, min: 0, index: true },
    productDescription: { type: String, required: true, trim: true },
    availableSizes: [{ type: String, trim: true }],
    availableColors: [{ type: String, trim: true }],
    stockQuantity: { type: Number, required: true, default: 0, min: 0, index: true },
    minStockLevel: { type: Number, default: 0, min: 0 },
    maxOrderQuantity: { type: Number, default: 10, min: 1 },
    stockStatus: {
      type: String,
      enum: ['IN_STOCK', 'OUT_OF_STOCK'],
      default: 'IN_STOCK',
      index: true,
    },
    productImage: { type: String },
    images: [{ type: String }],
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },

    // Backwards compatibility fields
    title: { type: String },
    price: { type: Number },
    description: { type: String },
    image: { type: String },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ShopProductSchema.pre('validate', function (next) {
  if (this.productName && !this.title) {
    this.title = this.productName;
  } else if (this.title && !this.productName) {
    this.productName = this.title;
  }

  if (this.regularPrice !== undefined && this.price === undefined) {
    this.price = this.regularPrice;
  } else if (this.price !== undefined && this.regularPrice === undefined) {
    this.regularPrice = this.price;
  }

  if (this.productDescription && !this.description) {
    this.description = this.productDescription;
  } else if (this.description && !this.productDescription) {
    this.productDescription = this.description;
  }

  if (this.productImage && !this.image) {
    this.image = this.productImage;
  } else if (this.image && !this.productImage) {
    this.productImage = this.image;
  }

  if (this.isActive !== undefined && this.isAvailable === undefined) {
    this.isAvailable = this.isActive;
  } else if (this.isAvailable !== undefined && this.isActive === undefined) {
    this.isActive = this.isAvailable;
  }

  // Auto-sync stockStatus
  if (typeof this.stockQuantity === 'number') {
    this.stockStatus = this.stockQuantity > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
  }

  next();
});

ShopProductSchema.index({
  productName: 'text',
  productDescription: 'text',
  sku: 'text',
  category: 'text',
});
ShopProductSchema.index({ category: 1, regularPrice: 1 });
ShopProductSchema.index({ stockStatus: 1, isActive: 1 });

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
