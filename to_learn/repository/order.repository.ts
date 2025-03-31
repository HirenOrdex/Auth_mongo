import logger from "../configs/winston.config";
import { OrderController } from "../controllers/order.controller";
import { GroupCollectionSalesModel } from "../models/groupCollectionSales.model";
import { OrderModel } from "../models/order.model";
import { ShopifyService } from "../services/shopify.service";

import {CreateOrderInput,IOrder,UpdateOrderInput} from "../types/order.type";
import { IProduct } from "../types/product.type";
import { CategoryRepository } from "./category.repository";
import { ProductRepository } from "./product.repository";

const shopifyService:ShopifyService = new ShopifyService();
const productRepository:ProductRepository = new ProductRepository();
const categoryRepository:CategoryRepository = new CategoryRepository();

export class OrderRepository{
    public async createOrder(orderData:any):Promise<any|null>{
        try{
            const order = await OrderModel.create(orderData);
            if(!order){
                return null;
            }
            return order;
        }catch(err:any){
            console.error(`OrderRepository - createOrder: Internal server error ${err}`);
            logger.error(`OrderRepository - createOrder: Internal server error ${err}`);
            throw new Error(err?.message);
        }
    }

    public async updateOrder(orderId:string,orderData:UpdateOrderInput):Promise<any|null>{
        try{
            const order = await OrderModel.findByIdAndUpdate(orderId,orderData,{new:true});
            if(!order){
                return null;
            }
            return order;
        }catch(err:any){
            console.error(`OrderRepository - updateOrder: Internal server error ${err}`);
            logger.error(`OrderRepository - updateOrder: Internal server error ${err}`);
            throw new Error(err?.message);
        }
    }


    public async prepareOrderData({ order, customer, donationAmount }: {
      order: any;
      customer: any;
      donationAmount: number;
  }): Promise<any> {
      try {

          // Add this code right here, at the start of the try block
          const orderId = order?.id?.toString();
          
          // Check if order already exists to prevent duplicates
          const existingOrder = await this.getOrderByShopifyId(orderId);
          if (existingOrder) {
              logger.warn(`Order ${orderId} already exists in database, skipping preparation`);
              return existingOrder;
          }

          logger.debug(`Preparing order data for Shopify order: ${order?.id}`);
          
          // Calculate order totals excluding donation
          const totalAmount = parseFloat(order?.total_price || "0") - donationAmount;
          const subtotalAmount = parseFloat(order?.subtotal_price || "0") - donationAmount;
  
          // Get order metafields
          const orderMetafields = await shopifyService.getOrderMetafeilds(order?.admin_graphql_api_id);
          logger.debug(`Retrieved ${orderMetafields?.length || 0} metafields for order ${order?.id}`);
  
          const scoValue = orderMetafields?.find((meta: any) => meta.key === 'sco')?.value?.trim() || '';
          const youthName = orderMetafields?.find((meta: any) => meta.key === 'youth_name')?.value?.trim() || '';
          const donation_from = orderMetafields?.find((meta: any) => meta.key === 'Donation_From')?.value?.trim() || '';
  
          // Process line items and handle champion products properly
          const processedProducts: any[] = [];
          let actualItemCount = 0;
  
          await Promise.all(order?.line_items?.map(async (item: any) => {
              const shopifyId = item?.product_id?.toString();
              if (!shopifyId) return;
              
              const purchaseQuantity = item?.quantity || 0;
              const price = parseFloat(item?.price || "0");
              actualItemCount += purchaseQuantity;
              
              // Check if this is a champion product
              const product = await productRepository.getProductByShopifyId(`gid://shopify/Product/${shopifyId}`);
              
              if (product && 'parentProduct' in product && product.championQuantity) {
                  // Handle champion product
                  const parentObjectId = product.parentProduct;
                  const parentProduct = await productRepository.getProductById(parentObjectId);
                  
                  if (!parentProduct) {
                      logger.error(`Parent product not found for champion product ${shopifyId}`);
                      return;
                  }
  
                  // Add champion product with correct quantity
                  processedProducts.push({
                      shopifyId: `gid://shopify/Product/${shopifyId}`,
                      quantity: purchaseQuantity,
                      amount: price,
                      isChampion: true,
                      championQuantity: product.championQuantity || 1,
                      parentShopifyId: parentProduct.shopifyId
                  });

                  logger.debug(`Added champion product: ${shopifyId}, quantity: ${purchaseQuantity}`);
              } else {
                  // Regular product
                  processedProducts.push({
                      shopifyId: `gid://shopify/Product/${shopifyId}`,
                      quantity: purchaseQuantity,
                      amount: price,
                      isChampion: false
                  });

                  logger.debug(`Added regular product: ${shopifyId}, quantity: ${purchaseQuantity}`);
              }
          }));
          
          logger.debug(`Processed ${processedProducts.length} products for order ${order?.id}`);
          
          // Calculate total quantity correctly
          const totalQuantity = actualItemCount;
          
          const preparedData = {
              orderId: order?.id?.toString(),
              orderNumber: order?.name,
              totalQuantity,
              totalAmount,
              subtotalAmount,
              taxAmount: parseFloat(order?.total_tax || "0"),
              taxesIncluded: order?.taxes_included || false,
              products: processedProducts,
              orderStatus: order?.cancelled_at ? "cancelled" : "ordered",
              financialStatus: order?.financial_status || "pending",
              fulfillmentStatus: order?.fulfillment_status || "unfulfilled",
              orderDate: order?.created_at ? new Date(order.created_at) : new Date(),
              customerId: customer._id,
              shippingCost: parseFloat(order?.shipping_lines?.[0]?.price || "0"),
              shippingType: order?.shipping_lines?.[0]?.title || "",
              youthName,
              sectionName: scoValue,
              donationFrom: donation_from,
              paymentGatewayName: order?.payment_gateway_names?.[0] || null,
              groupId: order?.note_attributes?.find(
                  (attr: any) => attr?.name === "Group-Id"
              )?.value || null,
              refundStatus: "none",
              returnStatus: "none"
          };
          
          logger.info(`Order data prepared successfully for order ${order?.id}`);
          return preparedData;
      } catch (error: any) {
          logger.error(`OrderRepository - prepareOrderData: ${error.message}`);
          throw new Error(`Failed to prepare order data: ${error.message}`);
      }
  }

