import mongoose, { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { ShopProduct, ShopOrder, ShopCart } from './shop.model';
import { uploadToStorage } from '@/utils/fileUpload.utils';
import { AcademyProfile } from '@/modules/academy/academy.model';
import { User } from '@/modules/user/user.model';
import { getStripeClient } from '@/config/stripe';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

const generateSlug = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export class ShopService {
  async createProduct(user: any, payload: any, files?: Express.Multer.File[]) {
    const name = payload.productName || payload.title;
    if (!name || name.trim() === '') {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Product name is required');
    }

    if (!payload.category || payload.category.trim() === '') {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Category is required');
    }

    // 1. Slug Generation
    const baseSlug = generateSlug(name);
    let finalSlug = baseSlug;
    const existingWithSlug = await ShopProduct.findOne({ slug: baseSlug });
    if (existingWithSlug) {
      finalSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;
    }

    // 2. SKU Auto-Generation if blank
    let sku = payload.sku?.trim();
    if (!sku) {
      const cleanPrefix =
        name
          .replace(/[^a-zA-Z]/g, '')
          .slice(0, 3)
          .toUpperCase() || 'JER';
      const randNum = Math.floor(1000 + Math.random() * 9000);
      sku = `${cleanPrefix}-${new Date().getFullYear()}-${randNum}`;
    }

    // 3. Pricing
    const regularPrice =
      payload.regularPrice !== undefined
        ? Number(payload.regularPrice)
        : Number(payload.price) || 0;
    const salePrice =
      payload.salePrice !== undefined && payload.salePrice !== null && payload.salePrice !== ''
        ? Number(payload.salePrice)
        : null;

    // 4. Description
    const productDescription = payload.productDescription || payload.description || name;

    // 5. Variants (Sizes & Colors)
    let availableSizes: string[] = [];
    if (Array.isArray(payload.availableSizes)) {
      availableSizes = payload.availableSizes;
    } else if (typeof payload.availableSizes === 'string') {
      try {
        const parsed = JSON.parse(payload.availableSizes);
        if (Array.isArray(parsed)) availableSizes = parsed;
        else availableSizes = payload.availableSizes.split(',').map((s: string) => s.trim());
      } catch {
        availableSizes = payload.availableSizes.split(',').map((s: string) => s.trim());
      }
    }

    let availableColors: string[] = [];
    if (Array.isArray(payload.availableColors)) {
      availableColors = payload.availableColors;
    } else if (typeof payload.availableColors === 'string') {
      try {
        const parsed = JSON.parse(payload.availableColors);
        if (Array.isArray(parsed)) availableColors = parsed;
        else availableColors = payload.availableColors.split(',').map((c: string) => c.trim());
      } catch {
        availableColors = payload.availableColors.split(',').map((c: string) => c.trim());
      }
    }

    // 6. Inventory
    const stockQuantity = Number(payload.stockQuantity) >= 0 ? Number(payload.stockQuantity) : 0;
    const minStockLevel = Number(payload.minStockLevel) >= 0 ? Number(payload.minStockLevel) : 0;
    const maxOrderQuantity =
      Number(payload.maxOrderQuantity) > 0 ? Number(payload.maxOrderQuantity) : 10;
    const stockStatus = stockQuantity > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';

    // 7. Status Toggles
    const isActive =
      payload.isActive !== undefined
        ? payload.isActive === true || payload.isActive === 'true'
        : payload.isAvailable !== undefined
          ? payload.isAvailable === true || payload.isAvailable === 'true'
          : true;

    const isFeatured = payload.isFeatured === true || payload.isFeatured === 'true';

    // 8. Image Handling
    let productImage = payload.productImage || payload.image || null;
    const uploadedImages: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const uploadedUrl = await uploadToStorage(file, 'uniform_store');
          if (uploadedUrl) {
            uploadedImages.push(uploadedUrl);
            if (!productImage) productImage = uploadedUrl;
          }
        } catch {
          // ignore individual upload error
        }
      }
    }

    if (payload.images && Array.isArray(payload.images)) {
      uploadedImages.push(...payload.images);
    }

    // 9. Link to Academy if user has academy
    let academyId: Types.ObjectId | undefined = undefined;
    if (payload.academyId && Types.ObjectId.isValid(payload.academyId)) {
      academyId = new Types.ObjectId(payload.academyId);
    } else if (user) {
      if (user.academyId && Types.ObjectId.isValid(user.academyId)) {
        academyId = new Types.ObjectId(user.academyId);
      } else {
        const academyDoc = await AcademyProfile.findOne({
          $or: [{ userId: user._id || user.id }, { _id: user._id || user.id }],
        });
        if (academyDoc) academyId = academyDoc._id as Types.ObjectId;
      }
    }

    if (user?.role === 'ACADEMY' || academyId) {
      const academyDoc = await AcademyProfile.findOne({
        $or: [
          ...(academyId ? [{ _id: academyId }] : []),
          ...(user ? [{ userId: user._id || user.id }, { _id: user._id || user.id }] : []),
        ],
      });
      const currentPlan = academyDoc?.currentPlan || 'FREE';
      const isElite = currentPlan === 'ELITE' || currentPlan === 'PREMIUM';
      if (academyDoc && !isElite && user?.role !== 'SUPER_ADMIN') {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          'Upgrade to the K10 Elite Plan to unlock this feature. The Elite Plan gives your Academy access to advanced team management, tournament and event creation, online store management, game report commissions, player profile transfers, and additional exclusive benefits.',
        );
      }
    }

    const newProduct = await ShopProduct.create({
      academyId,
      userId: user?._id || user?.id,
      productName: name,
      title: name,
      slug: finalSlug,
      category: payload.category.trim(),
      sku,
      regularPrice,
      price: regularPrice,
      salePrice,
      productDescription,
      description: productDescription,
      availableSizes,
      availableColors,
      stockQuantity,
      minStockLevel,
      maxOrderQuantity,
      stockStatus,
      productImage,
      images: uploadedImages.length > 0 ? uploadedImages : productImage ? [productImage] : [],
      isActive,
      isAvailable: isActive,
      isFeatured,
    });

    return newProduct;
  }

  async getAllProducts(query: any = {}) {
    const andConditions: any[] = [];

    // 1. Academy Filter
    if (query.academyId && Types.ObjectId.isValid(query.academyId)) {
      andConditions.push({ academyId: new Types.ObjectId(query.academyId) });
    }

    // 2. Search (Name, Description, SKU, Category)
    const search = (query.search || query.searchTerm || '').trim();
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      andConditions.push({
        $or: [
          { productName: searchRegex },
          { productDescription: searchRegex },
          { sku: searchRegex },
          { category: searchRegex },
          { title: searchRegex },
        ],
      });
    }

    // 3. Category Filter (Case-Insensitive & Slug Friendly, Ignores 'ALL')
    const categoryQuery = (query.category || '').trim();
    if (categoryQuery && categoryQuery.toUpperCase() !== 'ALL') {
      const normalized = categoryQuery.replace(/-/g, ' ');
      andConditions.push({
        $or: [
          { category: { $regex: new RegExp(`^${categoryQuery}$`, 'i') } },
          { category: { $regex: new RegExp(`^${normalized}$`, 'i') } },
        ],
      });
    }

    // 4. Price Range Filter
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const min = query.minPrice !== undefined ? Number(query.minPrice) : 0;
      const max = query.maxPrice !== undefined ? Number(query.maxPrice) : Number.MAX_SAFE_INTEGER;
      andConditions.push({
        $or: [
          {
            $and: [
              { salePrice: { $exists: true, $ne: null, $gt: 0 } },
              { salePrice: { $gte: min, $lte: max } },
            ],
          },
          {
            $and: [
              {
                $or: [{ salePrice: null }, { salePrice: { $exists: false } }, { salePrice: 0 }],
              },
              { regularPrice: { $gte: min, $lte: max } },
            ],
          },
        ],
      });
    }

    // 5. Stock Status Filter
    if (query.stockStatus) {
      const status = query.stockStatus.toUpperCase().trim();
      if (status === 'IN_STOCK') {
        andConditions.push({ stockQuantity: { $gt: 0 } });
      } else if (status === 'OUT_OF_STOCK') {
        andConditions.push({ stockQuantity: { $lte: 0 } });
      }
    } else if (query.inStock !== undefined) {
      const inStock = query.inStock === 'true' || query.inStock === true;
      andConditions.push({ stockQuantity: inStock ? { $gt: 0 } : { $lte: 0 } });
    }

    // 6. Sizes Filter
    if (query.size) {
      const sizeVal = query.size.toUpperCase().trim();
      andConditions.push({ availableSizes: { $in: [sizeVal] } });
    }

    // 7. Colors Filter
    if (query.color) {
      const colorVal = query.color.toUpperCase().trim();
      andConditions.push({ availableColors: { $in: [colorVal] } });
    }

    // 8. Featured Filter
    if (query.isFeatured !== undefined) {
      andConditions.push({ isFeatured: query.isFeatured === 'true' || query.isFeatured === true });
    }

    // 9. Active Status
    if (query.isActive !== undefined) {
      andConditions.push({ isActive: query.isActive === 'true' || query.isActive === true });
    }

    const whereClause = andConditions.length > 0 ? { $and: andConditions } : {};

    // 10. Sorting
    let sortOptions: any = { createdAt: -1 };
    const sortParam = (query.sort || query.sortBy || '').toLowerCase();
    const sortOrder = (query.sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1;

    if (sortParam === 'price' || sortParam === 'price_low' || sortParam === 'price_high') {
      if (sortParam === 'price_low') sortOptions = { regularPrice: 1 };
      else if (sortParam === 'price_high') sortOptions = { regularPrice: -1 };
      else sortOptions = { regularPrice: sortOrder };
    } else if (sortParam === 'newest') {
      sortOptions = { createdAt: -1 };
    } else if (sortParam === 'oldest') {
      sortOptions = { createdAt: 1 };
    } else if (sortParam === 'name' || sortParam === 'name_asc') {
      sortOptions = { productName: 1 };
    } else if (sortParam === 'name_desc') {
      sortOptions = { productName: -1 };
    } else if (sortParam === 'stock' || sortParam === 'stockquantity') {
      sortOptions = { stockQuantity: sortOrder };
    } else if (sortParam === 'featured' || sortParam === 'popular') {
      sortOptions = { isFeatured: -1, createdAt: -1 };
    }

    // 11. Pagination
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    // Execute queries
    const [products, totalCount, inStockCount, outOfStockCount, categories] = await Promise.all([
      ShopProduct.find(whereClause).sort(sortOptions).skip(skip).limit(limit).lean(),
      ShopProduct.countDocuments(whereClause),
      ShopProduct.countDocuments({ ...whereClause, stockQuantity: { $gt: 0 } }),
      ShopProduct.countDocuments({ ...whereClause, stockQuantity: { $lte: 0 } }),
      ShopProduct.distinct('category', whereClause),
    ]);

    return {
      products: products.map((p) => ({
        ...p,
        stockStatus: (p.stockQuantity || 0) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      })),
      stats: {
        totalProducts: totalCount,
        inStockCount,
        outOfStockCount,
        categories: categories.filter(Boolean).map((cat: string) => ({
          name: cat,
          slug: generateSlug(cat),
        })),
      },
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    };
  }

  async getProductBySlugOrId(slugOrId: string) {
    if (!slugOrId) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Product identifier is required');
    }

    let product = await ShopProduct.findOne({ slug: slugOrId.toLowerCase().trim() }).lean();
    if (!product && Types.ObjectId.isValid(slugOrId)) {
      product = await ShopProduct.findById(slugOrId).lean();
    }

    if (!product) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Product not found');
    }

    return {
      ...product,
      stockStatus: (product.stockQuantity || 0) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
    };
  }

  async getProductCategories(academyId?: string) {
    const filter: any = {};
    if (academyId && Types.ObjectId.isValid(academyId)) {
      filter.academyId = new Types.ObjectId(academyId);
    }
    const categories = await ShopProduct.distinct('category', filter);
    const validCategories = categories.filter(Boolean);

    const categoryList = validCategories.map((cat: string) => ({
      name: cat,
      slug: generateSlug(cat),
    }));

    if (!categoryList.some((c) => c.slug === 'all')) {
      categoryList.unshift({ name: 'All', slug: 'all' });
    }

    return categoryList;
  }

  async updateProduct(slugOrId: string, payload: any, files?: Express.Multer.File[]) {
    let product = await ShopProduct.findOne({ slug: slugOrId.toLowerCase().trim() });
    if (!product && Types.ObjectId.isValid(slugOrId)) {
      product = await ShopProduct.findById(slugOrId);
    }

    if (!product) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Product not found');
    }

    // Update name & slug if changed
    if (payload.productName || payload.title) {
      const newName = payload.productName || payload.title;
      product.productName = newName;
      product.title = newName;
      if (generateSlug(newName) !== product.slug) {
        product.slug = generateSlug(newName);
      }
    }

    if (payload.category) product.category = payload.category.trim();
    if (payload.sku) product.sku = payload.sku.trim();

    if (payload.regularPrice !== undefined) {
      product.regularPrice = Number(payload.regularPrice);
      product.price = product.regularPrice;
    } else if (payload.price !== undefined) {
      product.regularPrice = Number(payload.price);
      product.price = product.regularPrice;
    }

    if (payload.salePrice !== undefined) {
      product.salePrice =
        payload.salePrice !== null && payload.salePrice !== '' ? Number(payload.salePrice) : null;
    }

    if (payload.productDescription || payload.description) {
      const desc = payload.productDescription || payload.description;
      product.productDescription = desc;
      product.description = desc;
    }

    if (payload.availableSizes !== undefined) {
      if (Array.isArray(payload.availableSizes)) product.availableSizes = payload.availableSizes;
      else if (typeof payload.availableSizes === 'string') {
        product.availableSizes = payload.availableSizes.split(',').map((s: string) => s.trim());
      }
    }

    if (payload.availableColors !== undefined) {
      if (Array.isArray(payload.availableColors)) product.availableColors = payload.availableColors;
      else if (typeof payload.availableColors === 'string') {
        product.availableColors = payload.availableColors.split(',').map((c: string) => c.trim());
      }
    }

    if (payload.stockQuantity !== undefined) {
      product.stockQuantity = Number(payload.stockQuantity);
      product.stockStatus = product.stockQuantity > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
    }

    if (payload.minStockLevel !== undefined) product.minStockLevel = Number(payload.minStockLevel);
    if (payload.maxOrderQuantity !== undefined)
      product.maxOrderQuantity = Number(payload.maxOrderQuantity);

    if (payload.isActive !== undefined) {
      product.isActive = payload.isActive === true || payload.isActive === 'true';
      product.isAvailable = product.isActive;
    } else if (payload.isAvailable !== undefined) {
      product.isActive = payload.isAvailable === true || payload.isAvailable === 'true';
      product.isAvailable = product.isActive;
    }

    if (payload.isFeatured !== undefined) {
      product.isFeatured = payload.isFeatured === true || payload.isFeatured === 'true';
    }

    // Handle Image uploads
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const uploadedUrl = await uploadToStorage(file, 'uniform_store');
          if (uploadedUrl) {
            product.productImage = uploadedUrl;
            if (!product.images) product.images = [];
            product.images.push(uploadedUrl);
          }
        } catch {
          // ignore
        }
      }
    } else if (payload.productImage || payload.image) {
      const img = payload.productImage || payload.image;
      product.productImage = img;
    }

    await product.save();
    return product;
  }

  async deleteProduct(slugOrId: string) {
    let product = await ShopProduct.findOneAndDelete({ slug: slugOrId.toLowerCase().trim() });
    if (!product && Types.ObjectId.isValid(slugOrId)) {
      product = await ShopProduct.findByIdAndDelete(slugOrId);
    }
    if (!product) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Product not found');
    }
    return { id: product._id, slug: product.slug, message: 'Product deleted successfully' };
  }

  async createOrder(userId: string, payload: any) {
    let orderItems = payload.items;
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      const userCart = await this.getCart(userId);
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

  /**
   * Handle Stripe Webhook for Shop Orders with ACID Transaction & Idempotency
   */
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

  /**
   * Verify Order Payment Status directly with Stripe API
   */
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

  // ==========================================
  // SHOPPING CART MANAGEMENT
  // ==========================================

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

export const shopService = new ShopService();
