import mongoose, { Types } from "mongoose";
import logger from "../configs/winston.config";
import { BadgeModel } from "../models/badge.model";
import { IBadge, IBadgeFilter, ICreateBadge, IUpdateBadge } from "../types/badge.type";
import { OrderModel } from "../models/order.model";
import { GroupProductSaleModel } from "../models/groupProductSale.model";
import { GroupModel } from "../models/group.model";
import DonationModel from "../models/donation.model";


export class BadgeRepository {
    public async createBadge(body: ICreateBadge): Promise<IBadge | null> {
        try {

            const newBadge: IBadge | null | any = await BadgeModel.create(body);

            if (!newBadge) {
                logger.error(`BadgeRepository - createBadge: badge not created`);
                return null;
            }

            return newBadge;

        } catch (err: any) {
            console.error("BadgeRepository - createBadge: Error in createBadge: ", err);
            logger.error(`BadgeRepository - createBadge: Error in createBadge: ${err}`);
            throw new Error(err)
        }
    }

    public async getBadgeByKey(key: string, value: any, options?: any): Promise<IBadge | null> {
        try {
            const badge: IBadge | null = await BadgeModel.findOne({ [key]: value, isDeleted: false, ...options });

            if (!badge) {
                logger.error(`BadgeRepository - getBadgeByKey: badge not found`);
                return null;
            }

            return badge;
        } catch (err: any) {
            console.error(`BadgeRepository - getBadgeByKey: Error finding badge with ${key}=${value}:`, err);
            logger.error(`BadgeRepository - getBadgeByKey: Error finding badge with ${key}=${value}: ${err?.message}`);
            throw new Error(err);
        }
    }

    public async updateBadge(id: string, badge: IUpdateBadge): Promise<IBadge | null> {
        if (!badge) {
            return null;
        }

        try {
            // Get the existing badge to check current assignType
            const existingBadge = await BadgeModel.findById(id);
            if (!existingBadge) {
                logger.error(`BadgeRepository - updateBadge: badge not found`);
                return null;
            }

            console.log("Existing badge>>", existingBadge)

            // Handle assignType change
            if (badge?.assignType === "byGroup") {
                badge.categoryId = null;
                badge.amountNeeded = null;
                badge.categoryQty = null;
                badge.productId = null
            } else if (badge?.assignType === "byCategory") {
                // badge.startDate = null; 
                // badge.endDate = null;
                badge.targetRevenueAmount = null;
                badge.productId = null
            } else if (badge?.assignType === "byOfflineProduct") {
                badge.categoryId = null;
                badge.amountNeeded = null;
                badge.categoryQty = null;
            }

            // Update the badge
            const updatedBadge: IBadge | null = await BadgeModel.findOneAndUpdate(
                { _id: id },
                badge,
                { new: true }
            );

            console.log("Updated>>", updatedBadge);
            if (!updatedBadge) {
                logger.error(`BadgeRepository - updateBadge: badge not updated`);
                return null;
            }

            return updatedBadge;
        } catch (err: any) {
            console.error(`BadgeRepository - updateBadge: Error updating badge ${id}:`, err);
            logger.error(`BadgeRepository - updateBadge: Error updating badge ${id}: ${err?.message}`);
            throw new Error(err);
        }
    }

    public async deleteBadge(id: string): Promise<IBadge | null> {
        try {
            const badge: IBadge | null = await BadgeModel.findByIdAndUpdate(id, { isDeleted: true }, { new: true });

            if (!badge) {
                logger.error(`BadgeRepository - deleteBadge: badge not deleted`);
                return null;
            }

            return badge;
        } catch (err: any) {
            console.error(`BadgeRepository - deleteBadge: Error deleting badge ${id}:`, err);
            logger.error(`BadgeRepository - deleteBadge: Error deleting badge ${id}: ${err?.message}`);
            throw new Error(err);
        }
    }

