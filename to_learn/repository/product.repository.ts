import { Types } from "mongoose";
import logger from "../configs/winston.config";
import { ProductsModel } from "../models/product.model";
import {
  IChampionProduct,
  ICreateChampionProduct,
  IOfflineProduct,
  IProduct,
  IProductImage,
  IProductList,
} from "../types/product.type";
import { OfflineProductsModel } from "../models/offlineProducts.model";

export class ProductRepository {
  public async createProduct(
    body: IProduct | IOfflineProduct | ICreateChampionProduct
  ): Promise<IProduct | null> {
    try {
      const newProduct: IProduct | null = await ProductsModel.create(body);

      if (!newProduct) {
        return null;
      }

      return newProduct;
    } catch (err: any) {
      console.error(
        "ProductRepository - createProduct: Error in createProduct :-",
        err?.message
      );
      logger.error(
        "ProductRepository - createProduct: Error in createProduct :-",
        err?.message
      );
      throw new Error(err?.message);
    }
  }

  // public async createChampionProduct(body: IChampionProduct, parentProduct: IProduct, image: string, shopifyId: string): Promise<IProduct | null> {
  //     try {
  //         const newProduct: IProduct | null = await ProductsModel.create({
  //             ...body,
  //             parentId: parentProduct?._id,
  //             price: (parentProduct?.price ?? 0) * body?.championQuantity,
  //             image: [image],
  //             isChampionProduct: true,
  //             description: `Champion product for "${parentProduct?.name}". This product is designated as the champion version with a multiplier quantity of ${body?.championQuantity}.`,
  //             shopifyId: shopifyId
  //         });

  //         if (!newProduct) {
  //             return null;
  //         }

  //         return newProduct;

  //     } catch (err: any) {
  //         console.error("ProductRepository - createChamberProduct: Error in createChamberProduct :-", err?.message);
  //         logger.error("ProductRepository - createChamberProduct: Error in createChamberProduct :-", err?.message);
  //         throw new Error(err?.message);
  //     }
  // }

  async updateProduct(
    productId: string,
    product: Partial<IProduct | IChampionProduct>,
    imageUrls?: IProductImage[]
  ): Promise<IProduct | null> {
    try {
      if (!product) {
        return null;
      }

      console.log("imageUrls", imageUrls);

      if (imageUrls && imageUrls?.length > 0 && Array.isArray(imageUrls)) {
        product.image = imageUrls?.map((image) => image?.url as string);
      }

      const updatedProduct: IProduct | null =
        await ProductsModel.findOneAndReplace({ _id: productId }, product, {
          upsert: true,
          new: true,
        });

      if (!updatedProduct) {
        return null;
      }

      // format the dates:
      updatedProduct.availablityStartDate = this.convertMMDDToISO(
        product.availablityStartDate
      );
      updatedProduct.availablityEndDate = this.convertMMDDToISO(
        product.availablityEndDate
      );

      return updatedProduct;
    } catch (err: any) {
      console.error(
        "ProductRepository - updateProduct: Error in updateProduct :-",
        err?.message
      );
      logger.error(
        "ProductRepository - updateProduct: Error in updateProduct :-",
        err?.message
      );
      throw new Error(err?.message);
    }
  }

  public async getProductByShopifyId(id: string): Promise<IProduct | IChampionProduct | null> {
    try {
      const product = await ProductsModel?.findOne({
        shopifyId: id,
        isDeleted: false,
      });

      if (!product) {
        return null;
      }

      // format the dates:
      // product.availablityStartDate = this.convertMMDDToISO(
      //   product.availablityStartDate
      // );
      // product.availablityEndDate = this.convertMMDDToISO(
      //   product.availablityEndDate
      // );

      return product;
    } catch (err: any) {
      console.error(
        "ProductRepository - getProductByShopifyId: Error in getProductByShopifyId :-",
        err?.message
      );
      logger.error(
        "ProductRepository - getProductByShopifyId: Error in getProductByShopifyId :-",
        err?.message
      );
      throw new Error(err?.message);
    }
  }

