import { AppError } from '@/utils/AppError';
import { IShopProduct, IShopOrder } from './shop.interface';
import { ShopProduct, ShopOrder } from './shop.model';

export class ShopService {
  async createProduct(payload: Partial<IShopProduct>) {
    return ShopProduct.create(payload);
  }

  async getAllProducts(filter: Record<string, unknown> = {}) {
    return ShopProduct.find(filter);
  }

  async getProductById(id: string) {
    const product = await ShopProduct.findById(id);
    if (!product) {
      throw new AppError(404, 'Product not found');
    }
    return product;
  }

  async createOrder(userId: string, payload: Partial<IShopOrder>) {
    const count = await ShopOrder.countDocuments();
    const orderNumber = `ORD-${new Date().getFullYear()}-${(count + 1).toString().padStart(5, '0')}`;
    return ShopOrder.create({
      ...payload,
      userId,
      orderNumber,
    });
  }

  async getUserOrders(userId: string) {
    return ShopOrder.find({ userId }).populate('items.productId');
  }
}

export const shopService = new ShopService();