    public async getBadges(filters: IBadgeFilter): Promise<{ badges: IBadge[], totalCount: number, hasNextPage: boolean, hasPreviousPage: boolean } | null> {

        const { pageNo, pageSize = 10, name, badgeType, minPoints, maxPoints, minAmount, maxAmount }: IBadgeFilter = filters;

        try {

            const query: any = {};

            if (name) query.name = { $regex: name, $options: 'i' };
            if (badgeType) query.type = { $regex: badgeType, $options: 'i' };

            if (minPoints) query.pointsNeeded = { $gte: minPoints };
            if (maxPoints) query.pointsNeeded = { ...query?.pointsNeeded, $lte: maxPoints };
            if (minAmount) query.amountNeeded = { $gte: minAmount };
            if (maxAmount) query.amountNeeded = { ...query?.amountNeeded, $lte: maxAmount };
            query.isDeleted = false;

            const limit = pageSize;
            const skip = (pageNo - 1) * pageSize;

            console.log("query", query);

            // const badges: IBadge[] | null | any = await BadgeModel.find(query).populate("_id name").skip(skip).limit(limit).sort({ createdAt: -1 }).exec();

            // const badges: IBadge[] | null = await BadgeModel.aggregate([
            //     {
            //         $match: { ...query }
            //     },
            //     {
            //         $lookup: {
            //             from: "categories",
            //             localField: "categoryId",
            //             foreignField: "_id",
            //             as: "category",
            //             pipeline: [
            //                 {
            //                     $project: {
            //                         _id: 1,
            //                         name: 1,
            //                     }
            //                 }
            //             ]
            //         }
            //     },
            //     {
            //         $addFields: {
            //             category: { $arrayElemAt: ["$category", 0] } // Extract first element if exists
            //         }
            //     },
            //     {
            //         $sort: { createdAt: -1 }
            //     },
            //     {
            //         $skip: skip
            //     },
            //     {
            //         $limit: limit
            //     }
            // ]);
            const badges: IBadge[] | null = await BadgeModel.aggregate([
                {
                    $match: { ...query }
                },
                {
                    $lookup: {
                        from: "categories",
                        localField: "categoryId",
                        foreignField: "_id",
                        as: "category",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                }
                            }
                        ]
                    }
                },
                {
                    $addFields: {
                        category: { $arrayElemAt: ["$category", 0] } // Extract first element if exists
                    }
                },
                {
                    $lookup: {
                        from: "offlineproducts",   // Lookup from the offlineProduct collection
                        localField: "productId",  // Match based on productId
                        foreignField: "_id",      // Foreign field in the offlineProduct collection
                        as: "offlineProductName",
                        pipeline: [
                            {
                                $project: {
                                    _id: 0,
                                    name: 1,
                                }
                            }
                        ]
                    }
                },
                {
                    $addFields: {
                        offlineProduct: { $arrayElemAt: ["$offlineProductName.name", 0] } // Extract first element if exists
                    }
                },
                {
                    $sort: { createdAt: -1 }
                },
                {
                    $project: {
                        offlineProductName: 0
                    }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]);

            const totalCount = await BadgeModel.countDocuments(query);

