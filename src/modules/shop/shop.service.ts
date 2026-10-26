import { shopProductService } from './services/shop-product.service';
import { shopOrderService } from './services/shop-order.service';
import { shopCartService } from './services/shop-cart.service';

/**
 * Enterprise Facade: ShopService
 * Delegates directly to domain subservices while maintaining 100% identical public signatures and responses.
 */
export class ShopService {
  // --- ShopProductService Delegates ---

  async createProduct(user: any, payload: any, files?: Express.Multer.File[]) {
    return await shopProductService.createProduct(user, payload, files);
  }

  async getAllProducts(query: any = {}) {
    return await shopProductService.getAllProducts(query);
  }

  async getProductBySlugOrId(slugOrId: string) {
    return await shopProductService.getProductBySlugOrId(slugOrId);
  }

  async getProductCategories(academyId?: string) {
    return await shopProductService.getProductCategories(academyId);
  }

  async updateProduct(slugOrId: string, payload: any, files?: Express.Multer.File[]) {
    return await shopProductService.updateProduct(slugOrId, payload, files);
  }

  async deleteProduct(slugOrId: string) {
    return await shopProductService.deleteProduct(slugOrId);
  }

  // --- ShopOrderService Delegates ---

  async createOrder(userId: string, payload: any) {
    return await shopOrderService.createOrder(userId, payload);
  }

  async handleShopOrderStripeWebhook(sessionObject: any) {
    return await shopOrderService.handleShopOrderStripeWebhook(sessionObject);
  }

  async verifyOrderPayment(orderIdOrNumber: string, sessionId?: string) {
    return await shopOrderService.verifyOrderPayment(orderIdOrNumber, sessionId);
  }

  async getUserOrders(userId: string) {
    return await shopOrderService.getUserOrders(userId);
  }

  // --- ShopCartService Delegates ---

  async getCart(userId: string) {
    return await shopCartService.getCart(userId);
  }

  async addToCart(
    userId: string,
    payload: {
      productId: string;
      quantity?: number;
      size?: string;
      color?: string;
    },
  ) {
    return await shopCartService.addToCart(userId, payload);
  }

  async updateCartItem(
    userId: string,
    itemId: string,
    payload: {
      quantity?: number;
      size?: string;
      color?: string;
    },
  ) {
    return await shopCartService.updateCartItem(userId, itemId, payload);
  }

  async removeCartItem(userId: string, itemId: string) {
    return await shopCartService.removeCartItem(userId, itemId);
  }

  async clearCart(userId: string) {
    return await shopCartService.clearCart(userId);
  }
}

export const shopService = new ShopService();
