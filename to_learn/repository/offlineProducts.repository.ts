import logger from "../configs/winston.config";
import { GroupProductSaleModel } from "../models/groupProductSale.model";
import { OfflineProductsModel } from "../models/offlineProducts.model";

export class OfflineProductRepository {
  public async createOfflineProduct(productData: {
    name: string;
    image: string[];
  }): Promise<any | null> {
    try {
      const product = await OfflineProductsModel.create(productData);

      if (!product) {
        return null;
      }

      return product;
    } catch (err: any) {
      logger.error(`Error in createOfflineProduct repository: ${err?.message}`);
      throw new Error(err?.message);
    }
  }

  public async updateOfflineProduct(
    productId: string,
    productData: { name: string; image: string[] }
  ): Promise<any | null> {
    try {
      const product = await OfflineProductsModel.findByIdAndUpdate(
        productId,
        productData,
        { new: true }
      );

      if (!product) {
        return null;
      }

      return product;
    } catch (err: any) {
      logger.error(`Error in updateOfflineProduct repository: ${err?.message}`);
      throw new Error(err?.message);
    }
  }

  public async getOfflineProducts(): Promise<any | null> {
    try {
      const products = await OfflineProductsModel.find({ isDeleted: false });

      if (!products) {
        return null;
      }

      return products;
    } catch (err: any) {
      logger.error(`Error in getOfflineProducts repository: ${err?.message}`);
      throw new Error(err?.message);
    }
  }

  public async getOfflineProductById(productId: string): Promise<any | null> {
    try {
      const product = await OfflineProductsModel.findOne({
        _id: productId,
        isDeleted: false,
      });

      if (!product) {
        return null;
      }

      return product;
    } catch (err: any) {
      logger.error(`Error in getOfflineProductById repository: ${err?.message}`);
      throw new Error(err?.message);
    }
  }

  public async getAllOfflineProducts(filters: {
    pageNo: number | any;
    pageSize: number | any;
    name: string | null;
  }): Promise<any | null> {
    try {
      const { pageNo, pageSize, name } = filters;

      const query: any = {
        isDeleted: false,
      };

      if (name) {
        query["name"] = { $regex: name, $options: "i" };
      }

      let skip = pageSize * (pageNo - 1);
      let limit = pageSize;

      const products = await OfflineProductsModel.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec();

      if (!products) {
        return null;
      }

      return products;
    } catch (err: any) {
      logger.error(`Error in getAllOfflineProducts repository: ${err?.message}`);
      throw new Error(err?.message);
    }
  }

    public async deleteOfflineProduct(productId: string): Promise<any | null> {
        try {
        const product = await OfflineProductsModel.findByIdAndUpdate( productId, { isDeleted: true }, { new: true });

        if (!product) {
            return null;
        }

        return product;
        } catch (err: any) {
        logger.error(`Error in deleteOfflineProduct repository: ${err?.message}`);
        throw new Error(err?.message);
        }
    }

    public async manageGroupOfflineProductSale(groupId: string,productSaleData: any): Promise<any | null> {
        if (!groupId) {
            return null;
        }

        try {
            // Get existing product sales for this group
            const existingGroupProducts = await GroupProductSaleModel.find({ 
                groupId, 
                isDeleted: false 
            }).lean();
    
            // Create a map of existing products for easy lookup
            const existingProductMap = new Map(
                existingGroupProducts.map(product => [product?.productId?.toString(), product])
            );
            
            // Track which product IDs are in the incoming data
            const incomingProductIds = new Set(
                productSaleData.map((product: any) => product?.productId)
            );
            
            // Prepare bulk operations
            const bulkOps: any[] = [];
            
            // Process each product in the incoming data
            for (const product of productSaleData) {
                // Skip invalid products
                if (!product.productId) continue;
                
                // Verify the product exists
                const offlineProduct = await OfflineProductsModel.exists({ 
                    _id: product.productId,
                    isDeleted: false 
                });
                
                if (!offlineProduct) {
                    logger.warn(`Skipping non-existent product: ${product.productId}`);
                    continue;
                }
                
                const existingProduct = existingProductMap.get(product.productId);
                
                if (existingProduct) {
                    // Update operation
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: existingProduct._id },
                            update: { 
                                $set: { 
                                    amount: product.amount,
                                    active: product.active,
                                    updatedAt: new Date()
                                }
                            }
                        }
                    });
                } else {
                    // Create operation
                    bulkOps.push({
                        insertOne: {
                            document: {
                                groupId,
                                productId: product.productId,
                                amount: product.amount,
                                active: product.active,
                                isDeleted: false,
                                createdAt: new Date(),
                                updatedAt: new Date()
                            }
                        }
                    });
                }
            }
            
            // Handle deletions - any existing product not in incoming data
            for (const [productId, product] of existingProductMap.entries()) {
                if (!incomingProductIds.has(productId)) {
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: product._id },
                            update: { 
                                $set: { 
                                    isDeleted: true,
                                    updatedAt: new Date() 
                                }
                            }
                        }
                    });
                }
            }
            
            // Execute all operations at once if there are any
            if (bulkOps.length > 0) {
                try{
                    await GroupProductSaleModel.bulkWrite(bulkOps);
                } catch (err: any) {
                    logger.error(`Error in manageGroupOfflineProductSale repository: ${err?.message}`);
                    throw new Error(err?.message);
                }
            }
            
        } catch (err: any) {
            logger.error(`Error in manageGroupOfflineProductSale repository: ${err?.message}`);
            throw new Error(err?.message);
        }
    }

    public async removeGroupOfflineProductSaleByProduct(productId: string): Promise<any | null> {
        try {
            const productSale = await GroupProductSaleModel.findOneAndUpdate({ productId, isDeleted: false }, { isDeleted: true }, { new: true });

            if (!productSale) {
                return null;
            }

            return productSale;
        } catch (err: any) {
            logger.error(`Error in removeGroupOfflineProductSaleByProduct repository: ${err?.message}`);
            throw new Error(err?.message);
        }
    }

    public async removeOfflineProductSaleByGroup(groupId: string): Promise<any | null> {
        try {
            const productSale = await GroupProductSaleModel.updateMany({ groupId, isDeleted: false }, { isDeleted: true });

            if (!productSale) {
                return null;
            }

            return productSale;
        } catch (err: any) {
            logger.error(`Error in removeOfflineProductSaleByGroup repository: ${err?.message}`);
            throw new Error(err?.message);
        }
    }
}