            return {
                badges,
                totalCount,
                hasNextPage: skip + pageSize < totalCount,
                hasPreviousPage: skip > 0,
            }

        } catch (err: any) {
            console.error(`BadgeRepository - getBadges: Error fetching badges with filters:`, err);
            logger.error(`BadgeRepository - getBadges: Error fetching badges with filters: ${err?.message}`);
            throw new Error(err);
        }

    }

    public async removeCategoryFromBadge(badgeId: string): Promise<boolean> {
        try {
            const badge: IBadge | null = await BadgeModel.findByIdAndUpdate(badgeId, { categoryId: null, assignType: null, categoryQty: null, amountNeeded: null }, { new: true });

            if (!badge) {
                logger.error(`BadgeRepository - removeCategoryFromBadge: category not removed from badge`);
                return false;
            }

            return true;
        } catch (err: any) {
            console.error(`BadgeRepository - removeCategoryFromBadge: Error removing category from badge ${badgeId}:`, err);
            logger.error(`BadgeRepository - removeCategoryFromBadge: Error removing category from badge ${badgeId}: ${err?.message}`);
            throw new Error(err);
        }
    }

     /**
   * Get badges eligible for criteria-based assignment
   */
  public async getEligibleBadges(): Promise<any[]> {
    try {
      return await BadgeModel.find({
        isDeleted: false,
        $or: [
          { assignType: "byCategory", categoryId: { $ne: null }, amountNeeded: { $gt: 0 } },
          { assignType: "byCategory", categoryId: { $ne: null }, categoryQty: { $gt: 0 } },
          { assignType: "byOfflineProduct", productId: { $ne: null }, targetRevenueAmount: { $gt: 0 } },
          { assignType: "byGroup",  targetRevenueAmount: { $gt: 0 } }   
        ]
      });
    } catch (error: any) {
      logger.error(`Error fetching eligible badges: ${error.message}`);
      return [];
    }
  }


  /**
   * Check if a group has met sales criteria for a category
   */
  public async checkCategorySalesCriteria(
    groupId: mongoose.Types.ObjectId,
    categoryId: mongoose.Types.ObjectId,
    targetAmount?: number | null,
    targetQty?: number | null,
    startDate?: Date | null,
    endDate?: Date | null
  ): Promise<boolean> {
    try {
      // Create date filters for the query
      const dateFilter: any = {};
      if (startDate) dateFilter.orderDate = { $gte: startDate };
      if (endDate) {
        dateFilter.orderDate = { ...dateFilter?.orderDate, $lte: endDate };
      }

      // Query orders from the specified group within date range
      const ordersWithCategorySales = await OrderModel.aggregate([
        { 
          $match: { 
            groupId: new mongoose.Types.ObjectId(groupId),
            orderStatus: { $ne: "cancelled" },
            ...dateFilter
          } 
        },
        // Unwind products to process each individually
        { $unwind: "$products" },
        // Lookup product details to get category
        {
          $lookup: {
            from: "products",
            let: { shopifyId: "$products.shopifyId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$shopifyId", "$$shopifyId"] }
                }
              }
            ],
            as: "productInfo"
          }
        },
        // Handle champion products - lookup parent product if applicable
        {
          $addFields: {
            productInfo: { $arrayElemAt: ["$productInfo", 0] }
          }
        },
        {
          $lookup: {
            from: "products",
            let: { parentProductId: "$productInfo.parentProduct" },
            pipeline: [
              {
                $match: {
                  $expr: { 
                    $and: [
                      { $ne: ["$$parentProductId", null] },
                      { $eq: ["$_id", "$$parentProductId"] }
                    ]
                  }
                }
              }
            ],
            as: "parentProductInfo"
          }
        },
        // Determine the effective category (either from product or parent product)
        {
          $addFields: {
            effectiveProductCategoryId: {
              $cond: {
                if: { $gt: [{ $size: "$parentProductInfo" }, 0] },
                then: { $toString: { $arrayElemAt: ["$parentProductInfo.category", 0] } },
                else: { $toString: { $ifNull: ["$productInfo.category", ""] } }
              }
            }
          }
        },
        // Filter for the specific category we're checking
        {
          $match: {
            effectiveProductCategoryId: categoryId.toString()
          }
        },
        // Calculate totals for this category
        {
          $group: {
            _id: null,
            totalAmount: { 
              $sum: { 
                $subtract: [
                  { $multiply: ["$products.amount", "$products.quantity"] }, 
                  { $ifNull: ["$reverseAmount", 0] } 
                ] 
              } 
            },
            totalQuantity: { 
              $sum: { 
                $subtract: [
                  { 
                    $cond: { 
                      if: "$products.isChampion", 
                      then: { $multiply: ["$products.quantity", "$products.championQuantity"] }, 
                      else: "$products.quantity" 
                    } 
                  }, 
                  { $ifNull: ["$reverseQuantity", 0] } 
                ] 
              } 
            }
          }
        }
      ]);

      // If no matching orders found, criteria not met
      if (!ordersWithCategorySales.length) {
        return false;
      }

      const { totalAmount, totalQuantity } = ordersWithCategorySales[0];

      // Debug log
      logger.debug(
        `Group ${groupId} category ${categoryId} sales - Amount: ${totalAmount}, Qty: ${totalQuantity}, ` + 
        `Target Amount: ${targetAmount}, Target Qty: ${targetQty}, ` +
        `Date range: ${startDate?.toISOString() || 'any'} to ${endDate?.toISOString() || 'now'}`
      );

      // Check if target thresholds are met
      if (targetAmount && totalAmount >= targetAmount) {
        logger.info(`Group ${groupId} met amount criteria for category ${categoryId}: ${totalAmount} >= ${targetAmount}`);
        return true;
      }
      
      if (targetQty && totalQuantity >= targetQty) {
        logger.info(`Group ${groupId} met quantity criteria for category ${categoryId}: ${totalQuantity} >= ${targetQty}`);
        return true;
      }

      return false;
    } catch (error: any) {
      logger.error(`Error checking category sales criteria: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a group has met sales criteria for an offline product
   */
  public async checkOfflineProductSalesCriteria(
    groupId: mongoose.Types.ObjectId,
    productId: mongoose.Types.ObjectId,
    targetAmount?: number | null,
    startDate?: Date | null,
    endDate?: Date | null
  ): Promise<boolean> {
    try {
      // Create date filter
      const dateFilter: any = {};
      if (startDate && endDate) {
        dateFilter.$or = [
          { createdAt: { $gte: startDate, $lte: endDate } },
          { updatedAt: { $gte: startDate, $lte: endDate } }
        ];
      }
    
      
      // Get offline product sales within date range
      const offlineSales = await GroupProductSaleModel.aggregate([
        { 
          $match: { 
            groupId: new mongoose.Types.ObjectId(groupId),
            productId: new mongoose.Types.ObjectId(productId),
            isDeleted: false,
            active:true,
            ...dateFilter
          } 
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
            totalQuantity: { $sum: "$quantity" }
          }
        }
      ]);
      
      // Also get online sales of this product via orders
      const orderDateFilter: any = {};
      if (startDate) orderDateFilter.orderDate = { $gte: startDate };
      if (endDate) {
        orderDateFilter.orderDate = { ...orderDateFilter?.orderDate, $lte: endDate };
      }
      
      // Find orders containing this product
      const onlineSales = await OrderModel.aggregate([
        { 
          $match: { 
            groupId: new mongoose.Types.ObjectId(groupId),
            orderStatus: { $ne: "cancelled" },
            ...orderDateFilter
          } 
        },
        // Unwind products to process each individually
        { $unwind: "$products" },
        // Lookup product details 
        {
          $lookup: {
            from: "products",
            let: { shopifyId: "$products.shopifyId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$shopifyId", "$$shopifyId"] }
                }
              },
              {
                $lookup: {
                  from: "offlineproducts", 
                  localField: "offlineProductId",
                  foreignField: "_id",
                  as: "offlineInfo"
                }
              },
              {
                $match: {
                  $expr: { 
                    $eq: [
                      { $arrayElemAt: ["$offlineInfo._id", 0] }, 
                      new mongoose.Types.ObjectId(productId)
                    ] 
                  }
                }
              }
            ],
            as: "productMatches"
          }
        },
        // Keep only products that match our target
        { $match: { "productMatches.0": { $exists: true } } },
        // Calculate totals
        {
          $group: {
            _id: null,
            totalAmount: { $sum: { $multiply: ["$products.amount", "$products.quantity"] } },
            totalQuantity: { $sum: "$products.quantity" }
          }
        }
      ]);
      
      // Combine totals from both sources
      const totalAmount = 
        (offlineSales.length ? offlineSales[0].totalAmount : 0) +
        (onlineSales.length ? onlineSales[0].totalAmount : 0);
        
      const totalQuantity = 
        (offlineSales.length ? offlineSales[0].totalQuantity : 0) +
        (onlineSales.length ? onlineSales[0].totalQuantity : 0);
      
      // Debug log
      logger.debug(
        `Group ${groupId} offline product ${productId} sales - Amount: ${totalAmount}, Qty: ${totalQuantity}, ` + 
        `Target Amount: ${targetAmount}, Target Qty: 000, ` +
        `Date range: ${startDate?.toISOString() || 'any'} to ${endDate?.toISOString() || 'now'}`
      );
      
      // Check if criteria are met
      if (targetAmount && totalAmount >= targetAmount) {
        logger.info(`Group ${groupId} met amount criteria for offline product ${productId}: ${totalAmount} >= ${targetAmount}`);
        return true;
      }
      
    //   if (targetQty && totalQuantity >= targetQty) {
    //     logger.info(`Group ${groupId} met quantity criteria for offline product ${productId}: ${totalQuantity} >= ${targetQty}`);
    //     return true;
    //   }
      
      return false;
    } catch (error: any) {
      logger.error(`Error checking offline product sales criteria: ${error.message}`);
      return false;
    }
  }

  public async checkGroupSalesCriteria(groupId: mongoose.Types.ObjectId, targetRevenueAmount: number, startDate: Date | null, endDate: Date | null): Promise<boolean> {
    try {

      let dateFilter: any = {};
      if(startDate!== null && endDate !== null && startDate !== undefined && endDate !== undefined){
         dateFilter = {
          orderDate: { $gte: startDate, $lte: endDate }
        };

      }

      // Get total revenue for the group within the date range
      const orderRevenue = await OrderModel.aggregate([
        {
          $match: {
            groupId: groupId,
            orderStatus: { $ne: "cancelled" },
            ...dateFilter
          }
        },
        {
          $group: {
            _id: null,
            orderRevenue: {
              $sum: {
                $subtract: [
                  "$subtotalAmount",
                  { $ifNull: ["$reverseAmount", 0] }
                ]
              }
            }
          }
        }
      ]);
      
      // Second pipeline: Get donation revenue
      const donationRevenue = await DonationModel.aggregate([
        {
          $match: {
            groupId: new mongoose.Types.ObjectId(groupId),
          }
        },
        {
          $group: {
            _id: null,
            donationRevenue: { $sum: "$donationAmount" }
          }
        }
      ]);
      
      // Calculate combined revenue
      const orderRevenueTotal = orderRevenue.length > 0 ? orderRevenue[0].orderRevenue : 0;
      const donationRevenueTotal = donationRevenue.length > 0 ? donationRevenue[0].donationRevenue : 0;
      const totalRevenue = orderRevenueTotal + donationRevenueTotal;
      
      // Check if the group has met the revenue target
      if (totalRevenue >= targetRevenueAmount) {
        logger.info(`Group ${groupId} met revenue criteria: ${totalRevenue} >= ${targetRevenueAmount}`);
        return true;
      }
      
      return false;
    } catch (error: any) {
      logger.error(`Error checking group sales criteria: ${error.message}`);
      return false;
    }
  }

  public async expireBadge(badgeId: string | Types.ObjectId): Promise<boolean> {
    try {
      const badge = await BadgeModel.findByIdAndUpdate(badgeId, { isExpired: true }, { new: true });

      if (!badge) {
        logger.error(`BadgeRepository - expireBadge: badge not expired`);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error(`BadgeRepository - expireBadge: Error expiring badge ${badgeId}:`, err);
      logger.error(`BadgeRepository - expireBadge: Error expiring badge ${badgeId}: ${err?.message}`);
      return false;
    }
  }

  //CC
  public async unAssignBadge(groupId: string | Types.ObjectId, badgeId: string | Types.ObjectId): Promise<void> {
    try {
      // Update the badge status to "locked" instead of removing it
      const result = await GroupModel.updateOne(
        { 
          _id: groupId, 
          isDeleted: false,
          "badges.badgeId": new Types.ObjectId(badgeId) 
        },
        { $set: { "badges.$.status": "locked" } }
      );
  
      if (result.matchedCount === 0) {
        logger.info(`Badge ${badgeId} not found in group ${groupId}`);
      } else if (result.modifiedCount > 0) {
        logger.info(`Badge ${badgeId} status updated to locked for group ${groupId}`);
      } else {
        logger.info(`Badge ${badgeId} was already locked for group ${groupId}`);
      }
    } catch (error: any) {
      console.error("Error updating badge status:", error?.message);
      logger.error(`Error updating badge status for badge ${badgeId} in group ${groupId}: ${error?.message}`);
    }
  }

  private parseBadgeDate(dateString: string | null | undefined): Date | null {
    if (!dateString) return null;
    
    try {
      // Split MM-DD-YYYY format
      const [month, day, year] = dateString.split('-').map(Number);
      
      // JavaScript months are 0-indexed (0=Jan, 11=Dec)
      const date = new Date(year, month - 1, day);
      return date;
    } catch (error) {
      logger.error(`Failed to parse badge date: ${dateString}`);
      return null;
    }
  }

  public async handleShopifyOrderUpdateForBadge(groupId: string | Types.ObjectId): Promise<void> {
    try {
        
        const groupWithBadges = await GroupModel.aggregate([
          { 
            $match: { 
              _id: new mongoose.Types.ObjectId(groupId), 
              isDeleted: false 
            } 
          },
          {
            $project: {
              _id: 1,
              badgeIds: {
                $map: {
                  input: { $ifNull: ["$badges", []] },  // Provide empty array as default
                  as: "badge",
                  in: {
                    $toObjectId: { $toString: "$$badge.badgeId" }
                  }
                }
              }
            }
          }
        ]);
        
        if (!groupWithBadges || groupWithBadges.length === 0) return;
        
        // Get directly from the aggregate result - already in correct format
        const group = groupWithBadges[0]
        const badgeIds = groupWithBadges[0].badgeIds;
        
        // Fetch full badge objects from DB - no need for additional conversion
        const badges: any = await BadgeModel.find({ _id: { $in: badgeIds } });

        
        
        for (const badge of badges) {
            let criteriaMet = false;
            let startDate: Date | null = null;
            let endDate: Date | null = null;
    
            if(badge?.startDate!== null && badge?.endDate !== null && badge?.startDate !== undefined && badge?.endDate !== undefined){
               startDate = this.parseBadgeDate(badge?.startDate);
               endDate = this.parseBadgeDate(badge?.endDate);
  
            }
        
            switch (badge.assignType) {
                case "byCategory":
                    criteriaMet = await this.checkCategorySalesCriteria(
                        group._id,
                        badge.categoryId,
                        badge.amountNeeded,
                        badge.categoryQty
                    );
                    break;
        
                case "byOfflineProduct":
                    criteriaMet = await this.checkOfflineProductSalesCriteria(
                        group._id,
                        badge.productId,
                        badge.targetRevenueAmount
                    );
                    break;
        
                case "byGroup":
                    criteriaMet = await this.checkGroupSalesCriteria(
                        group._id,
                        badge.targetRevenueAmount,
                        startDate,
                        endDate
                    );
                    break;
            }
        
            if (!criteriaMet) {
              console.log("Unassigning badge", badge._id);
                await this.unAssignBadge(group._id, badge._id);
            }
        }
        
    } catch (error:any) {
        console.error("Error processing Shopify order update:", error?.message);
    }
}

public async getDefaultBadges(): Promise<{
  badgeId: mongoose.Types.ObjectId;
  status: 'locked' | 'unlocked';
}[]> {
  try{
    // get all badges and format them to just send in the grp badge array
    const badges = await BadgeModel.find({ isDeleted: false });

    if(!badges){
      logger.error(`BadgeRepository - getDefaultBadges: No default badges found`);
      return [];
    }

    const groupFormattedBagdes = badges.map(badge => {
      return {
        badgeId: new mongoose.Types.ObjectId(badge._id),
        status: "locked" as 'locked' | 'unlocked'
      }
    });

    return groupFormattedBagdes;

  }catch(err: any){
    logger.error(`BadgeRepository - getDefaultBadges: Error fetching default badges: ${err?.message}`);
    console.error("BadgeRepository - getDefaultBadges: Error fetching default badges: ", err);
    throw new Error(err);
  }
}

}