  public async deleteProduct(id: string): Promise<IProduct | null> {
    try {
      const product: IProduct | null = await ProductsModel.findByIdAndUpdate(
        id,
        { isDeleted: true, shopifyStatus: "ARCHIVED" },
        { new: true }
      );

      if (!product) {
        return null;
      }

      return product;
    } catch (err: any) {
      console.error(
        "ProductRepository - deleteProduct: Error in deleteProduct :-",
        err?.message
      );
      logger.error(
        "ProductRepository - deleteProduct: Error in deleteProduct :-",
        err?.message
      );
      throw new Error(err?.message);
    }
  }

  public async activateProduct(id: string): Promise<IProduct | null> {
    try {
      console.log("Product reactivate")
      const product: IProduct | null = await ProductsModel.findByIdAndUpdate(
        id,
        { isDeleted: false, shopifyStatus: "ACTIVE" },
        { new: true }
      );

      if (!product) {
        return null;
      }
      console.log("Product reactivateed",product)
      return product;
    } catch (err: any) {
      console.error(
        "ProductRepository - activateProduct: Error in activateProduct :-",
        err?.message
      );
      logger.error(
        "ProductRepository - activateProduct: Error in activateProduct :-",
        err?.message
      );
      throw new Error(err?.message);
    }
  }

