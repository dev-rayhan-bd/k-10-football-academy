import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { ShopProduct, ShopCart } from '../shop.model';

export class ShopCartService {
  async getCart(userId: string) {
    let cart = await ShopCart.findOne({ userId }).populate('items.productId');
    if (!cart) {
      cart = await ShopCart.create({ userId, items: [] });
    }

    const formattedItems: any[] = [];
    let subtotal = 0;
    let itemCount = 0;

    for (const item of cart.items || []) {
      const product: any = item.productId;
      if (!product || !product._id) continue;

      const price =
        typeof product.salePrice === 'number' && product.salePrice > 0
          ? product.salePrice
          : product.regularPrice || product.price || 0;
      const roundedPrice = Math.round(price * 100) / 100;
      const itemTotal = Math.round(roundedPrice * item.quantity * 100) / 100;

      subtotal += itemTotal;
      itemCount += item.quantity;

      formattedItems.push({
        _id: item._id,
        productId: product._id,
        productName: product.productName || product.title || 'Product',
        productImage: product.productImage || (product.images && product.images[0]) || '',
        category: product.category || '',
        size: item.size || '',
        color: item.color || '',
        price: roundedPrice,
        quantity: item.quantity,
        totalPrice: itemTotal,
        stockQuantity: product.stockQuantity || 0,
        stockStatus: (product.stockQuantity || 0) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;

    return {
      _id: cart._id,
      items: formattedItems,
      itemCount,
      subtotal,
    };
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
    const product = await ShopProduct.findById(payload.productId);
    if (!product) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Product not found');
    }

    const requestedQty = Number(payload.quantity) || 1;
    const currentStock = typeof product.stockQuantity === 'number' ? product.stockQuantity : 0;
    if (currentStock < requestedQty) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `"${product.productName}" is out of stock or insufficient quantity (Available: ${currentStock})`,
      );
    }

    let cart = await ShopCart.findOne({ userId });
    if (!cart) {
      cart = await ShopCart.create({ userId, items: [] });
    }

    const itemSize = (
      payload.size ||
      (product.availableSizes && product.availableSizes[0]) ||
      ''
    ).trim();
    const itemColor = (payload.color || '').trim();

    // Check if the same product with same size & color already exists in cart
    const existingIndex = cart.items.findIndex(
      (it) =>
        it.productId.toString() === product._id.toString() &&
        (it.size || '').trim() === itemSize &&
        (it.color || '').trim() === itemColor,
    );

    if (existingIndex > -1) {
      const newTotalQty = cart.items[existingIndex].quantity + requestedQty;
      if (currentStock < newTotalQty) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Cannot add more "${product.productName}". Maximum available stock is ${currentStock} (already in cart: ${cart.items[existingIndex].quantity})`,
        );
      }
      cart.items[existingIndex].quantity = newTotalQty;
    } else {
      cart.items.push({
        productId: product._id,
        quantity: requestedQty,
        size: itemSize,
        color: itemColor,
      });
    }

    await cart.save();
    return this.getCart(userId);
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
    const cart = await ShopCart.findOne({ userId });
    if (!cart) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Cart not found');
    }

    const itemIndex = cart.items.findIndex(
      (it) => it._id?.toString() === itemId || it.productId.toString() === itemId,
    );

    if (itemIndex === -1) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Item not found in cart');
    }

    if (payload.quantity !== undefined && Number(payload.quantity) <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      if (payload.quantity !== undefined) {
        const product = await ShopProduct.findById(cart.items[itemIndex].productId);
        const stock = product?.stockQuantity || 0;
        if (stock < Number(payload.quantity)) {
          throw new AppError(
            StatusCodes.BAD_REQUEST,
            `Insufficient stock for "${product?.productName}". Available: ${stock}`,
          );
        }
        cart.items[itemIndex].quantity = Number(payload.quantity);
      }
      if (payload.size !== undefined) {
        cart.items[itemIndex].size = payload.size.trim();
      }
      if (payload.color !== undefined) {
        cart.items[itemIndex].color = payload.color.trim();
      }
    }

    await cart.save();
    return this.getCart(userId);
  }

  async removeCartItem(userId: string, itemId: string) {
    const cart = await ShopCart.findOne({ userId });
    if (!cart) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Cart not found');
    }

    cart.items = cart.items.filter(
      (it) => it._id?.toString() !== itemId && it.productId.toString() !== itemId,
    );

    await cart.save();
    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    await ShopCart.findOneAndUpdate({ userId }, { $set: { items: [] } }, { upsert: true });
    return {
      items: [],
      itemCount: 0,
      subtotal: 0,
      message: 'Cart cleared successfully',
    };
  }
}

export const shopCartService = new ShopCartService();
