import { Document, Types } from 'mongoose';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';
export type OrderStatus = 'PROCESSING' | 'SHIPPED' | 'DELIVERED';
export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK';

export interface IShopProduct {
  academyId?: Types.ObjectId;
  userId?: Types.ObjectId;
  productName: string;
  slug: string;
  category: string;
  sku: string;
  regularPrice: number;
  salePrice?: number | null;
  productDescription: string;
  availableSizes?: string[];
  availableColors?: string[];
  stockQuantity: number;
  minStockLevel?: number;
  maxOrderQuantity?: number;
  stockStatus: StockStatus;
  productImage?: string;
  images?: string[];
  isActive: boolean;
  isFeatured: boolean;

  // Backwards compatibility aliases
  title?: string;
  price?: number;
  description?: string;
  image?: string;
  isAvailable?: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface IShopProductDocument extends IShopProduct, Document {}

export interface IShopOrderItem {
  productId: Types.ObjectId;
  quantity: number;
  price: number;
  size?: string;
  color?: string;
}

export interface IShopOrder {
  userId: Types.ObjectId;
  orderNumber: string;
  items: IShopOrderItem[];
  totalAmount: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IShopOrderDocument extends IShopOrder, Document {}