  async getProducts(filters: {
    pageNo: number | any;
    pageSize: number | any;
    title?: string | null;
    vendor?: string | null;
    category?: string | null;
    minPrice?: number | null;
    maxPrice?: number | null;
    sellModeType?: string | null;
  }): Promise<IProductList> {
    const { pageNo, pageSize, title, vendor, category, minPrice, maxPrice, sellModeType } = filters;
    const skip = (pageNo - 1) * pageSize;
    const limit = parseInt(pageSize);
  
    // Build a base query for online products
    const onlineQuery: any = {
      isDeleted: false,
      $or: [{ isChampionProduct: false }, { isChampionProduct: { $exists: false } }]
    };
    if (title) onlineQuery.name = { $regex: title, $options: "i" };
    if (vendor) onlineQuery.vendor = { $regex: vendor, $options: "i" };
    if (category) onlineQuery.category = new Types.ObjectId(category);
    if (minPrice) onlineQuery.price = { $gte: minPrice };
    if (maxPrice) onlineQuery.price = { ...onlineQuery.price, $lte: maxPrice };
    // When filtering for online, include only online products.
    if (sellModeType && sellModeType.toLowerCase() === "online") {
      onlineQuery.sellModeType = "online";
    }
  
    // Build a query for offline products (from the offlineproducts collection)
    const offlineQuery: any = { isDeleted: false, sellModeType: "offline" };
    if (title) offlineQuery.name = { $regex: title, $options: "i" };
    // (Add other offline-specific filters here if needed)
  
    // If sellModeType is "offline", skip the online query.
    let onlineProducts: any[] = [];
    if (!sellModeType || sellModeType.toLowerCase() !== "offline") {
      onlineProducts = await ProductsModel.find(onlineQuery)
        .populate("category", "name active")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();
    }
  
    // If sellModeType is "online", skip the offline query.
    let offlineProducts: any[] = [];
    if (!sellModeType || sellModeType.toLowerCase() !== "online") {
      offlineProducts = await OfflineProductsModel.find(offlineQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();
    }
  
    // Format online products
    const formattedOnlineProducts = await Promise.all(onlineProducts.map(async (prod: any) => {
      let hasChampionData = await ProductsModel.findOne({ parentProduct: prod._id });
      
      return {
        id: prod._id,
        name: prod.name,
        description: prod.description || "",
        productType: prod.productType,
        vendor: prod.vendor,
        price: prod.price,
        image: prod.image,
        sellModeType: prod.sellModeType === "offline" ? "Offline" : "Online",
        inventory: prod.inventory || "Unlimited",
        soldQuantity: prod.soldQuantity || 0,
        sku: prod?.sku,
        category: prod.category && prod.category.active ? prod.category.name : "",
        minQuantity: prod.minQuantity,
        taxReciept: prod.taxReciept,
        availabilityStartDate: this.convertMMDDToISO(prod.availablityStartDate),
        availabilityEndDate: this.convertMMDDToISO(prod.availablityEndDate),
        createdAt: prod.createdAt,
        variants: prod.variants?.map((variant: any) => ({
          id: variant._id,
          title: variant.title,
          sku: variant.sku,
          price: variant.price,
        })),
        hasChampionProduct: hasChampionData ? "Yes" : "No"
      };
    }));
  
    // Format offline products
    const formattedOfflineProducts = offlineProducts.map((prod: any) => ({
      id: prod._id,
      name: prod.name,
      description: prod.description || "",
      image: prod.image,
      sellModeType: "Offline", // enforce lowercase offline
      inventory: "Unlimited",
      createdAt: prod.createdAt,
      hasChampionProduct: "No"
    }));
  
    // Merge the two arrays and deduplicate based on id
    const combinedProducts = [...formattedOnlineProducts, ...formattedOfflineProducts];
    const productMap = new Map<string, any>();
    combinedProducts.forEach(prod => {
      if (!productMap.has(prod.id)) {
        productMap.set(prod.id, prod);
      }
    });
    const allProducts = Array.from(productMap.values());
  
    // Sort by createdAt descending
    allProducts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
    // Get total counts for pagination separately
    const onlineCount = (!sellModeType || sellModeType.toLowerCase() !== "offline")
      ? await ProductsModel.countDocuments(onlineQuery).exec()
      : 0;
    const offlineCount = (!sellModeType || sellModeType.toLowerCase() !== "online")
      ? await OfflineProductsModel.countDocuments(offlineQuery).exec()
      : 0;
    const totalCount = onlineCount + offlineCount;
  
    return {
      products: allProducts,
      pageInfo: {
        hasNextPage: skip + limit < totalCount,
        hasPreviousPage: skip > 0,
        totalCount,
      },
    };
  }

  async getProductById(id: string): Promise<IProduct | null> {
    try {
      if (!id) {
        return null;
      }

      // const product: IProduct | null = await ProductsModel.findOne({ _id: new Types.ObjectId(id), isDeleted: false });

      const product: IProduct[] | null = await ProductsModel.aggregate([
        {
          $match: {
            _id: new Types.ObjectId(id),
            isDeleted: false,
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "parentProduct",
            as: "championProducts",
            pipeline: [
              {
                $match: {
                  isDeleted: false,
                },
              },
              {
                $project: {
                  _id: 1,
                  name: 1,
                  image: 1,
                  isChampionProduct: 1,
                  championQuantity: 1,
                  shopifyId: 1,
                  position:1,
                  sku:1
                },
              },
              {
                $sort:{
                  position: 1
                }
              }
            ],
          },
        },
        {
          $project: {
            isDeleted: 0,
            createdAt: 0,
            updatedAt: 0,
            __v: 0,
          },
        },
      ]);

      if (!product || product.length === 0) {
        return null;
      }

      if (product[0] && (product[0]?.championProducts?.length ?? 0) > 0) {
        product[0].isChampionProduct = true;
      } else {
        if (product[0]){
          product[0].isChampionProduct = false;
        }
      }

      console.log(product[0].availablityStartDate);

      // format the dates:
      // product[0].availablityStartDate = this.convertMMDDToISO(
      //   product[0].availablityStartDate
      // );
      // product[0].availablityEndDate = this.convertMMDDToISO(
      //   product[0].availablityEndDate
      // );

      product[0].availablityStartDate = product[0].availablityStartDate
      product[0].availablityEndDate = product[0].availablityEndDate

      return product[0];
    } catch (err: any) {
      console.error(
        "ProductRepository - getProductById: Error in getProductById :-",
        err?.message
      );
      logger.error(
        "ProductRepository - getProductById: Error in getProductById :-",
        err?.message
      );
      throw new Error(err?.message);
    }
  }

  async getProductByKey(key: string, value: string): Promise<IProduct | null> {
    try {
      if (!key || !value) {
        return null;
      }

      const product: IProduct | null = await ProductsModel.findOne({
        [key]: value,
        isDeleted: false,
      });

      if (!product) {
        return null;
      }

      // format the dates:
      // product.availablityStartDate = new Date(
      //   `${new Date().getFullYear()}-${product.availablityStartDate}`
      // ).toISOString();
      // product.availablityEndDate = new Date(
      //   `${new Date().getFullYear()}-${product.availablityEndDate}`
      // ).toISOString();

      return product;
    } catch (err: any) {
      console.error(
        "ProductRepository - getProductByKey: Error in getProductByKey :-",
        err?.message
      );
      logger.error(
        "ProductRepository - getProductByKey: Error in getProductByKey :-",
        err?.message
      );
      throw new Error(err?.message);
    }
  }

  // convertMMDDToISO(mmdd?: string | null | Date): string {
  //     // Expect mmdd in "MM-DD" format
  //     if (typeof mmdd === 'string') {
  //         const parts = mmdd?.split("-");
  //         console.log("parts", typeof mmdd);
  //         if (parts && parts.length !== 2) {
  //             throw new Error(`Invalid availability format: ${mmdd}`);
  //         }
  //         const [monthStr, dayStr] = parts || [];
  //         const month = parseInt(monthStr, 10);
  //         const day = parseInt(dayStr, 10);
  //         if (isNaN(month) || month < 1 || month > 12) {
  //             throw new Error(`Invalid month provided: ${monthStr}`);
  //         }
  //         if (isNaN(day) || day < 1 || day > 31) {
  //             throw new Error(`Invalid day provided: ${dayStr}`);
  //         }
  //         // Build a date using the current year – so the same MM-DD repeats each year
  //         const currentYear = new Date().getFullYear();
  //         const date = new Date(currentYear, month - 1, day);
  //         if (isNaN(date.getTime())) {
  //             throw new Error(`Constructed date is invalid for ${mmdd}`);
  //         }
  //         return date.toLocaleString();
  //     } else {
  //         return mmdd?.toLocaleString() || "";
  //     }
  // };
  convertMMDDToISO(mmdd?: string | null | Date): string {
    // Expect mmdd in "MM-DD" format
    if (typeof mmdd === "string") {
      const parts = mmdd.split("-");
      if (parts.length !== 2) {
        throw new Error(`Invalid availability format: ${mmdd}`);
      }
      const [monthStr, dayStr] = parts;
      const month = parseInt(monthStr, 10);
      const day = parseInt(dayStr, 10);
      if (isNaN(month) || month < 1 || month > 12) {
        throw new Error(`Invalid month provided: ${monthStr}`);
      }
      if (isNaN(day) || day < 1 || day > 31) {
        throw new Error(`Invalid day provided: ${dayStr}`);
      }
      const currentYear = new Date().getFullYear();
      // Create the date in UTC so that it's not shifted to local timezone
      const date = new Date(Date.UTC(currentYear, month - 1, day));
      if (isNaN(date.getTime())) {
        throw new Error(`Constructed date is invalid for ${mmdd}`);
      }
      return date.toISOString();
    } else {
      return mmdd?.toString() || "";
    }
  }

  public async getProductsByCategory(
    categoryId: string | Types.ObjectId
  ): Promise<IProduct[] | null> {
    try {
      if (!categoryId) {
        return null;
      }

      const products = await ProductsModel.find({
        category: new Types.ObjectId(categoryId),
        isDeleted: false,
      });

      if (!products) {
        return null;
      }

      return products;
    } catch (err: any) {
      console.error(
        "ProductRepository - getProductsByCategory: Error in getProductsByCategory :-",
        err?.message
      );
      logger.error(
        "ProductRepository - getProductsByCategory: Error in getProductsByCategory :-",
        err?.message
      );
      throw new Error(err?.message);
    }
  }

  public async getDeletedProductsByCategory(
    categoryId: string | Types.ObjectId
  ): Promise<IProduct[] | null> {
    try {
      if (!categoryId) {
        return null;
      }

      const products = await ProductsModel.find({
        category: new Types.ObjectId(categoryId),
        isDeleted: true,
        shopifyStatus:"ARCHIVED"
      });

      if (!products) {
        return null;
      }

      return products;
    } catch (err: any) {
      console.error(
        "ProductRepository - getDeletedProductsByCategory: Error in getDeletedProductsByCategory :-",
        err?.message
      );
      logger.error(
        "ProductRepository - getDeletedProductsByCategory: Error in getDeletedProductsByCategory :-",
        err?.message
      );
      throw new Error(err?.message);
    }
  }

  public async getShopifyProductsWB(categoryId: string, slug: string) {
    const matchCondition: any = {
      isDeleted: false,
      $or: [
        { isChampionProduct: false },
        { isChampionProduct: { $exists: false } }
      ]
    };

    if (categoryId) {
      matchCondition[
        "categoryInfo.shopifyId"
      ] = `gid://shopify/Collection/${categoryId}`;
    }

    if (slug) {
      matchCondition["categoryInfo.handle"] = slug;
    }

    try {
      const products = await ProductsModel.aggregate([
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "categoryInfo",
          },
        },
        {
          $unwind: {
            path: "$categoryInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: matchCondition,
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "parentProduct",
            as: "championProducts",
          },
        },
        {
          $project: {
            // Extract variant ID from main product (no fallback)
            productId: {
              $cond: {
                if: { $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] },
                then: {
                  $toDouble: {
                    $arrayElemAt: [
                      { $split: [{ $arrayElemAt: ["$variants.id", 0] }, "/"] },
                      -1,
                    ]
                  }
                },
                // If no variants, return null (no fallback)
                else: null
              }
            },
            // Get champion details with empty array if no champions
            champions: {
              $cond: {
                if: { $gt: [{ $size: "$championProducts" }, 0] },
                then: {
                  $map: {
                    input: "$championProducts",
                    as: "champion",
                    in: {
                      // Extract variant ID from champion (no fallback)
                      id: {
                        $cond: {
                          if: { $gt: [{ $size: { $ifNull: ["$$champion.variants", []] } }, 0] },
                          then: {
                            $toDouble: {
                              $arrayElemAt: [
                                { $split: [{ $arrayElemAt: ["$$champion.variants.id", 0] }, "/"] },
                                -1,
                              ]
                            }
                          },
                          // If no variants, return null (no fallback)
                          else: null
                        }
                      },
                      championQuantity: { $ifNull: ["$$champion.championQuantity", 0] },
                    },
                  },
                },
                else: []
              }
            },
            inventory: { $ifNull: ["$inventory", -1] },
            _id: 0,
          },
        }
      ]);

