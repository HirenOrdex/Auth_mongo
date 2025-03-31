import { ICategory, ICreateCategoryInput, IUpdateCategoryInput } from "../types/category.type";
import { CategoryModel } from "../models/category.model";
import logger from "../configs/winston.config";
import { BadgeRepository } from "./badge.repository";
import { IBadge } from "../types/badge.type";
import { GroupCollectionSalesModel } from "../models/groupCollectionSales.model";
import { ProductRepository } from "./product.repository";

const badgeRepository: BadgeRepository = new BadgeRepository();
const productRepository: ProductRepository = new ProductRepository();

export class CategoryRepository {
    constructor() { }

    public async createCategory(category: ICreateCategoryInput): Promise<ICategory | null> {
        try {
            const newCategory: ICategory | null = await CategoryModel.create(category);

            if (!newCategory) {
                return null
            }

            return newCategory;
        } catch (err: any) {
            console.error("createCategory: error while creating category", err?.message);
            logger.error(`createCategory: error while creating category ${err?.message}`);
            throw new Error(err?.message);
        }
    }

    public async updateCategory(id: string, category: IUpdateCategoryInput): Promise<ICategory | null> {
        try {
            if (!category || !id) {
                return null;
            }

            const updatedCategory: ICategory | null = await CategoryModel.findOneAndUpdate({ _id: id }, category, { new: true });

            if (!updatedCategory) {
                return null;
            }

            return updatedCategory;
        } catch (err: any) {
            console.error("createCategory: error while creating category", err?.message);
            logger.error(`createCategory: error while creating category ${err?.message}`);
            throw new Error(err?.message);
        }
    }

    public async deleteCategory(id: string): Promise<ICategory | null> {
        try {
            const deletedCategory: ICategory | null = await CategoryModel.findByIdAndUpdate(id, { isDeleted: true, active: false }, { new: true });

            if (!deletedCategory) {
                return null;
            }

            return deletedCategory;
        } catch (err: any) {
            console.error("createCategory: error while creating category", err?.message);
            logger.error(`createCategory: error while creating category ${err?.message}`);
            throw new Error(err?.message);
        }
    }

    public async getCategoryByKey(key: string, value: any, options?: any): Promise<ICategory | null> {
        try {

            if (!key || !value) {
                return null;
            }

            const category: ICategory | null = await CategoryModel.findOne({ [key]: value, isDeleted: false, ...options });

            if (!category) {
                return null;
            }

            return category;

        } catch (err: any) {
            console.error("createCategory: error while creating category", err?.message);
            logger.error(`createCategory: error while creating category ${err?.message}`);
            throw new Error(err?.message);
        }
    }

    public async getCategories(filters: { name: string | null, parentId: string | null, active: string | null, page: number, pageSize: number }): Promise<{
        category: ICategory[];
        totalCount: number;
        hasPreviousPage: boolean;
        hasNextPage: boolean;
    } | null> {
        try {

            const { name, parentId, active, page, pageSize } = filters;

            const query: any = {};

            if (name) query.name = { $regex: name, $options: 'i' };
            if (parentId) query.parentId = parentId;
            if (active) query.active = active ? active === "true" ? true : false : true;
            query.isDeleted = false;

            const skip = (page - 1) * pageSize;
            const limit = pageSize;

            const categories: ICategory[] | null = await CategoryModel.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }).exec();

            if (!categories) {
                return null;
            }

            const totalCount: number = await CategoryModel.countDocuments(query);