  public async getOrderByShopifyId(shopifyId: string): Promise<any> {
    try {
        logger.debug(`Finding order with Shopify ID: ${shopifyId}`);
        const order = await OrderModel.findOne({ orderId: shopifyId });
        
        if (!order) {
            logger.warn(`No order found with Shopify ID: ${shopifyId}`);
            return null;
        }
        
        return order;
    } catch (error: any) {
        logger.error(`OrderRepository - getOrderByShopifyId: ${error.message}`);
        throw new Error(`Failed to get order by Shopify ID: ${error.message}`);
    }
}

 /**
     * Determine if a webhook represents a full refund of an order
     */
//  public async isFullRefund(webhookData: any, existingOrder: any): Promise<boolean> {
//     try {
//       if (!webhookData.refunds || webhookData.refunds.length === 0) {
//         return false;
//       }
      
//       // Track quantities from the current webhook
//       let currentRefundQuantity = 0;
//       webhookData.refunds.forEach((refund: any) => {
//         refund.refund_line_items.forEach((item: any) => {
//           currentRefundQuantity += item.quantity || 0;
//         });
//       });
      
//       // Calculate already returned quantities from previous returns
//       let previouslyReturnedQuantity = 0;
//       if (existingOrder.returnedProducts && existingOrder.returnedProducts.length > 0) {
//         previouslyReturnedQuantity = existingOrder.returnedProducts.reduce(
//           (sum: number, product: any) => sum + (product.quantity || 0), 
//           0
//         );
//       }
      
//       // Calculate already refunded quantities
//       let previouslyRefundedQuantity = 0;
//       if (existingOrder.refundedProducts && existingOrder.refundedProducts.length > 0) {
//         previouslyRefundedQuantity = existingOrder.refundedProducts.reduce(
//           (sum: number, product: any) => sum + (product.quantity || 0), 
//           0
//         );
//       }
      
//       // Total order quantity
//       const totalOrderQuantity = existingOrder.products.reduce(
//         (sum: number, product: any) => sum + (product.quantity || 0),
//         0
//       );
      
//       // Check if all items are now returned or refunded
//       const totalProcessedQuantity = previouslyReturnedQuantity + 
//                                    previouslyRefundedQuantity + 
//                                    currentRefundQuantity;
      
//       logger.info(`Order ${webhookData.id} refund check: Current refund=${currentRefundQuantity}, ` +
//                  `Previous returns=${previouslyReturnedQuantity}, Previous refunds=${previouslyRefundedQuantity}, ` +
//                  `Total order quantity=${totalOrderQuantity}`);
                 
//       return totalProcessedQuantity >= totalOrderQuantity;
//     } catch (error: any) {
//       logger.error(`OrderRepository - isFullRefund: ${error.message}`);
//       return false;
//     }
//   }

public async isFullRefund(webhookData: any, existingOrder: any): Promise<boolean> {
  try {
    // Calculate total effective order quantity (accounting for champion multipliers)
    const totalEffectiveOrderQuantity = existingOrder.products.reduce((sum: number, product: any) => {
      if (product.isChampion && product.championQuantity) {
        return sum + (product.quantity * product.championQuantity);
      }
      return sum + product.quantity;
    }, 0);
    
    // Calculate effective quantities already processed
    let totalEffectiveProcessedQuantity = 0;
    
    // Add previously refunded quantities (with champion multipliers)
    if (existingOrder.refundedProducts?.length > 0) {
      totalEffectiveProcessedQuantity += existingOrder.refundedProducts.reduce((sum: number, refunded: any) => {
        // Find the original product to get its champion details
        const originalProduct = existingOrder.products.find((p: any) => p.shopifyId === refunded.shopifyId);
        if (originalProduct?.isChampion && originalProduct?.championQuantity) {
          return sum + (refunded.quantity * originalProduct.championQuantity);
        }
        return sum + refunded.quantity;
      }, 0);
    }
    
    // Add previously returned quantities (with champion multipliers)
    if (existingOrder.returnedProducts?.length > 0) {
      totalEffectiveProcessedQuantity += existingOrder.returnedProducts.reduce((sum: number, returned: any) => {
        const originalProduct = existingOrder.products.find((p: any) => p.shopifyId === returned.shopifyId);
        if (originalProduct?.isChampion && originalProduct?.championQuantity) {
          return sum + (returned.quantity * originalProduct.championQuantity);
        }
        return sum + returned.quantity;
      }, 0);
    }
    
    // Calculate effective quantity in current refund webhook
    let currentRefundEffectiveQuantity = 0;
    if (webhookData.refunds?.length > 0) {
      for (const refund of webhookData.refunds) {
        for (const item of refund.refund_line_items || []) {
          const lineItem = webhookData.line_items?.find((li: any) => li.id === item.line_item_id);
          if (!lineItem) continue;
          
          const shopifyId = `gid://shopify/Product/${lineItem.product_id}`;
          const product = existingOrder.products.find((p: any) => p.shopifyId === shopifyId);
          
          if (product?.isChampion && product?.championQuantity) {
            currentRefundEffectiveQuantity += (item.quantity * product.championQuantity);
          } else {
            currentRefundEffectiveQuantity += item.quantity;
          }
        }
      }
    }
    
    // Add current refund to total processed quantity
    totalEffectiveProcessedQuantity += currentRefundEffectiveQuantity;
    
    logger.info(`Order ${webhookData.id} effective quantity check:` +
               `\n - Total effective order quantity: ${totalEffectiveOrderQuantity}` +
               `\n - Total effective processed quantity: ${totalEffectiveProcessedQuantity}` +
               `\n - Current refund effective quantity: ${currentRefundEffectiveQuantity}`);
    
    return totalEffectiveProcessedQuantity >= totalEffectiveOrderQuantity;
  } catch (error: any) {
    logger.error(`OrderRepository - isFullRefund: ${error.message}`);
    return false;
  }
}

/**
* Handle partial refund processing
*/
// public async handlePartialRefund(webhookData: any, existingOrder: any): Promise<void> {
//     try {
//       logger.info(`Processing partial refund for order ${webhookData.id}`);
      
//       // Map refunded items by product ID
//       const refundedItems:any = [];
//       const refundDate = new Date();
      
//       webhookData.refunds.forEach((refund: any) => {
//         refund.refund_line_items.forEach((item: any) => {
//           const lineItem = webhookData.line_items?.find((li: any) => li.id === item.line_item_id);
//           if (lineItem) {
//             refundedItems.push({
//               product_id: lineItem.product_id.toString(),
//               quantity: item.quantity || 0,
//               refund_id: refund.id
//             });
//           }
//         });
//       });
      
//       logger.info(`Found ${refundedItems.length} refunded items to process`);
      
//       // Track what's already been processed to prevent double-counting
//       const previouslyProcessedMap = new Map();
      
//       // Build map of already processed products (returns + refunds)
//       if (existingOrder.returnedProducts?.length > 0) {
//         existingOrder.returnedProducts.forEach((item: any) => {
//           const currentQty = previouslyProcessedMap.get(item.shopifyId) || 0;
//           previouslyProcessedMap.set(item.shopifyId, currentQty + (item.quantity || 0));
//         });
//       }
      
//       if (existingOrder.refundedProducts?.length > 0) {
//         existingOrder.refundedProducts.forEach((item: any) => {
//           const currentQty = previouslyProcessedMap.get(item.shopifyId) || 0;
//           previouslyProcessedMap.set(item.shopifyId, currentQty + (item.quantity || 0));
//         });
//       }
      
//       // Process each refunded product, checking against what's already been processed
//       const productsToProcess = [];
//       const newRefundedProducts = [];
      
//       for (const item of refundedItems) {
//         const shopifyId = `gid://shopify/Product/${item.product_id}`;
//         const originalProduct = existingOrder.products.find((p: any) => p.shopifyId === shopifyId);
        
//         if (originalProduct) {
//           // Check how much of this product can still be processed
//           const originalQty = originalProduct.quantity || 0;
//           const alreadyProcessedQty = previouslyProcessedMap.get(shopifyId) || 0;
//           const remainingQty = Math.max(0, originalQty - alreadyProcessedQty);
          
//           if (remainingQty <= 0) {
//             logger.info(`Product ${shopifyId} has already been fully processed in previous returns/refunds`);
//             continue;
//           }
          
//           // Determine effective quantity to process now
//           const effectiveQty = Math.min(item.quantity, remainingQty);
          
//           // Create a deep copy for processing
//           const productCopy = JSON.parse(JSON.stringify(originalProduct));
//           productCopy.quantity = effectiveQty;
          
//           productsToProcess.push(productCopy);
          
//           // Track for order document update
//           newRefundedProducts.push({
//             shopifyId,
//             quantity: effectiveQty,
//             refundDate,
//             refundId: item.refund_id
//           });
          
//           logger.info(`Processing refund for product ${shopifyId}: quantity=${effectiveQty}/${item.quantity} (effective/requested), isChampion=${originalProduct.isChampion || false}`);
//         }
//       }
      
//       if (productsToProcess.length === 0) {
//         logger.warn(`No products found to process for refund in order ${webhookData.id}`);
//         return;
//       }
      
//       // Restore inventory for refunded products
//       logger.info(`Restocking inventory for ${productsToProcess.length} refunded products`);
//       await productRepository.restockProductsFromOrder(productsToProcess);
      
//       // Reverse category sales calculations
//       if (existingOrder.groupId) {
//         logger.info(`Reversing category sales for refunded products in group ${existingOrder.groupId}`);
//         await this.reversePartialCategorySales(existingOrder.groupId, productsToProcess);
//       }
      
//       // Update order record with refunded products
//       await OrderModel.findByIdAndUpdate(existingOrder._id, {
//         $push: { refundedProducts: { $each: newRefundedProducts } }
//       });
      
//       logger.info(`Completed partial refund processing for ${productsToProcess.length} products`);
//     } catch (error: any) {
//       logger.error(`Error in handlePartialRefund: ${error.message}`);
//       throw error;
//     }
// }

public async handlePartialRefund(webhookData: any, existingOrder: any): Promise<void> {
  try {
    logger.info(`Processing partial refund for order ${webhookData.id}`);
    
    // Map refunded items by product ID
    const refundedItems: any = [];
    const refundDate = new Date();
    
    webhookData.refunds.forEach((refund: any) => {
      refund.refund_line_items.forEach((item: any) => {
        const lineItem = webhookData.line_items?.find((li: any) => li.id === item.line_item_id);
        if (lineItem) {
          refundedItems.push({
            product_id: lineItem.product_id.toString(),
            quantity: item.quantity || 0,
            refund_id: refund.id
          });
        }
      });
    });
    
    logger.info(`Found ${refundedItems.length} refunded items to process`);
    
    // Track what's already been processed to prevent double-counting
    const previouslyProcessedMap = new Map();
    
    // Build map of already processed products (returns + refunds)
    if (existingOrder.returnedProducts?.length > 0) {
      existingOrder.returnedProducts.forEach((item: any) => {
        const currentQty = previouslyProcessedMap.get(item.shopifyId) || 0;
        previouslyProcessedMap.set(item.shopifyId, currentQty + (item.quantity || 0));
      });
    }
    
    if (existingOrder.refundedProducts?.length > 0) {
      existingOrder.refundedProducts.forEach((item: any) => {
        const currentQty = previouslyProcessedMap.get(item.shopifyId) || 0;
        previouslyProcessedMap.set(item.shopifyId, currentQty + (item.quantity || 0));
      });
    }
    
    // Process each refunded product
    const productsToProcess = []; // For inventory and category calculations
    const newRefundedProducts = []; // For database tracking
    
    for (const item of refundedItems) {
      const shopifyId = `gid://shopify/Product/${item.product_id}`;
      const originalProduct = existingOrder.products.find((p: any) => p.shopifyId === shopifyId);
      
      if (originalProduct) {
        // Always track in the database, even if already processed
        newRefundedProducts.push({
          shopifyId,
          quantity: item.quantity,
          refundDate,
          refundId: item.refund_id
        });
        
        // Check how much of this product can still be processed for calculations
        const originalQty = originalProduct.quantity || 0;
        const alreadyProcessedQty = previouslyProcessedMap.get(shopifyId) || 0;
        const remainingQty = Math.max(0, originalQty - alreadyProcessedQty);
        
        if (remainingQty <= 0) {
          logger.info(`Product ${shopifyId} has already been fully processed in previous returns/refunds - recording refund only`);
          continue; // Skip further processing but keep in database
        }
        
        // For actual processing, use the effective quantity
        const effectiveQty = Math.min(item.quantity, remainingQty);
        
        // Create a deep copy for processing
        const productCopy = JSON.parse(JSON.stringify(originalProduct));
        productCopy.quantity = effectiveQty;
        
        productsToProcess.push(productCopy);
        
        logger.info(`Processing refund for product ${shopifyId}: quantity=${effectiveQty}/${item.quantity} (effective/requested), isChampion=${originalProduct.isChampion || false}`);
      }
    }
    
    // Only adjust inventory and sales if we have products to process
    if (productsToProcess.length > 0) {
      logger.info(`Restocking inventory for ${productsToProcess.length} refunded products`);
      await productRepository.restockProductsFromOrder(productsToProcess);
      
      if (existingOrder.groupId) {
        logger.info(`Reversing category sales for refunded products in group ${existingOrder.groupId}`);
        await this.reversePartialCategorySales(existingOrder.groupId, productsToProcess, existingOrder._id);
      }
    }
    
    // Always update the order record with refunded products
    if (newRefundedProducts.length > 0) {
      logger.info(`Recording ${newRefundedProducts.length} products in refundedProducts array`);
      await OrderModel.findByIdAndUpdate(existingOrder._id, {
        $push: { refundedProducts: { $each: newRefundedProducts } }
      });
    }
    
    logger.info(`Completed partial refund processing for ${refundedItems.length} products`);
  } catch (error: any) {
    logger.error(`Error in handlePartialRefund: ${error.message}`);
    throw error;
  }
}

/**
* Determine if a webhook represents a full return of an order
*/
// public async isFullReturn(webhookData: any, existingOrder: any): Promise<boolean> {
//     try {
//       if (!webhookData.returns || webhookData.returns.length === 0) {
//         return false;
//       }
      
//       // Track quantities from the current webhook
//       let currentReturnQuantity = 0;
//       webhookData.returns.forEach((returnData: any) => {
//         returnData.return_line_items.forEach((item: any) => {
//           currentReturnQuantity += item.quantity || 0;
//         });
//       });
      
//       // Calculate already returned quantities from previous returns
//       let previouslyReturnedQuantity = 0;
//       if (existingOrder.returnedProducts && existingOrder.returnedProducts.length > 0) {
//         previouslyReturnedQuantity = existingOrder.returnedProducts.reduce(
//           (sum: number, product: any) => sum + (product.quantity || 0), 
//           0
//         );
//       }
      
//       // Calculate already refunded quantities
//       let previouslyRefundedQuantity = 0;
//       if (existingOrder.refundedProducts && existingOrder.refundedProducts.length > 0) {
//         previouslyRefundedQuantity = existingOrder.refundedProducts.reduce(
//           (sum: number, product: any) => sum + (product.quantity || 0), 
//           0
//         );
//       }
      
//       // Total order quantity
//       const totalOrderQuantity = existingOrder.products.reduce(
//         (sum: number, product: any) => sum + (product.quantity || 0),
//         0
//       );
      
//       // Check if all items are now returned or refunded
//       const totalProcessedQuantity = previouslyReturnedQuantity + 
//                                    previouslyRefundedQuantity + 
//                                    currentReturnQuantity;
      
//       logger.info(`Order ${webhookData.id} return check: Current return=${currentReturnQuantity}, ` +
//                  `Previous returns=${previouslyReturnedQuantity}, Previous refunds=${previouslyRefundedQuantity}, ` +
//                  `Total order quantity=${totalOrderQuantity}`);
                 
//       return totalProcessedQuantity >= totalOrderQuantity;
//     } catch (error: any) {
//       logger.error(`OrderRepository - isFullReturn: ${error.message}`);
//       return false;
//     }
//   }

public async isFullReturn(webhookData: any, existingOrder: any): Promise<boolean> {
  try {
    if (!webhookData.returns || webhookData.returns.length === 0) {
      return false;
    }
    
    // Calculate total effective quantity for the entire order
    const totalEffectiveOrderQuantity = existingOrder.products.reduce((sum: number, product: any) => {
      if (product.isChampion && product.championQuantity) {
        return sum + (product.quantity * product.championQuantity);
      }
      return sum + product.quantity;
    }, 0);
    
    // Calculate previously processed items (returns + refunds)
    let previouslyProcessedEffectiveQuantity = 0;
    
    if (existingOrder.returnedProducts?.length > 0) {
      previouslyProcessedEffectiveQuantity += existingOrder.returnedProducts.reduce((sum: number, returned: any) => {
        const originalProduct = existingOrder.products.find((p: any) => p.shopifyId === returned.shopifyId);
        if (originalProduct?.isChampion && originalProduct?.championQuantity) {
          return sum + (returned.quantity * originalProduct.championQuantity);
        }
        return sum + returned.quantity;
      }, 0);
    }
    
    if (existingOrder.refundedProducts?.length > 0) {
      previouslyProcessedEffectiveQuantity += existingOrder.refundedProducts.reduce((sum: number, refunded: any) => {
        const originalProduct = existingOrder.products.find((p: any) => p.shopifyId === refunded.shopifyId);
        if (originalProduct?.isChampion && originalProduct?.championQuantity) {
          return sum + (refunded.quantity * originalProduct.championQuantity);
        }
        return sum + refunded.quantity;
      }, 0);
    }
    
    // Calculate current return quantity with champion multipliers
    let currentReturnEffectiveQuantity = 0;
    
    for (const returnData of webhookData.returns) {
      for (const item of returnData.return_line_items || []) {
        const lineItem = webhookData.line_items?.find((li: any) => li.id === item.line_item_id);
        if (!lineItem) continue;
        
        const shopifyId = `gid://shopify/Product/${lineItem.product_id}`;
        const product = existingOrder.products.find((p:any) => p.shopifyId === shopifyId);
        
        if (product?.isChampion && product?.championQuantity) {
          currentReturnEffectiveQuantity += (item.quantity * product.championQuantity);
        } else {
          currentReturnEffectiveQuantity += item.quantity;
        }
      }
    }
    
    // Calculate total processed quantity
    const totalProcessedEffectiveQuantity = previouslyProcessedEffectiveQuantity + currentReturnEffectiveQuantity;
    
    logger.info(`Order ${webhookData.id} return check: ` +
               `\n - Total effective order quantity: ${totalEffectiveOrderQuantity}` +
               `\n - Previously processed effective quantity: ${previouslyProcessedEffectiveQuantity}` +
               `\n - Current return effective quantity: ${currentReturnEffectiveQuantity}` +
               `\n - Total processed effective quantity: ${totalProcessedEffectiveQuantity}`);
               
    return totalProcessedEffectiveQuantity >= totalEffectiveOrderQuantity;
  } catch (error: any) {
    logger.error(`OrderRepository - isFullReturn: ${error.message}`);
    return false;
  }
}

/**
* Handle partial return processing
*/
// public async handlePartialReturn(webhookData: any, existingOrder: any): Promise<void> {
//     try {
//       logger.info(`Processing partial return for order ${webhookData.id}`);
      
//       // Extract return line items from the webhook data
//       const returnedItems: any[] = [];
      
//       webhookData.returns.forEach((returnData: any) => {
//         if (returnData.return_line_items && returnData.return_line_items.length > 0) {
//           returnData.return_line_items.forEach((item: any) => {
//             const lineItem = webhookData.line_items?.find((li: any) => li.id === item.line_item_id);
//             if (lineItem) {
//               returnedItems.push({
//                 product_id: lineItem.product_id.toString(),
//                 quantity: item.quantity || 0
//               });
//             }
//           });
//         }
//       });
      
//       logger.info(`Found ${returnedItems.length} returned items to process`);
      
//       // Track what's already been processed to prevent double-counting
//       const previouslyProcessedMap = new Map();
      
//       // Build map of already processed products (returns + refunds)
//       if (existingOrder.returnedProducts?.length > 0) {
//         existingOrder.returnedProducts.forEach((item: any) => {
//           const currentQty = previouslyProcessedMap.get(item.shopifyId) || 0;
//           previouslyProcessedMap.set(item.shopifyId, currentQty + (item.quantity || 0));
//         });
//       }
      
//       if (existingOrder.refundedProducts?.length > 0) {
//         existingOrder.refundedProducts.forEach((item: any) => {
//           const currentQty = previouslyProcessedMap.get(item.shopifyId) || 0;
//           previouslyProcessedMap.set(item.shopifyId, currentQty + (item.quantity || 0));
//         });
//       }
      
//       logger.info(`Found ${previouslyProcessedMap.size} previously processed products`);
      
//       // Process each returned product, checking against what's already been processed
//       const productsToProcess = [];
//       const newReturnedProducts = [];
      
//       for (const item of returnedItems) {
//         const shopifyId = `gid://shopify/Product/${item.product_id}`;
//         const originalProduct = existingOrder.products.find((p: any) => p.shopifyId === shopifyId);
        
//         if (originalProduct) {
//           // Check how much of this product can still be processed
//           const originalQty = originalProduct.quantity || 0;
//           const alreadyProcessedQty = previouslyProcessedMap.get(shopifyId) || 0;
//           const remainingQty = Math.max(0, originalQty - alreadyProcessedQty);
          
//           if (remainingQty <= 0) {
//             logger.info(`Product ${shopifyId} has already been fully processed in previous returns/refunds`);
//             continue;
//           }
          
//           // Determine effective quantity to process now
//           const effectiveQty = Math.min(item.quantity, remainingQty);
          
//           // Create a deep copy to avoid reference issues
//           const productCopy = JSON.parse(JSON.stringify(originalProduct));
//           productCopy.quantity = effectiveQty;
          
//           productsToProcess.push(productCopy);
          
//           // Track this for order update
//           newReturnedProducts.push({
//             shopifyId,
//             quantity: effectiveQty,
//             returnDate: new Date(),
//             returnId: webhookData.returns[0]?.id || null
//           });
          
//           logger.info(`Processing return for product ${shopifyId}: quantity=${effectiveQty}/${item.quantity} (effective/requested), isChampion=${originalProduct.isChampion || false}`);
//         }
//       }
      
//       if (productsToProcess.length === 0) {
//         logger.warn(`No products found to process for return in order ${webhookData.id}`);
//         return;
//       }
      
//       // Restore inventory for returned products
//       logger.info(`Restocking inventory for ${productsToProcess.length} returned products`);
//       await productRepository.restockProductsFromOrder(productsToProcess);
      
//       // Reverse category sales calculations for returned products
//       if (existingOrder.groupId) {
//         logger.info(`Reversing category sales for returned products in group ${existingOrder.groupId}`);
//         await this.reversePartialCategorySales(existingOrder.groupId, productsToProcess);
//       }
      
//       // Update order record with returned products for future tracking
//       await OrderModel.findByIdAndUpdate(existingOrder._id, {
//         $push: { returnedProducts: { $each: newReturnedProducts } }
//       });
      
//       logger.info(`Completed partial return processing for ${productsToProcess.length} products`);
//     } catch (error: any) {
//       logger.error(`Error in handlePartialReturn: ${error.message}`);
//       throw error;
//     }
// }

public async handlePartialReturn(webhookData: any, existingOrder: any): Promise<void> {
  try {
    logger.info(`Processing partial return for order ${webhookData.id}`);
    
    // Extract return line items from the webhook data
    const returnedItems: any[] = [];
    
    webhookData.returns.forEach((returnData: any) => {
      if (returnData.return_line_items && returnData.return_line_items.length > 0) {
        returnData.return_line_items.forEach((item: any) => {
          const lineItem = webhookData.line_items?.find((li: any) => li.id === item.line_item_id);
          if (lineItem) {
            returnedItems.push({
              product_id: lineItem.product_id.toString(),
              quantity: item.quantity || 0,
              return_id: returnData.id
            });
          }
        });
      }
    });
    
    logger.info(`Found ${returnedItems.length} returned items to process`);
    
    // Track what's already been processed to prevent double-counting
    const previouslyProcessedMap = new Map();
    
    // Build map of already processed products (returns + refunds)
    if (existingOrder.returnedProducts?.length > 0) {
      existingOrder.returnedProducts.forEach((item: any) => {
        const currentQty = previouslyProcessedMap.get(item.shopifyId) || 0;
        previouslyProcessedMap.set(item.shopifyId, currentQty + (item.quantity || 0));
      });
    }
    
    if (existingOrder.refundedProducts?.length > 0) {
      existingOrder.refundedProducts.forEach((item: any) => {
        const currentQty = previouslyProcessedMap.get(item.shopifyId) || 0;
        previouslyProcessedMap.set(item.shopifyId, currentQty + (item.quantity || 0));
      });
    }
    
    logger.info(`Found ${previouslyProcessedMap.size} previously processed products`);
    
    // Process each returned product
    const productsToProcess = [];
    const newReturnedProducts = [];
    
    for (const item of returnedItems) {
      const shopifyId = `gid://shopify/Product/${item.product_id}`;
      const originalProduct = existingOrder.products.find((p: any) => p.shopifyId === shopifyId);
      
      if (originalProduct) {
        // Always add to the returned products array for tracking
        newReturnedProducts.push({
          shopifyId,
          quantity: item.quantity,
          returnDate: new Date(),
          returnId: item.return_id
        });
        
        // Check how much can still be processed
        const originalQty = originalProduct.quantity || 0;
        const alreadyProcessedQty = previouslyProcessedMap.get(shopifyId) || 0;
        const remainingQty = Math.max(0, originalQty - alreadyProcessedQty);
        
        if (remainingQty <= 0) {
          logger.info(`Product ${shopifyId} has already been fully processed in previous returns/refunds - recording return only`);
          continue; // Skip further processing
        }
        
        // For actual processing, use the effective quantity
        const effectiveQty = Math.min(item.quantity, remainingQty);
        
        // Create a deep copy to avoid reference issues
        const productCopy = JSON.parse(JSON.stringify(originalProduct));
        productCopy.quantity = effectiveQty;
        
        productsToProcess.push(productCopy);
        
        logger.info(`Processing return for product ${shopifyId}: quantity=${effectiveQty}/${item.quantity} (effective/requested), isChampion=${originalProduct.isChampion || false}`);
      }
    }
    
    // Process inventory and sales only if needed
    if (productsToProcess.length > 0) {
      logger.info(`Restocking inventory for ${productsToProcess.length} returned products`);
      await productRepository.restockProductsFromOrder(productsToProcess);
      
      if (existingOrder.groupId) {
        logger.info(`Reversing category sales for returned products in group ${existingOrder.groupId}`);
        await this.reversePartialCategorySales(existingOrder.groupId, productsToProcess, existingOrder._id);
      }
    }
    
    // Always update the database with new returned products
    if (newReturnedProducts.length > 0) {
      logger.info(`Recording ${newReturnedProducts.length} products in returnedProducts array`);
      await OrderModel.findByIdAndUpdate(existingOrder._id, {
        $push: { returnedProducts: { $each: newReturnedProducts } }
      });
    }
    
    logger.info(`Completed partial return processing for ${returnedItems.length} products`);
  } catch (error: any) {
    logger.error(`Error in handlePartialReturn: ${error.message}`);
    throw error;
  }
}

/**
* Reverse category sales for specific products
*/
// private async reversePartialCategorySales(groupId: string, products: Array<any>): Promise<void> {
//     try {
//       logger.info(`Reversing partial category sales for ${products.length} products in group ${groupId}`);
      
//       // Get complete category details for the products
//       const productsWithCategories = await categoryRepository.getProductCategoryDetails(products);
//       logger.info(`Retrieved category details for ${productsWithCategories.length} products`);
      
//       // Group by category and calculate totals
//       const categorySalesMap = productsWithCategories.reduce((acc: any, product: any) => {
//         if (!product.categoryId) return acc;
        
//         if (!acc[product.categoryId]) {
//           acc[product.categoryId] = { totalAmount: 0, totalQuantity: 0 };
//         }
        
//         // Ensure values are valid numbers
//         const quantity = Number(product.quantity) || 0;
//         const amount = Number(product.amount) || 0;
//         let championQuantity = Number(product.championQuantity) || 1;
        
//         // For champion products, use different calculation logic
//         if (product.isChampion) {
//           // Amount calculation for champion products
//           acc[product.categoryId].totalAmount += amount * quantity;
          
//           // Quantity calculation (multiply by championQuantity)
//           const effectiveQuantity = quantity * championQuantity;
//           acc[product.categoryId].totalQuantity += effectiveQuantity;
          
//           logger.info(`Champion product calculation - ID: ${product.shopifyId}, Amount: ${amount * quantity}, Qty: ${quantity}, ChampionQty: ${championQuantity}, EffectiveQty: ${effectiveQuantity}`);
//         } else {
//           // Regular product calculations
//           acc[product.categoryId].totalAmount += amount * quantity;
//           acc[product.categoryId].totalQuantity += quantity;
          
//           logger.info(`Regular product calculation - ID: ${product.shopifyId}, Amount: ${amount * quantity}, Qty: ${quantity}`);
//         }
        
//         return acc;
//       }, {});
      
//       // Update database for each category
//       const updatePromises = Object.entries(categorySalesMap).map(
//         async ([categoryId, sales]: [string, any]) => {
//           try {
//             const amountToDecrement = Number(sales.totalAmount) || 0;
//             const quantityToDecrement = Number(sales.totalQuantity) || 0;
            
//             if (isNaN(amountToDecrement) || isNaN(quantityToDecrement)) {
//               logger.error(`Invalid values for category ${categoryId}: amount=${sales.totalAmount}, quantity=${sales.totalQuantity}`);
//               return { success: false, categoryId, error: "Invalid numeric values" };
//             }
            
//             logger.info(`Updating category ${categoryId} sales: -${amountToDecrement} amount, -${quantityToDecrement} quantity`);
            
//             const result = await GroupCollectionSalesModel.findOneAndUpdate(
//               {
//                 groupId: groupId,
//                 categoryId: categoryId
//               },
//               {
//                 $inc: {
//                   totalAmount: -amountToDecrement,
//                   totalQuantity: -quantityToDecrement
//                 }
//               },
//               { new: true }
//             );
            
//             logger.info(`Updated category ${categoryId} sales: new total amount=${result?.totalAmount}, new total quantity=${result?.totalQuantity}`);
//             return { success: true, categoryId };
//           } catch (error: any) {
//             logger.error(`Failed to update category ${categoryId} sales: ${error.message}`);
//             return { success: false, categoryId, error: error.message };
//           }
//         }
//       );
      
//       const results = await Promise.all(updatePromises);
//       const successCount = results.filter(r => r.success).length;
      
//       logger.info(`Reversed category sales for ${successCount}/${results.length} categories`);
//     } catch (error: any) {
//       logger.error(`Error in reversePartialCategorySales: ${error.message}`);
//       throw error;
//     }
//   }

public async reversePartialCategorySales(groupId: string, products: Array<any>, orderId?: string): Promise<void> {
  try {
    logger.info(`Reversing partial category sales for ${products.length} products in group ${groupId}`);
    
    // Log products being processed for debugging
    products.forEach(product => {
      logger.info(`Product for reversal: ${product.shopifyId}, qty=${product.quantity}, ` +
                 `isChampion=${product.isChampion}, championQty=${product.championQuantity || 'N/A'}`);
    });
    
    // Get category details
    const productsWithCategories = await categoryRepository.getProductCategoryDetails(products);
    logger.info(`Retrieved category details for ${productsWithCategories.length} products`);
    
    // Track overall totals for order reversal
    let totalOrderReverseAmount = 0;
    let totalOrderReverseQuantity = 0;
    
    // Group by category and calculate totals
    const categorySalesMap = productsWithCategories.reduce((acc: any, product: any) => {
      if (!product.categoryId) return acc;
      
      if (!acc[product.categoryId]) {
        acc[product.categoryId] = { totalAmount: 0, totalQuantity: 0 };
      }
      
      // Ensure values are valid numbers
      const quantity = Number(product.quantity) || 0;
      const amount = Number(product.amount) || 0;
      
      // For champion products
      if (product.isChampion) {
        const championQuantity = Math.max(1, Number(product.championQuantity) || 1);
        
        // Amount calculation (price × quantity)
        const productAmount = amount * quantity;
        acc[product.categoryId].totalAmount += productAmount;
        totalOrderReverseAmount += productAmount;
        
        // Effective quantity calculation (quantity × championQuantity)
        const effectiveQuantity = quantity * championQuantity;
        acc[product.categoryId].totalQuantity += effectiveQuantity;
        totalOrderReverseQuantity += effectiveQuantity;
        
        logger.info(`Champion product calculation - ID: ${product.shopifyId}, Amount: ${productAmount}, ` + 
                   `Qty: ${quantity}, ChampionQty: ${championQuantity}, EffectiveQty: ${effectiveQuantity}`);
      } else {
        // Regular product
        const productAmount = amount * quantity;
        acc[product.categoryId].totalAmount += productAmount;
        totalOrderReverseAmount += productAmount;
        
        acc[product.categoryId].totalQuantity += quantity;
        totalOrderReverseQuantity += quantity;
        
        logger.info(`Regular product calculation - ID: ${product.shopifyId}, Amount: ${productAmount}, ` +
                   `Qty: ${quantity}, Total: ${productAmount}`);
      }
      
      // Log running total
      logger.info(`Running total for category ${product.categoryId}: amount=${acc[product.categoryId].totalAmount}, ` +
                 `quantity=${acc[product.categoryId].totalQuantity}`);
      
      return acc;
    }, {});
    
    // Log final calculations
    Object.entries(categorySalesMap).forEach(([categoryId, sales]: [string, any]) => {
      logger.info(`FINAL Category ${categoryId} sales to reverse: amount=${sales.totalAmount}, quantity=${sales.totalQuantity}`);
    });
    
    // Update database for categories
    const updatePromises = Object.entries(categorySalesMap).map(
      async ([categoryId, sales]: [string, any]) => {
        try {
          const amountToDecrement = Number(sales.totalAmount) || 0;
          const quantityToDecrement = Number(sales.totalQuantity) || 0;
          
          logger.info(`DB UPDATE for category ${categoryId}: amount=-${amountToDecrement}, quantity=-${quantityToDecrement}`);
          
          const result = await GroupCollectionSalesModel.findOneAndUpdate(
            { groupId, categoryId },
            { $inc: { totalAmount: -amountToDecrement, totalQuantity: -quantityToDecrement } },
            { new: true }
          );
          
          logger.info(`Reversed sales for group ${groupId}, category ${categoryId}: ` +
                     `-${amountToDecrement} amount, -${quantityToDecrement} quantity. ` +
                     `New totals: amount=${result?.totalAmount}, quantity=${result?.totalQuantity}`);
          
          return { success: true, categoryId };
        } catch (error: any) {
          logger.error(`Failed to update category ${categoryId}: ${error.message}`);
          return { success: false, categoryId, error: error.message };
        }
      }
    );
    
    // If we have an order ID, update the order's reverseAmount and reverseQuantity
    if (orderId) {
      try {
        logger.info(`Updating order ${orderId} reversal totals: +${totalOrderReverseAmount} amount, +${totalOrderReverseQuantity} quantity`);
        
        await OrderModel.findByIdAndUpdate(orderId, {
          $inc: { 
            reverseAmount: totalOrderReverseAmount,
            reverseQuantity: totalOrderReverseQuantity
          }
        });
      } catch (error: any) {
        logger.error(`Failed to update order ${orderId} reversal totals: ${error.message}`);
      }
    }
    
    const results = await Promise.all(updatePromises);
    const successCount = results.filter(r => r.success).length;
    
    logger.info(`Reversed sales for ${successCount}/${results.length} categories`);
  } catch (error: any) {
    logger.error(`Error in reversePartialCategorySales: ${error.message}`);
    throw error;
  }
}


/**
* Map return data from Shopify webhook to our product format 
*/
public async mapReturnDataToProducts(webhookData: any, existingOrder: any): Promise<any[]> {
  try {
      if (!webhookData.returns || webhookData.returns.length === 0) {
          return existingOrder.products;
      }

      // Map of line_item_id to returned quantity
      const returnQuantityMap = new Map();
      
      // Process all return line items
      webhookData.returns.forEach((returnData: any) => {
          if (returnData.return_line_items && returnData.return_line_items.length > 0) {
              returnData.return_line_items.forEach((item: any) => {
                  const lineItemId = item.line_item_id;
                  const returnedQty = item.quantity || 0;
                  
                  if (lineItemId && returnedQty > 0) {
                      const currentQty = returnQuantityMap.get(lineItemId) || 0;
                      returnQuantityMap.set(lineItemId, currentQty + returnedQty);
                  }
              });
          }
      });
      
      // Match return quantities with products in the order
      const returnedProducts = [];
      
      if (webhookData.line_items && webhookData.line_items.length > 0) {
          for (const lineItem of webhookData.line_items) {
              const returnedQty = returnQuantityMap.get(lineItem.id) || 0;
              
              if (returnedQty > 0) {
                  // Find matching product in original order
                  const originalProduct = existingOrder.products.find((p: any) => 
                      p.shopifyId === `gid://shopify/Product/${lineItem.product_id}`
                  );
                  
                  if (originalProduct) {
                      returnedProducts.push({
                          ...originalProduct,
                          quantity: returnedQty, // Use returned quantity
                      });
                  }
              }
          }
      }
      
      logger.info(`Mapped ${returnedProducts.length} products for return processing`);
      return returnedProducts;
  } catch (error: any) {
      logger.error(`Error mapping return data to products: ${error.message}`);
      return existingOrder.products;
  }
}

// public async getRemainingProducts(webhookData: any, existingOrder: any): Promise<any[]> {
//     try {
//       logger.info(`Calculating remaining products for order ${webhookData.id}`);
      
//       // Create a deep copy of products to avoid modifying the original
//       const remainingProducts = JSON.parse(JSON.stringify(existingOrder.products));
      
//       // Process refunded products from order document
//       if (existingOrder.refundedProducts && existingOrder.refundedProducts.length > 0) {
//         logger.info(`Processing ${existingOrder.refundedProducts.length} previously refunded products`);
        
//         // Subtract refunded quantities from remaining products
//         existingOrder.refundedProducts.forEach((refunded: any) => {
//           const productIndex = remainingProducts.findIndex((p: any) => p.shopifyId === refunded.shopifyId);
//           if (productIndex !== -1) {
//             remainingProducts[productIndex].quantity -= refunded.quantity;
//             logger.info(`Adjusted remaining quantity for ${refunded.shopifyId}: -${refunded.quantity}, new total: ${remainingProducts[productIndex].quantity}`);
//           }
//         });
//       }
      
//       // Process returned products from order document
//       if (existingOrder.returnedProducts && existingOrder.returnedProducts.length > 0) {
//         logger.info(`Processing ${existingOrder.returnedProducts.length} previously returned products`);
        
//         // Subtract returned quantities from remaining products
//         existingOrder.returnedProducts.forEach((returned: any) => {
//           const productIndex = remainingProducts.findIndex((p: any) => p.shopifyId === returned.shopifyId);
//           if (productIndex !== -1) {
//             remainingProducts[productIndex].quantity -= returned.quantity;
//             logger.info(`Adjusted remaining quantity for ${returned.shopifyId}: -${returned.quantity}, new total: ${remainingProducts[productIndex].quantity}`);
//           }
//         });
//       }
      
//       // Filter out products with no remaining quantity
//       const validRemainingProducts = remainingProducts.filter((p: any) => p.quantity > 0);
      
//       logger.info(`Found ${validRemainingProducts.length} remaining products for order ${webhookData.id}`);
      
//       return validRemainingProducts;
//     } catch (error: any) {
//       logger.error(`Error calculating remaining products: ${error.message}`);
//       return [];
//     }
//   }


public async getRemainingProducts(webhookData: any, existingOrder: any): Promise<any[]> {
  try {
    logger.info(`Calculating remaining products for order ${webhookData.id}`);
    
    // Deep copy to avoid modifying the original
    const remainingProducts = JSON.parse(JSON.stringify(existingOrder.products));
    
    // Process refunded products
    if (existingOrder.refundedProducts?.length > 0) {
      logger.info(`Processing ${existingOrder.refundedProducts.length} previously refunded products`);
      
      existingOrder.refundedProducts.forEach((refunded: any) => {
        const productIndex = remainingProducts.findIndex((p: any) => p.shopifyId === refunded.shopifyId);
        if (productIndex !== -1) {
          const newQuantity = Math.max(0, remainingProducts[productIndex].quantity - refunded.quantity);
          remainingProducts[productIndex].quantity = newQuantity;
          
          const productType = remainingProducts[productIndex].isChampion ? 'champion' : 'regular';
          logger.info(`Adjusted remaining quantity for ${refunded.shopifyId} (${productType}): -${refunded.quantity}, new: ${newQuantity}`);
        }
      });
    }
    
    // Process returned products
    if (existingOrder.returnedProducts?.length > 0) {
      logger.info(`Processing ${existingOrder.returnedProducts.length} previously returned products`);
      
      existingOrder.returnedProducts.forEach((returned: any) => {
        const productIndex = remainingProducts.findIndex((p: any) => p.shopifyId === returned.shopifyId);
        if (productIndex !== -1) {
          const newQuantity = Math.max(0, remainingProducts[productIndex].quantity - returned.quantity);
          remainingProducts[productIndex].quantity = newQuantity;
          
          const productType = remainingProducts[productIndex].isChampion ? 'champion' : 'regular';
          logger.info(`Adjusted remaining quantity for ${returned.shopifyId} (${productType}): -${returned.quantity}, new: ${newQuantity}`);
        }
      });
    }
    
    // Filter products with remaining quantity
    const validRemainingProducts = remainingProducts.filter((p: any) => p.quantity > 0);
    
    // Log champion product counts
    const championCount = validRemainingProducts.filter((p: any) => p.isChampion).length;
    logger.info(`Remaining products: ${validRemainingProducts.length} total, ${championCount} champion products`);
    
    // Log effective quantities for debugging
    const totalEffectiveQuantity = validRemainingProducts.reduce((sum: number, product: any) => {
      if (product.isChampion && product.championQuantity) {
        return sum + (product.quantity * product.championQuantity);
      }
      return sum + product.quantity;
    }, 0);
    
    logger.info(`Total effective quantity remaining: ${totalEffectiveQuantity}`);
    
    return validRemainingProducts;
  } catch (error: any) {
    logger.error(`Error calculating remaining products: ${error.message}`);
    return [];
  }
}

}