      if (!products || products.length === 0) {
        return null;
      }

      return products;
    } catch (err: any) {
      console.error(
        "ProductRepository - getShopifyProductsWB: Error in getShopifyProductsWB :-",
        err?.message
      );
      logger.error(
        "ProductRepository - getShopifyProductsWB: Error in getShopifyProductsWB :-",
        err?.message
      );
      throw new Error(err?.message);
    }
  }

  public async deleteChampionProduct(id: string): Promise<IProduct | null> {
    try {
      const product: IProduct | null = await ProductsModel.findByIdAndDelete(
        id
      );

      if (!product) {
        return null;
      }

      return product;

    } catch (err: any) {
      console.error(
        "ProductRepository - deleteChampionProduct: Error in deleteChampionProduct :-",
        err?.message
      );
      logger.error(
        "ProductRepository - deleteChampionProduct: Error in deleteChampionProduct :-",
        err?.message
      );
      throw new Error(err?.message);
    }
  }

    public async updateInventoryFromOrder(products: any[]): Promise<{
      success: number;
      failed: number;
    }> {
      try {
        logger.debug(`Updating inventory for ${products.length} products`);
        
        let successCount = 0;
        let failedCount = 0;
        
        for (const product of products) {
          try {
            const shopifyId = product.shopifyId;
            const quantity = product.quantity;
            
            if (!shopifyId || !quantity) {
              logger.warn(`Skipping inventory update - invalid product data: ${JSON.stringify(product)}`);
              failedCount++;
              continue;
            }
            
            const productDetails = await this.getProductByShopifyId(shopifyId);
            
            if (!productDetails) {
              logger.warn(`Product not found: ${shopifyId}`);
              failedCount++;
              continue;
            }
            
            // Handle champion products - update parent product's inventory
            if ('parentProduct' in productDetails && productDetails.parentProduct) {
              // Get the parent product
              const parentProduct = await this.getProductById(productDetails.parentProduct);
              
              if (parentProduct) {
                // Calculate effective quantity using championQuantity
                const championQuantity = productDetails.championQuantity || 1;
                const effectiveQuantity = quantity * championQuantity;
                
                // Update parent product inventory with the effective quantity
                await this.updateProductInventory(
                  parentProduct.shopifyId as string,
                  effectiveQuantity  // Effective quantity decreases inventory
                );
                
                logger.info(`Updated parent product inventory: ${parentProduct.shopifyId}, -${effectiveQuantity} (${quantity} × ${championQuantity})`);
                successCount++;
              } else {
                logger.warn(`Parent product not found for: ${shopifyId}`);
                failedCount++;
              }
            } else {
              // Regular product - update directly
              await this.updateProductInventory(shopifyId, quantity);
              logger.info(`Updated product inventory: ${shopifyId}, -${quantity}`);
              successCount++;
            }
          } catch (error: any) {
            logger.error(`Error updating product ${product.shopifyId}: ${error.message}`);
            failedCount++;
          }
        }
        
        logger.info(`Inventory update complete: ${successCount} succeeded, ${failedCount} failed`);
        return { success: successCount, failed: failedCount };
      } catch (error: any) {
        logger.error(`Error in updateInventoryFromOrder: ${error.message}`);
        throw error;
      }
    }

  


  /**
 * Restock inventory when an order is cancelled or returned
 */
  // public async restockProductsFromOrder(products: Array<any>): Promise<void> {
  //   try {
  //     logger.info(`Restocking inventory for ${products.length} products`);
      
  //     for (const product of products) {
  //       try {
  //         if (!product.shopifyId || !product.quantity) {
  //           logger.warn(`Skipping inventory restock for invalid product: ${JSON.stringify(product)}`);
  //           continue;
  //         }
          
  //         // Check if this is a champion product
  //         const productDetails = await this.getProductByShopifyId(product.shopifyId);
          
  //         if (!productDetails) {
  //           logger.warn(`Product not found for shopifyId: ${product.shopifyId}`);
  //           continue;
  //         }
          
  //         if ('parentProduct' in productDetails && productDetails.parentProduct) {
  //           // This is a champion product - restore inventory to parent
  //           const parentProduct = await this.getProductById(productDetails.parentProduct);
            
  //           if (parentProduct) {
  //             const parentShopifyId = parentProduct.shopifyId;
  //             const championQuantity = productDetails.championQuantity || 1;
  //             const quantityToRestore = product.quantity * championQuantity;
              
  //             // Update parent product inventory
  //             const updatedParent = await this.updateProductInventory(parentShopifyId as string, -quantityToRestore);
              
  //             logger.info(`Restocked parent product: ${parentShopifyId}, +${quantityToRestore} (${product.quantity} × ${championQuantity})`);
  //           }
  //         } else {
  //           // Regular product - restore its own inventory
  //           const updatedProduct = await this.updateProductInventory(product.shopifyId, -product.quantity);
            
  //           logger.info(`Restocked regular product: ${product.shopifyId}, +${product.quantity}`);
  //         }
  //       } catch (error: any) {
  //         // Log error but continue with other products
  //         logger.error(`Error restocking product ${product.shopifyId}: ${error.message}`);
  //       }
  //     }
      
  //     logger.info(`Inventory restocking completed for ${products.length} products`);
  //   } catch (error: any) {
  //     logger.error(`Error in restockProductsFromOrder: ${error.message}`);
  //     throw error;
  //   }
  // }
  public async restockProductsFromOrder(products: Array<any>): Promise<void> {
    try {
      logger.info(`Restocking inventory for ${products.length} products`);
      
      // Keep track of what we've already processed to avoid double-restocking
      const processedParentProducts = new Map();
      
      for (const product of products) {
        try {
          if (!product.shopifyId || !product.quantity) {
            logger.warn(`Skipping inventory restock for invalid product: ${JSON.stringify(product)}`);
            continue;
          }
          
          // Check if this is a champion product
          const productDetails = await this.getProductByShopifyId(product.shopifyId);
          
          if (!productDetails) {
            logger.warn(`Product not found for shopifyId: ${product.shopifyId}`);
            continue;
          }
          
          if ('parentProduct' in productDetails && productDetails.parentProduct) {
            // This is a champion product - restore inventory to parent
            const parentProduct = await this.getProductById(productDetails.parentProduct);
            
            if (!parentProduct) {
              logger.warn(`Parent product not found for champion: ${product.shopifyId}`);
              continue;
            }
            
            const parentShopifyId = parentProduct.shopifyId;
            
            // Skip parent products we've already processed in this batch
            const key = `${parentShopifyId}:${product.shopifyId}`;
            if (processedParentProducts.has(key)) {
              logger.info(`Skipping duplicate parent product ${parentShopifyId} for champion ${product.shopifyId}`);
              continue;
            }
            
            const championQuantity = productDetails.championQuantity || 1;
            const quantityToRestore = product.quantity * championQuantity;
            
            // Update parent product inventory (negative quantity = increase inventory)
            await this.updateProductInventory(parentShopifyId as string, -quantityToRestore);
            
            // Mark as processed
            processedParentProducts.set(key, true);
            
            logger.info(`Restocked parent product: ${parentShopifyId}, +${quantityToRestore} (${product.quantity} × ${championQuantity})`);
          } else {
            // Regular product - restore its own inventory
            await this.updateProductInventory(product.shopifyId, -product.quantity);
            
            logger.info(`Restocked regular product: ${product.shopifyId}, +${product.quantity}`);
          }
        } catch (error: any) {
          // Log error but continue with other products
          logger.error(`Error restocking product ${product.shopifyId}: ${error.message}`);
        }
      }
      
      logger.info(`Inventory restocking completed for ${products.length} products`);
    } catch (error: any) {
      logger.error(`Error in restockProductsFromOrder: ${error.message}`);
      throw error;
    }
  }