            return {
                category: categories,
                hasNextPage: skip + pageSize < totalCount,
                hasPreviousPage: skip > 0,
                totalCount,
            };

        } catch (err: any) {
            console.error("createCategory: error while creating category", err?.message);
            logger.error(`createCategory: error while creating category ${err?.message}`);
            throw new Error(err?.message);
        }
    }

    public async getCategoriesByParentId(parentId: string) {
        try {

            if (!parentId) {
                return null;
            }

            const categories: ICategory[] | null = await CategoryModel.find({ parentId, isDeleted: false });

            if (!categories) {
                return null;
            }

            return categories;

        } catch (err: any) {
            console.error("createCategory: error while creating category", err?.message);
            logger.error(`createCategory: error while creating category ${err?.message}`);
            throw new Error(err?.message);
        }
    }

    public async removeCategoryFromBadge(categoryId: string): Promise<boolean> {
        try {
            const badgeExists: IBadge | any = await badgeRepository.getBadgeByKey("categoryId", categoryId);

            if (!badgeExists) {
                return false;
            }

            if(badgeExists.assignType === "byCategory") {
                const updatedBadge = await badgeRepository.removeCategoryFromBadge(badgeExists._id?.toString());

                if (!updatedBadge) {
                    return false;
                }
                return true;
            } else {
                return false;
            }

        } catch (err: any) {
            console.error("BadgeRepository - removeCategoryFromBadge: error while removing badge from category", err);
            logger.error(`BadgeRepository - removeCategoryFromBadge: error while removing badge from category ${err?.message}`);
            throw new Error(err?.message);
        }
    }


    public async processOrderCategorySales(orderData: any): Promise<void> {
      try {
        logger.debug(`Processing category sales for order: ${orderData.orderId}`);
        
        if (!orderData.groupId) {
          logger.warn('No groupId provided, skipping group category sales update');
          return;
        }
        
        // Get product category details
        const productsWithCategories = await this.getProductCategoryDetails(orderData.products);
        logger.debug(`Retrieved category details for ${productsWithCategories.length} products`);
        
        // Group products by category and calculate totals
        const categorySales = productsWithCategories.reduce((acc: any, product: any) => {
          if (!product.categoryId) return acc;
          
          if (!acc[product.categoryId]) {
            acc[product.categoryId] = {
              totalAmount: 0,
              totalQuantity: 0
            };
          }
          
            // For champion products, use different calculation logic
            if (product.isChampion) {
              // Champion products use the single price value, not multiplied by quantity
              acc[product.categoryId].totalAmount += product.amount * product.quantity;
              
              // For quantity, if championQuantity exists, use it to calculate effective quantity
              if (product.championQuantity) {
                // Each champion product represents 'championQuantity' of the parent product
                acc[product.categoryId].totalQuantity += product.quantity * product.championQuantity;
              } else {
                // If no championQuantity, just add the quantity as is
                acc[product.categoryId].totalQuantity += product.quantity;
              }
            } else {
              // Regular products multiply amount by quantity
              acc[product.categoryId].totalAmount += product.amount * product.quantity;
              acc[product.categoryId].totalQuantity += product.quantity;
            }
          

          return acc;
        }, {});
        
        // Update sales metrics for each category
        const salesUpdatePromises = Object.entries(categorySales).map(
          async ([categoryId, sales]: [string, any]) => {
            try {
              const updatedSales = await GroupCollectionSalesModel.findOneAndUpdate(
                {
                  groupId: orderData.groupId,
                  categoryId: categoryId,
                },
                {
                  $inc: {
                    totalAmount: sales.totalAmount < 0 ? 0 : sales.totalAmount,
                    totalQuantity: sales.totalQuantity < 0 ? 0 : sales.totalAmount
                  },
                },
                { 
                  upsert: true,
                  new: true 
                }
              );
              
              logger.info(
                `Updated group category sales for group ${orderData.groupId}, category ${categoryId}: ` +
                `+${sales.totalAmount} amount, +${sales.totalQuantity} quantity`
              );
              
              return { success: true, categoryId, updatedSales };
            } catch (error: any) {
              logger.error(`Failed to update sales for category ${categoryId}: ${error.message}`);
              return { success: false, categoryId, error: error.message };
            }
          }
        );
        
        const results = await Promise.all(salesUpdatePromises);
        const successCount = results.filter(r => r.success).length;
        const failedCount = results.filter(r => !r.success).length;
        
        logger.info(`Category sales update summary: ${successCount} succeeded, ${failedCount} failed`);
      } catch (error: any) {
        logger.error(`Error processing order category sales: ${error.message}`);
        throw error;
      }
    }

      private async getProductCategoriesForOrder(products: any[]): Promise<any[]> {
        const promises = products.map(async (product: any) => {
          try {
            const productDetails = await productRepository.getProductByShopifyId(product.shopifyId);
            
            if (!productDetails) {
              return { ...product, categoryId: null };
            }
            
            // Handle champion products
            let categoryId = null;
            
            if ('parentProduct' in productDetails && productDetails.parentProduct) {
              // Get category from parent product
              const parentProduct = await productRepository.getProductById(productDetails.parentProduct);
              if (parentProduct && 'category' in parentProduct) {
                categoryId = parentProduct.category?.toString();
              }
            } else {
              // Regular product - use its own category
              categoryId = 'category' in productDetails ? productDetails.category?.toString() : null;
            }
            
            return { ...product, categoryId };
          } catch (error) {
            return { ...product, categoryId: null };
          }
        });
        
        return Promise.all(promises);
      }

      private calculateCategorySaleTotals(productsWithCategories: any[]): Record<string, any> {
        return productsWithCategories.reduce((acc: any, product: any) => {
          if (!product.categoryId) return acc;
          
          if (!acc[product.categoryId]) {
            acc[product.categoryId] = { totalAmount: 0, totalQuantity: 0 };
          }
          
          acc[product.categoryId].totalAmount += product.isChampion ? product.amount : product.amount * product.quantity;
          acc[product.categoryId].totalQuantity += product.quantity;
          
          return acc;
        }, {});
      }

      private async updateCategorySalesMetrics(
        groupId: string, 
        categorySales: Record<string, any>,
        orderDate: Date
      ): Promise<{success: number, failed: number}> {
        let success = 0, failed = 0;
        
        const promises = Object.entries(categorySales).map(async ([categoryId, sales]: [string, any]) => {
          try {
            await GroupCollectionSalesModel.findOneAndUpdate(
              {
                groupId,
                categoryId
              },
              {
                $inc: {
                  totalAmount: sales.totalAmount,
                  totalQuantity: sales.totalQuantity
                }
              },
              { upsert: true, new: true }
            );
            
            return true;
          } catch {
            return false;
          }
        });
        
        const results = await Promise.all(promises);
        success = results.filter(Boolean).length;
        failed = results.length - success;
        
        return { success, failed };
    }

    // public async getProductCategoryDetails(products: Array<any>): Promise<any[]> {
    //   try {
    //     logger.info(`Getting category details for ${products.length} products`);
        
    //     const productDetailsPromises = products.map(async (product) => {
    //       try {
    //         // Ensure our inputs are proper numbers to avoid NaN issues
    //         const quantity = Number(product.quantity) || 0;
    //         const amount = Number(product.amount) || 0;
            
    //         // If product already has category info and champion details, use them
    //         if (product.categoryId && (product.isChampion !== undefined)) {
    //           logger.info(`Using existing category data for product ${product.shopifyId}`);
    //           return {
    //             ...product,
    //             quantity,
    //             amount
    //           };
    //         }
            
    //         // Otherwise, look up product details
    //         const productDetails = await productRepository.getProductByShopifyId(product.shopifyId);
            
    //         if (!productDetails) {
    //           logger.warn(`Product not found for shopifyId: ${product.shopifyId}`);
    //           return {
    //             ...product,
    //             quantity,
    //             amount,
    //             categoryId: null,
    //             isChampion: false,
    //             championQuantity: 0
    //           };
    //         }
            
    //         // Check if this is a champion product
    //         let categoryId = null;
    //         let isChampion = false;
    //         let championQuantity = 0;
            
    //         if ('parentProduct' in productDetails && productDetails.parentProduct) {
    //           // It's a champion product - get category from parent
    //           isChampion = true;
    //           championQuantity = Number(productDetails.championQuantity) || 1;
              
    //           const parentProduct = await productRepository.getProductById(productDetails.parentProduct);
              
    //           if (parentProduct && 'category' in parentProduct) {
    //             categoryId = parentProduct.category?.toString();
    //             logger.info(`Using parent product category for champion product: ${product.shopifyId}, championQuantity: ${championQuantity}`);
    //           }
    //         } else {
    //           // Regular product - use its own category
    //           categoryId = 'category' in productDetails ? productDetails.category?.toString() : null;
    //         }
            
    //         logger.info(`Processed product ${product.shopifyId}: categoryId=${categoryId}, isChampion=${isChampion}, championQuantity=${championQuantity}, quantity=${quantity}`);
            
    //         return {
    //           shopifyId: product.shopifyId,
    //           quantity,
    //           amount,
    //           categoryId,
    //           isChampion,
    //           championQuantity
    //         };
    //       } catch (error: any) {
    //         logger.error(`Error getting product details for ${product.shopifyId}: ${error.message}`);
    //         return {
    //           shopifyId: product.shopifyId,
    //           quantity: Number(product.quantity) || 0,
    //           amount: Number(product.amount) || 0,
    //           categoryId: null,
    //           isChampion: false,
    //           championQuantity: 0
    //         };
    //       }
    //     });
        
    //     const results = await Promise.all(productDetailsPromises);
    //     logger.info(`Retrieved category details for ${results.length} products (${results.filter(p => p.isChampion).length} champion products)`);
        
    //     return results;
    //   } catch (error: any) {
    //     logger.error(`Error in getProductCategoryDetails: ${error.message}`);
    //     throw new Error(`Failed to get product category details: ${error.message}`);
    //   }
    // }

    public async getProductCategoryDetails(products: Array<any>): Promise<any[]> {
      try {
        logger.info(`Getting category details for ${products.length} products`);
        
        const productDetailsPromises = products.map(async (product) => {
          try {
            // Ensure our inputs are proper numbers to avoid NaN issues
            const quantity = Number(product.quantity) || 0;
            const amount = Number(product.amount) || 0;
            
            // If product already has category info and champion details, use them
            if (product.categoryId && (product.isChampion !== undefined)) {
              logger.info(`Using existing category data for product ${product.shopifyId}`);
              return {
                ...product,
                quantity,
                amount
              };
            }
            
            // Otherwise, look up product details
            const productDetails = await productRepository.getProductByShopifyId(product.shopifyId);
            
            if (!productDetails) {
              logger.warn(`Product not found for shopifyId: ${product.shopifyId}`);
              return {
                ...product,
                quantity,
                amount,
                categoryId: null,
                isChampion: false,
                championQuantity: 0
              };
            }
            
            // Check if this is a champion product
            let categoryId = null;
            let isChampion = false;
            let championQuantity = 0;
            
            if ('parentProduct' in productDetails && productDetails.parentProduct) {
              // It's a champion product - get category from parent
              isChampion = true;
              championQuantity = Number(productDetails.championQuantity) || 1;
              
              const parentProduct = await productRepository.getProductById(productDetails.parentProduct);
              
              if (parentProduct && 'category' in parentProduct) {
                categoryId = parentProduct.category?.toString();
                logger.info(`Using parent product category for champion product: ${product.shopifyId}, championQuantity: ${championQuantity}`);
              }
            } else {
              // Regular product - use its own category
              categoryId = 'category' in productDetails ? productDetails.category?.toString() : null;
            }
            
            logger.info(`Processed product ${product.shopifyId}: categoryId=${categoryId}, isChampion=${isChampion}, championQuantity=${championQuantity}, quantity=${quantity}`);
            
            return {
              ...product,
              quantity,
              amount,
              categoryId,
              isChampion,
              championQuantity
            };
          } catch (error: any) {
            logger.error(`Error getting product details for ${product.shopifyId}: ${error.message}`);
            return {
              ...product,
              quantity: Number(product.quantity) || 0,
              amount: Number(product.amount) || 0,
              categoryId: null,
              isChampion: false,
              championQuantity: 0
            };
          }
        });
        
        const results = await Promise.all(productDetailsPromises);
        
        // Log champion product counts
        const championCount = results.filter(p => p.isChampion).length;
        logger.info(`Retrieved category details for ${results.length} products (${championCount} champion products)`);
        
        return results;
      } catch (error: any) {
        logger.error(`Error in getProductCategoryDetails: ${error.message}`);
        throw new Error(`Failed to get product category details: ${error.message}`);
      }
    }

}