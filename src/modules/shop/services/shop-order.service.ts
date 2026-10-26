import mongoose, { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { ShopProduct, ShopOrder } from '../shop.model';
import { User } from '@/modules/user/user.model';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { shopCartService } from './shop-cart.service';

export class ShopOrderService {
  async createOrder(userId: string, payload: any) {
    let orderItems = payload.items;
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      const userCart = await shopCartService.getCart(userId);
      if (!userCart.items || userCart.items.length === 0) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'Cart is empty. Please add items to checkout.');
      }
      orderItems = userCart.items.map((it: any) => ({
        productId: it.productId,
        quantity: it.quantity,
        size: it.size,
        color: it.color,
      }));
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    const validatedItems: any[] = [];
    let calculatedTotal = 0;

    for (const item of orderItems) {
      const product = await ShopProduct.findById(item.productId);
      if (!product) {
        throw new AppError(StatusCodes.NOT_FOUND, `Product not found with ID: ${item.productId}`);
      }

      const requestedQty = Number(item.quantity) || 1;
      const currentStock = typeof product.stockQuantity === 'number' ? product.stockQuantity : 0;
      if (currentStock < requestedQty) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `"${product.productName}" is out of stock or insufficient quantity (Available: ${currentStock}, Requested: ${requestedQty})`,
        );
      }

      const unitPrice =
        typeof product.salePrice === 'number' && product.salePrice > 0
          ? product.salePrice
          : product.regularPrice || product.price || Number(item.price) || 0;

      const roundedUnitPrice = Math.round(unitPrice * 100) / 100;
      calculatedTotal += roundedUnitPrice * requestedQty;

      validatedItems.push({
        productId: product._id,
        productName: product.productName,
        productImage: product.productImage || (product.images && product.images[0]) || '',
        quantity: requestedQty,
        price: roundedUnitPrice,
        size: item.size || (product.availableSizes && product.availableSizes[0]) || '',
        color: item.color || (product.availableColors && product.availableColors[0]) || '',
      });
    }

    calculatedTotal = Math.round(calculatedTotal * 100) / 100;

    // Generate unique order number
    const count = await ShopOrder.countDocuments();
    const orderNumber = `ORD-${new Date().getFullYear()}-${(count + 1).toString().padStart(5, '0')}`;

    // Step 2: Create Stripe Checkout Session
    const stripe = getStripeClient();
    const clientBaseUrl = env.CLIENT_URL || process.env.CLIENT_URL || 'http://localhost:3000';
    const successUrl = `${clientBaseUrl}/shop/order-success?session_id={CHECKOUT_SESSION_ID}&orderNumber=${orderNumber}`;
    const cancelUrl = `${clientBaseUrl}/shop/cart`;

    const stripeLineItems = validatedItems.map((it: any) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: it.productName + (it.size ? ` (Size: ${it.size})` : ''),
          images: it.productImage ? [it.productImage] : [],
        },
        unit_amount: Math.round(it.price * 100),
      },
      quantity: it.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      line_items: stripeLineItems,
      mode: 'payment',
      customer_email: user.email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        paymentType: 'SHOP_ORDER',
        type: 'SHOP_ORDER',
        orderNumber,
        userId: user._id.toString(),
      },
    });

    // Create Order with PENDING status
    const order = await ShopOrder.create({
      userId: user._id,
      orderNumber,
      items: validatedItems.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        price: it.price,
        size: it.size,
        color: it.color,
      })),
      totalAmount: calculatedTotal,
      paymentStatus: 'PENDING',
      orderStatus: 'PROCESSING',
      stripeSessionId: session.id,
      checkoutUrl: session.url,
      shippingAddress: payload.shippingAddress || '',
    });

    const orderObj = order.toObject();
    return {
      ...orderObj,
      currency: 'USD',
      sessionId: session.id,
    };
  }

  async handleShopOrderStripeWebhook(sessionObject: any) {
    const orderNumber = sessionObject?.metadata?.orderNumber;
    const orderId = sessionObject?.metadata?.orderId;
    const stripeSessionId = sessionObject?.id;

    logger.info(
      `Processing Shop Order Stripe Webhook: session=${stripeSessionId}, orderNumber=${orderNumber}`,
    );

    const query: any = {};
    if (orderId && Types.ObjectId.isValid(orderId)) {
      query.$or = [{ _id: orderId }, { stripeSessionId }, { orderNumber }];
    } else if (orderNumber) {
      query.$or = [{ orderNumber }, { stripeSessionId }];
    } else if (stripeSessionId) {
      query.stripeSessionId = stripeSessionId;
    } else {
      logger.warn('Shop Order Webhook: No identifier found in session object');
      return null;
    }

    const existingOrder = await ShopOrder.findOne(query);
    if (!existingOrder) {
      logger.warn(`Shop Order Webhook: Order not found for session ${stripeSessionId}`);
      return null;
    }

    // IDEMPOTENCY CHECK 1: If order is already PAID, return immediately to prevent duplicate side effects
    if (existingOrder.paymentStatus === 'PAID') {
      logger.info(
        `Shop Order ${existingOrder.orderNumber} is already marked as PAID. Idempotency guaranteed.`,
      );
      return existingOrder;
    }

    // ACID TRANSACTION: Atomically mark order as PAID and deduct inventory
    const mongoSession = await mongoose.startSession();
    let updatedOrder: any;

    try {
      mongoSession.startTransaction();

      // Atomic compare-and-swap idempotency
      updatedOrder = await ShopOrder.findOneAndUpdate(
        {
          _id: existingOrder._id,
          paymentStatus: { $ne: 'PAID' },
        },
        {
          $set: {
            paymentStatus: 'PAID',
            orderStatus: 'PROCESSING',
            paidAt: new Date(),
            checkoutUrl: null, // Clear checkoutUrl once paid
            ...(sessionObject.payment_intent
              ? { stripePaymentIntentId: String(sessionObject.payment_intent) }
              : {}),
          },
        },
        { session: mongoSession, new: true },
      );

      // If null, another concurrent request already transitioned this order to PAID
      if (!updatedOrder) {
        await mongoSession.abortTransaction();
        return ShopOrder.findById(existingOrder._id);
      }

      // Deduct stock for each purchased product inside the transaction
      for (const item of updatedOrder.items) {
        const product = await ShopProduct.findById(item.productId).session(mongoSession);
        if (product) {
          const newQty = Math.max(0, (product.stockQuantity || 0) - item.quantity);
          product.stockQuantity = newQty;
          product.stockStatus = newQty > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
          await product.save({ session: mongoSession });
          logger.info(
            `ACID Transaction: Deducted stock for product "${product.productName}". Remaining: ${newQty}`,
          );
        }
      }

      await mongoSession.commitTransaction();
      logger.info(
        `ACID Transaction committed: Shop Order ${updatedOrder.orderNumber} paid and inventory updated!`,
      );
    } catch (txnError: any) {
      if (mongoSession.inTransaction()) {
        await mongoSession.abortTransaction();
      }

      // Standalone MongoDB fallback if transactions are unsupported on local dev node
      if (
        txnError?.message?.includes('replica set') ||
        txnError?.message?.includes('standalone') ||
        txnError?.message?.includes('Transactions are not supported')
      ) {
        logger.warn(
          'Transactions unsupported on standalone MongoDB. Executing atomic fallback with idempotency...',
        );
        updatedOrder = await ShopOrder.findOneAndUpdate(
          { _id: existingOrder._id, paymentStatus: { $ne: 'PAID' } },
          {
            $set: {
              paymentStatus: 'PAID',
              orderStatus: 'PROCESSING',
              paidAt: new Date(),
              checkoutUrl: null,
              ...(sessionObject.payment_intent
                ? { stripePaymentIntentId: String(sessionObject.payment_intent) }
                : {}),
            },
          },
          { new: true },
        );

        if (updatedOrder) {
          for (const item of updatedOrder.items) {
            try {
              const product = await ShopProduct.findById(item.productId);
              if (product) {
                const newQty = Math.max(0, (product.stockQuantity || 0) - item.quantity);
                product.stockQuantity = newQty;
                product.stockStatus = newQty > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
                await product.save();
              }
            } catch (err: any) {
              logger.error(
                `Stock update error on product ${item.productId}: ${err?.message || err}`,
              );
            }
          }
        }
      } else {
        logger.error(
          `Transaction failed in handleShopOrderStripeWebhook: ${txnError?.message || txnError}`,
        );
        throw txnError;
      }
    } finally {
      await mongoSession.endSession();
    }

    return updatedOrder || ShopOrder.findById(existingOrder._id);
  }

  async verifyOrderPayment(orderIdOrNumber: string, sessionId?: string) {
    const query: any = {};
    if (Types.ObjectId.isValid(orderIdOrNumber)) {
      query.$or = [{ _id: orderIdOrNumber }, { orderNumber: orderIdOrNumber }];
    } else if (orderIdOrNumber) {
      query.orderNumber = orderIdOrNumber;
    }
    if (sessionId) {
      if (query.$or) query.$or.push({ stripeSessionId: sessionId });
      else query.stripeSessionId = sessionId;
    }

    const order = await ShopOrder.findOne(query).populate('items.productId');
    if (!order) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Order not found');
    }

    // If order is already PAID, return it without checkoutUrl
    if (order.paymentStatus === 'PAID') {
      const orderObj = order.toObject();
      delete (orderObj as any).checkoutUrl;
      return orderObj;
    }

    // Verify directly with Stripe API
    const targetSessionId = sessionId || order.stripeSessionId;
    if (!targetSessionId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Stripe checkout session ID is missing for this order',
      );
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(targetSessionId);
    if (!session) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Stripe checkout session not found');
    }

    // If payment is not completed on Stripe, THROW ERROR!
    if (session.payment_status !== 'paid') {
      throw new AppError(
        StatusCodes.PAYMENT_REQUIRED,
        `Payment has not been completed yet on Stripe (Current status: ${session.payment_status.toUpperCase()}). Please complete payment at the checkout URL first.`,
      );
    }

    // Payment is verified as 'paid' on Stripe: Fulfill order via ACID transaction
    await this.handleShopOrderStripeWebhook(session);

    const verifiedOrder = await ShopOrder.findById(order._id).populate('items.productId');
    const orderObj = verifiedOrder ? verifiedOrder.toObject() : order.toObject();
    delete (orderObj as any).checkoutUrl;
    return orderObj;
  }

  async getUserOrders(userId: string) {
    const userConditions: any[] = [];
    if (Types.ObjectId.isValid(userId)) {
      userConditions.push({ userId: new Types.ObjectId(userId) });
    }
    userConditions.push({ userId });

    return ShopOrder.find({ $or: userConditions })
      .populate('items.productId')
      .sort({ createdAt: -1 });
  }
}

export const shopOrderService = new ShopOrderService();