/**
 * Restock a specific product when processing partial refunds/returns
 */
public async restockSpecificProduct(shopifyId: string, quantity: number): Promise<void> {
  try {
    logger.debug(`Restocking specific product: ${shopifyId}, quantity: ${quantity}`);
    
    const productDetails = await this.getProductByShopifyId(shopifyId);
    
    if (!productDetails) {
      logger.warn(`Product not found for specific restocking: ${shopifyId}`);
      return;
    }
    
    // Check if it's a champion product
    if ('parentProduct' in productDetails && productDetails.parentProduct) {
      // Get the parent product
      const parentProduct = await this.getProductById(productDetails.parentProduct);
      
      if (parentProduct) {
        // Calculate effective quantity using championQuantity
        const championQuantity = productDetails.championQuantity || 1;
        const effectiveQuantity = quantity * championQuantity;
        
        // Restock parent product (negative quantity increases inventory)
        await this.updateProductInventory(
          parentProduct.shopifyId as string, 
          -effectiveQuantity
        );
        
        logger.info(`Restocked parent product: ${parentProduct.shopifyId}, +${effectiveQuantity} (${quantity} × ${championQuantity})`);
      } else {
        logger.warn(`Parent product not found for champion product: ${shopifyId}`);
      }
    } else {
      // Regular product - restock directly
      await this.updateProductInventory(shopifyId, -quantity);
      logger.info(`Restocked product: ${shopifyId}, +${quantity}`);
    }
  } catch (error: any) {
    logger.error(`Error in restockSpecificProduct: ${error.message}`);
    throw error;
  }
}

