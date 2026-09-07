import { Document, Types } from 'mongoose';

export type ProductCategory = 'JERSEYS' | 'KITS' | 'ACCESSORIES';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';
export type OrderStatus = 'PROCESSING' | 'SHIPPED' | 'DELIVERED';

export interface IShopProduct {
  academyId?: Types.ObjectId;
  title: string;
  category: ProductCategory;
  price: number;
  image?: string;
  availableSizes?: string[];
  stockQuantity: number;
  isAvailable: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IShopProductDocument extends IShopProduct, Document {}

export interface IShopOrderItem {
  productId: Types.ObjectId;
  quantity: number;
  price: number;
  size?: string;
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
