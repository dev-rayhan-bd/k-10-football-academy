import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/utils/AppError';
import { IShopOrder } from './shop.interface';
import { ShopProduct, ShopOrder } from './shop.model';
import { uploadToStorage } from '@/utils/fileUpload.utils';
import { AcademyProfile } from '@/modules/academy/academy.model';

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
      image: productImage,
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

    // 3. Category Filter (Case-Insensitive)
    if (query.category && query.category.trim() !== '') {
      andConditions.push({
        category: { $regex: new RegExp(`^${query.category.trim()}$`, 'i') },
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
        categories,
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
    return categories.filter(Boolean);
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
            product.image = uploadedUrl;
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
      product.image = img;
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