/**
 * Update a product's inventory
 * Positive quantity decreases inventory
 * Negative quantity increases inventory
 */
// public async updateProductInventory(productId: string, quantity: number): Promise<any> {
//   try {
//     // Skip if invalid inputs
//     if (!productId || quantity === 0) {
//       return null;
//     }
    
//     const product = await this.getProductByShopifyId(productId);
    
//     if (!product) {
//       logger.warn(`Product not found for shopifyId: ${productId}`);
//       return null;
//     }
    
//     // Skip inventory update for products with unlimited inventory
//     if (product.inventory === null || product.inventory === undefined) {
//       logger.info(`Skipping inventory update for product with unlimited inventory: ${productId}`);
//       return product;
//     }
    
//     // Calculate new inventory and sold quantity values
//     const currentInventory = product.inventory || 0;
//     const currentSoldQuantity = 'soldQuantity' in product ? product.soldQuantity || 0 : 0;
    
//     const newInventory = Math.max(0, currentInventory - quantity);
//     const newSoldQuantity = Math.max(0, currentSoldQuantity + quantity);
    
//     logger.info(`Updated inventory for ${productId}: ${newInventory}, sold quantity: ${newSoldQuantity}`);
    
//     // Update the product in database
//     const updatedProduct = await ProductsModel.findOneAndUpdate(
//       { shopifyId: productId },
//       { 
//         $set: { 
//           inventory: newInventory,
//           soldQuantity: newSoldQuantity 
//         } 
//       },
//       { new: true }
//     );
    
//     return updatedProduct;
//   } catch (error: any) {
//     logger.error(`Error updating product inventory for ${productId}: ${error.message}`);
//     throw error;
//   }
// }

public async updateProductInventory(productId: string, quantity: number): Promise<any> {
  try {
    if (!productId) {
      logger.warn(`Missing product ID for inventory update`);
      return null;
    }
    
    const product = await this.getProductByShopifyId(productId);
    
    if (!product) {
      logger.warn(`Product not found for shopifyId: ${productId}`);
      return null;
    }
    
    // Skip products with unlimited inventory
    if (product.inventory === null || product.inventory === undefined) {
      logger.info(`Skipping inventory update for product with unlimited inventory: ${productId}`);
      return product;
    }
    
    // Ensure we have valid numbers
    const currentInventory = Number(product.inventory) || 0;
    const currentSoldQuantity = 'soldQuantity' in product ? Number(product.soldQuantity) || 0 : 0;
    
    // Calculate new inventory and sold quantity
    // Note: negative quantity means we're increasing inventory (returns/refunds)
    const newInventory = Math.max(0, currentInventory - quantity); 
    const newSoldQuantity = Math.max(0, currentSoldQuantity + quantity);
    
    logger.info(`Updated inventory for ${productId}: ${newInventory}, sold quantity: ${newSoldQuantity}`);
    
    // Update in database
    return await ProductsModel.findOneAndUpdate(
      { shopifyId: productId },
      { 
        $set: { 
          inventory: newInventory,
          soldQuantity: newSoldQuantity
        } 
      },
      { new: true }
    );
  } catch (error: any) {
    logger.error(`Error updating product inventory for ${productId}: ${error.message}`);
    throw error;
  }
}

}
