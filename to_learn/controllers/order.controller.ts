import { OrderRepository } from "../repository/order.repository";
import { Request, Response } from "express";
import logger from "../configs/winston.config";
import { CustomerRepository } from "../repository/customer.repository";
import { DonationRepository } from "../repository/donation.repository";
import { ProductRepository } from "../repository/product.repository";
import { CategoryRepository } from "../repository/category.repository";
import { GroupCollectionSalesModel } from "../models/groupCollectionSales.model";
import { OrderModel } from "../models/order.model";
import { BadgeRepository } from "../repository/badge.repository";
import badgeAssignmentProcess from "../utils/badgeAssignmentProcess";

const orderRepository: OrderRepository = new OrderRepository();
const customerRepository: CustomerRepository = new CustomerRepository();
const donationRepository: DonationRepository = new DonationRepository();
const productRepository: ProductRepository = new ProductRepository();
const categoryRepository: CategoryRepository = new CategoryRepository();
const badgeRepository: BadgeRepository = new BadgeRepository();

// export class OrderController {
//   public async createOrderWB(req: Request, res: Response): Promise<void> {
//     try {
//       const order:any = req?.body;

//       console.log("order:>>>>>>", order);

//       //initial response to shopify
//       res.status(200).json({success: true ,message: "Order webhook received" });

//       logger.info(`Processing order webhook: ${order?.id || "unknown"}`);

//       // Extract customer information

//       // First, try to find the customer by shopifyId
//       let customer;
//       if (order?.customer?.id) {
//         logger.info(
//           `Looking for existing customer with Shopify ID: ${order.customer.id}`
//         );
//         customer = await customerRepository.findCustomerByShopifyId(
//           order.customer.id.toString()
//         );

//         // If customer exists, update their information
//         if (customer) {
//           logger.info(`Updating existing customer: ${customer._id}`);
          
//           // Prepare update data with optional chaining
//           const customerUpdateData = {
//             firstName: order?.customer?.first_name || customer.firstName,
//             lastName: order?.customer?.last_name || customer.lastName,
//             email: order?.customer?.email || customer.email,
//             // Only update addresses if provided in the webhook
//             ...(order?.billing_address && {
//               billingAddress: {
//                 address1: order.billing_address.address1 || "",
//                 address2: order.billing_address.address2 || "",
//                 company: order.billing_address.company || "",
//                 city: order.billing_address.city || "",
//                 province: order.billing_address.province || "",
//                 provinceCode: order.billing_address.province_code || "",
//                 postalCode: order.billing_address.zip || "",
//                 country: order.billing_address.country || "",
//                 countryCode: order.billing_address.country_code || ""
//               }
//             }),
//             ...(order?.shipping_address && {
//               shippingAddress: {
//                 address1: order.shipping_address.address1 || "",
//                 address2: order.shipping_address.address2 || "",
//                 company: order.shipping_address.company || "",
//                 city: order.shipping_address.city || "",
//                 province: order.shipping_address.province || "",
//                 provinceCode: order.shipping_address.province_code || "",
//                 postalCode: order.shipping_address.zip || "",
//                 country: order.shipping_address.country || "",
//                 countryCode: order.shipping_address.country_code || ""
//               }
//             })
//           };
          
//           // Update the existing customer
//           customer = await customerRepository.updateCustomer(customer._id, customerUpdateData);
          
//           if (!customer) {
//             logger.error("Failed to update existing customer");
//             return;
//           }
//         } 
//         // No existing customer found, create a new one
//         else {
//           logger.info("Creating new customer record");
          
//           // Format complete customer data for creation
//           const newCustomerData = {
//             shopifyId: order?.customer?.id?.toString(),
//             firstName: order?.customer?.first_name || "",
//             lastName: order?.customer?.last_name || "",
//             email: order?.customer?.email || "",
//             billingAddress: order?.billing_address ? {
//               address1: order.billing_address.address1 || "",
//               address2: order.billing_address.address2 || "",
//               company: order.billing_address.company || "",
//               city: order.billing_address.city || "",
//               province: order.billing_address.province || "",
//               provinceCode: order.billing_address.province_code || "",
//               postalCode: order.billing_address.zip || "",
//               country: order.billing_address.country || "",
//               countryCode: order.billing_address.country_code || ""
//             } : {},
//             shippingAddress: order?.shipping_address ? {
//               address1: order.shipping_address.address1 || "",
//               address2: order.shipping_address.address2 || "",
//               company: order.shipping_address.company || "",
//               city: order.shipping_address.city || "",
//               province: order.shipping_address.province || "",
//               provinceCode: order.shipping_address.province_code || "",
//               postalCode: order.shipping_address.zip || "",
//               country: order.shipping_address.country || "",
//               countryCode: order.shipping_address.country_code || ""
//             } : {}
//           };
          
//           // Create the new customer
//           customer = await customerRepository.createCustomer(newCustomerData);
          
//           if (!customer) {
//             logger.error("Failed to create new customer");
//             return;
//           }
//         }
//       }

//       // TODO: Before creating the order, we should check if the customer has donated
//       // And remove the donation product from the order if it exists

//       const donationProduct = order?.line_items?.find(
//         (item: any) => item?.vendor === "DonateMate" );

//         if (donationProduct) {

//             await donationRepository.acceptDonation(order);
//             // Remove donation product from order
//             order.line_items = order.line_items.filter(
//                 (item: any) => item?.id !== donationProduct?.id
//             );
//         }

//       const donationAmount = donationProduct 
//         ? parseFloat(donationProduct?.price) * (donationProduct?.quantity || 1) 
//         : 0;

//       // Calculate order totals excluding donation
//       const totalAmount = parseFloat(order?.total_price || "0") - donationAmount;
//       const subtotalAmount = parseFloat(order?.subtotal_price || "0") - donationAmount;


//       // Extract order information with optional chaining
//       const orderData = {
//         orderId: order?.id?.toString(),
//         orderNumber: order?.name,
//         totalQuantity:
//           order?.line_items?.reduce(
//             (sum: number, item: {quantity: number}) => sum + (item?.quantity || 0),
//             0
//           ) || 0,
//         totalAmount,
//         subtotalAmount,
//         taxAmount: parseFloat(order?.total_tax || "0"),
//         taxesIncluded: order?.taxes_included || false,
//         products:
//           order?.line_items?.map((item: any) => ({
//             shopifyId: `gid://shopify/Product/${item?.product_id}` || "",
//             quantity: item?.quantity || 0,
//             amount: parseFloat(item?.price || "0"),
//           })) || [],
//         orderStatus: order?.cancelled_at ? "cancelled" : "ordered",
//         financialStatus: order?.financial_status || "pending",
//         fulfillmentStatus: order?.fulfillment_status || "unfulfilled",
//         orderDate: order?.created_at ? new Date(order.created_at) : new Date(),
//         // paymentMethod: order?.payment_gateway_names || [],
//         customerId: customer._id,
//         groupId:  order?.note_attributes?.find( (attr: any) => attr?.name === "Group-Id")?.value || null,
//       };

//       // Create the order
//       const createdOrder = await orderRepository.createOrder(orderData);

//       if (!createdOrder) {
//         logger.error("Failed to create order");
//         return;
//       }

//       console.log("orderData",orderData);

//       // Update category sales metrics
//      // Update category sales metrics
//     try {
//       // First get product details with category information, handling champion products
//       const productDetailsPromises = orderData.products.map(async (product: any) => {
//         try {
//           // Same product details code you already have...
//           const productDetails = await productRepository.getProductByShopifyId(product.shopifyId);
          
//           // If product not found, skip it
//           if (!productDetails) {
//             logger.warn(`Product not found for shopifyId: ${product.shopifyId}`);
//             return {
//               ...product,
//               categoryId: null
//             };
//           }
          
//           // Check if this is a champion product
//           let categoryId = null;
          
//           if ('parentProduct' in productDetails && productDetails.parentProduct) {
//             // It's a champion product - get category from parent
//             const parentProduct = await productRepository.getProductById(productDetails.parentProduct);
//             if (parentProduct && 'category' in parentProduct) {
//               categoryId = parentProduct.category?.toString();
//               logger.info(`Using parent product category for champion product: ${product.shopifyId}`);
//             }
//           } else {
//             // Regular product - use its own category
//             categoryId = 'category' in productDetails ? productDetails.category?.toString() : null;
//           }
          
//           return {
//             ...product,
//             categoryId,
//             amount: product?.amount,
//             quantity: product?.quantity
//           };
//         } catch (error: any) {
//           logger.error(`Error getting product details: ${error?.message}`);
//           return {
//             ...product,
//             categoryId: null
//           };
//         }
//       });
      
//       const productsWithCategories = await Promise.all(productDetailsPromises);
      
//       // Group products by category and calculate totals
//       const categorySales = productsWithCategories.reduce((acc: any, product: any) => {
//         if (!product.categoryId) return acc;
        
//         if (!acc[product.categoryId]) {
//           acc[product.categoryId] = {
//             totalAmount: 0,
//             totalQuantity: 0
//           };
//         }
        
//         acc[product.categoryId].totalAmount += product.amount * product.quantity;
//         acc[product.categoryId].totalQuantity += product.quantity;
        
//         return acc;
//       }, {});
      
//       // Skip if no groupId
//       if (!orderData.groupId) {
//         logger.warn('No groupId provided, skipping group category sales update');
//         return;
//       }

//       // Get current date components for time-based tracking
//       const orderDate = orderData.orderDate || new Date();
//       const year = orderDate.getFullYear();
//       const month = orderDate.getMonth() + 1; // JavaScript months are 0-indexed
      
//       // Update sales metrics for each category for this group
//       const salesUpdatePromises = Object.entries(categorySales).map(async ([categoryId, sales]: [string, any]) => {
//         try {
//           // Find existing record or create new one using findOneAndUpdate with upsert
//           const updatedSales = await GroupCollectionSalesModel.findOneAndUpdate(
//             {
//               groupId: orderData.groupId,
//               categoryId: categoryId,
//             },
//             {
//               $inc: {
//                 totalAmount: sales.totalAmount,
//                 totalQuantity: sales.totalQuantity
//               },
//             },
//             { 
//               upsert: true, // Create if doesn't exist
//               new: true 
//             }
//           );
          
//           logger.info(
//             `Updated group category sales for group ${orderData.groupId}, category ${categoryId}: ` +
//             `+${sales.totalAmount} amount, +${sales.totalQuantity} quantity`
//           );
//           return { success: true, categoryId, updatedSales };
//         } catch (error: any) {
//           logger.error(`Failed to update sales for group ${orderData.groupId}, category ${categoryId}: ${error?.message}`);
//           return { success: false, categoryId, error: error?.message };
//         }
//       });
      
//       const salesResults = await Promise.all(salesUpdatePromises);
      
//       // Log update summary
//       const successfulUpdates = salesResults.filter(result => result.success).length;
//       const failedUpdates = salesResults.filter(result => !result.success).length;
      
//       logger.info(`Group category sales update summary: ${successfulUpdates} succeeded, ${failedUpdates} failed`);
      
//     } catch (categoryError: any) {
//       logger.error(`Error updating category sales metrics: ${categoryError?.message}`, categoryError);
//       // Don't fail the order process if category updates fail
//     }

//       // TODO: Additional processing like donations, inventory updates, tax receipts

//       const productsToBeUpdated = orderData.products.map((product: {shopifyId: string, quantity: number}) => ({
//         shopifyId: product?.shopifyId,
//         quantity: product?.quantity,
//       }));

//       // Update product inventory with proper error handling and await
//       try {
//         // Use Promise.all with explicit handling for each product update
//         const updateResults = await Promise.all(
//           productsToBeUpdated.map(async (product: {shopifyId: string, quantity: number}) => {
//             try {
//               // Skip products with invalid IDs or zero quantity
//               if (!product.shopifyId || !product.quantity) {
//                 logger.warn(`Skipping inventory update for invalid product: ${JSON.stringify(product)}`);
//                 return { success: false, productId: product.shopifyId, error: "Invalid product data" };
//               }
              
//               //check for champion products their inv. is decresed from their main product
//               const championProduct = await productRepository.getProductByShopifyId(product.shopifyId);

//               if(championProduct && 'parentProduct' in championProduct && championProduct.parentProduct){
//                 const parentProduct = await productRepository.getProductById(championProduct.parentProduct);
//                 if(parentProduct){
//                   const updatedProduct = await productRepository.updateProductInventory(parentProduct?.shopifyId as string, product?.quantity);
//                   logger.info(`Parent product inventory updated successfully: ${parentProduct.shopifyId}`);
//                 }
//               }
              
//               logger.info(`Product inventory updated successfully: ${product.shopifyId}`);
//               return { success: true, productId: product.shopifyId };
//             } catch (productError: any) {
//               // Catch errors for individual product updates
//               logger.error(
//                 `Failed to update inventory for product ${product.shopifyId}: ${productError?.message}`,
//                 productError
//               );
//               return { 
//                 success: false, 
//                 productId: product.shopifyId, 
//                 error: productError?.message || "Unknown error" 
//               };
//             }
//           })
//         );
        
//         // Check results and log summary
//         const successfulUpdates = updateResults.filter(result => result.success).length;
//         const failedUpdates = updateResults.filter(result => !result.success).length;
        
//         logger.info(`Inventory update summary: ${successfulUpdates} products updated successfully, ${failedUpdates} failed`);
        
//         // If some updates failed but not all, continue with order processing
//         if (failedUpdates > 0 && successfulUpdates > 0) {
//           logger.warn(`Some product inventory updates failed (${failedUpdates}/${updateResults.length})`);
//         } 
//         // If all updates failed, log error but still continue
//         else if (failedUpdates === updateResults.length && updateResults.length > 0) {
//           logger.error(`All product inventory updates failed (${failedUpdates} products)`);
//         }
//       } catch (inventoryError: any) {
//         // This catches errors in the Promise.all itself, not in individual updates
//         logger.error(
//           `Critical error during inventory updates: ${inventoryError?.message}`, 
//           inventoryError
//         );
//         return;
//       }

//       logger.info(`Order processed successfully: ${order?.id || "unknown"}`);
//       return;
//     } catch (error) {
//       logger.error("OrderController - createOrderWB - Error while processing order", error);
//       console.error("OrderController - createOrderWB - Error while processing order", error);
//       return;
//     }
//   }
// }

export class OrderController {
  public async createOrderWB(req: Request, res: Response): Promise<void> {
    try {
      const orderData = req?.body;
      console.log("order:>>>>>>", orderData);

      // Send immediate response to Shopify
      res.status(200).json({success: true, message: "Order webhook received" });
      logger.info(`Processing order webhook: ${orderData?.id || "unknown"}`);

      const existingOrder = await orderRepository.getOrderByShopifyId(orderData.id.toString());
        if (existingOrder) {
            logger.error(`Order already found for Shopify ID: ${orderData.id}`);
            return;
        }

      // Process customer information
      const customer = await customerRepository.processWebhookCustomer(orderData);
      if (!customer) {
        logger.error("Failed to process customer data");
        return;
      }

      // Process donations if present
      const { 
        processedOrder, 
        donationAmount,
        donationProcessed 
      } = await donationRepository.processOrderDonations(orderData);

      // Prepare order data for database
      const preparedOrderData = await orderRepository.prepareOrderData({
        order: processedOrder,
        customer,
        donationAmount
      });
      logger.info(`Prepared order data: ${JSON.stringify(preparedOrderData, null, 2)}`);

      // Create the order record
      const createdOrder = await orderRepository.createOrder(preparedOrderData);
      if (!createdOrder) {
        logger.error("Failed to create order");
        return;
      }

      // // Process category sales metrics
      // if (preparedOrderData.groupId) {
      //   await categoryRepository.processOrderCategorySales(preparedOrderData);
      // }

      if (preparedOrderData.groupId) {
        await categoryRepository.processOrderCategorySales(preparedOrderData);
        
        //Process badge assignments for this group
        try {
          await badgeAssignmentProcess.processAssignments(preparedOrderData?.groupId?.toString());
          logger.info(`Badge assignments processed for group ${preparedOrderData?.groupId}`);
        } catch (error) {
          logger.error(`Error processing badge assignments: ${error}`);
          // Don't throw - this shouldn't affect the order creation process
        }
      }

      // Update product inventory
      await productRepository.updateInventoryFromOrder(preparedOrderData.products);

      logger.info(`Order processed successfully: ${orderData?.id || "unknown"}`);
    } catch (error) {
      logger.error("OrderController - createOrderWB - Error while processing order", error);
      console.error("OrderController - createOrderWB - Error while processing order", error);
    }
  }

  // public async updateOrderWB(req: Request, res: Response): Promise<void> {
  //   try {
  //     const webhookData = req.body;
  //     logger.info(`Processing order update webhook for order: ${webhookData?.id || "unknown"}`);
      
  //     // Add detailed debug information about the webhook
  //     logger.info(`Webhook financial_status: ${webhookData.financial_status}`);
  //     logger.info(`Webhook has refunds: ${webhookData.refunds ? 'yes' : 'no'}`);
  //     if (webhookData.refunds) {
  //       logger.info(`Number of refunds: ${webhookData.refunds.length}`);
  //     }
        
  //     // Immediately respond to Shopify to avoid timeouts
  //     res.status(200).json({ success: true, message: "Order update webhook received" });
  
  //     // Find the existing order in our database
  //     const existingOrder = await orderRepository.getOrderByShopifyId(webhookData.id.toString());
      
  //     if (!existingOrder) {
  //       logger.error(`Order not found for Shopify ID: ${webhookData.id}`);
  //       return;
  //     }
      
  //     // Initialize update tracking variables
  //     const updateData: any = {};
      
  //     let needsInventoryAdjustment = false;
  //     let needsCategorySalesReversal = false;
  //     let needsBadgeReprocessing = false;
      
  //     // Log webhook data for debugging
  //     logger.debug(`Webhook data: ${JSON.stringify(webhookData, null, 2)}`);
      
  //     // SCENARIO 1: Order cancelled
  //     if (webhookData.cancelled_at && webhookData.cancel_reason) {
  //       logger.info(`Processing cancellation for order: ${webhookData.id}, reason: ${webhookData.cancel_reason}`);
        
  //       updateData.orderStatus = "cancelled";
  //       updateData.financialStatus = webhookData.financial_status || "refunded";
        
  //       // Check if this order has already been partially refunded/returned
  //       const hasPartialRefunds = existingOrder.refundStatus === "partial" || existingOrder.returnStatus === "partial";
        
  //       if (hasPartialRefunds) {
  //         logger.info(`Order ${webhookData.id} was partially refunded/returned before cancellation - processing remaining items only`);
          
  //         // Calculate remaining products (those not already refunded)
  //         const remainingProducts = await orderRepository.getRemainingProducts(webhookData, existingOrder);
          
  //         if (remainingProducts.length > 0) {
  //           logger.info(`Found ${remainingProducts.length} remaining products to process for cancellation`);
            
  //           // Restock inventory for remaining products only
  //           await productRepository.restockProductsFromOrder(remainingProducts);
            
  //           // Reverse category sales for remaining products only
  //           if (existingOrder.groupId) {
  //             const partialOrder = {
  //               groupId: existingOrder.groupId,
  //               products: remainingProducts
  //             };
  //             await OrderController.reverseCategorySales(partialOrder);
  //           }
  //         } else {
  //           logger.info(`No remaining products to process for order ${webhookData.id} - all items were already refunded`);
  //         }
  //       } else {
  //         // Regular cancellation - process everything
  //         needsInventoryAdjustment = true;
  //         needsCategorySalesReversal = true;
  //         needsBadgeReprocessing = true;
  //       }
  //     }
  //     // SCENARIO 2: Order fulfilled
  //     else if (webhookData.fulfillment_status === "partial" || 
  //       (webhookData.fulfillments && webhookData.fulfillments.length > 0 && 
  //        webhookData.fulfillment_status !== "fulfilled")) {
 
  //       logger.info(`Processing partial fulfillment for order: ${webhookData.id}`);
        
  //       updateData.fulfillmentStatus = "partial";
        
  //       // Extract the fulfilled line items from the webhook
  //       const fulfilledItems = new Map();
        
  //       // Collect all items that have been fulfilled across all fulfillments
  //       if (webhookData.fulfillments && webhookData.fulfillments.length > 0) {
  //         webhookData.fulfillments.forEach((fulfillment: any) => {
  //           if (fulfillment.line_items && fulfillment.line_items.length > 0) {
  //             fulfillment.line_items.forEach((item:any) => {
  //               const shopifyId = `gid://shopify/Product/${item.product_id}`;
  //               const quantity = parseInt(item.quantity) || 0;
                
  //               // Add to existing quantity or set new
  //               fulfilledItems.set(
  //                 shopifyId, 
  //                 (fulfilledItems.get(shopifyId) || 0) + quantity
  //               );
  //             });
  //           }
  //         });
  //       }
        
  //       // Process unfulfilled items (reverse their impact)
  //       const unfulfilledItems = existingOrder.products.filter((product: any) => {
  //         const fulfilledQty = fulfilledItems.get(product.shopifyId) || 0;
  //         return fulfilledQty < product.quantity;
  //       }).map((product:any) => {
  //         const fulfilledQty = fulfilledItems.get(product.shopifyId) || 0;
  //         const unfulfilledQty = Math.max(0, product.quantity - fulfilledQty);
          
  //         return {
  //           ...product,
  //           quantity: unfulfilledQty  // Only the unfulfilled portion
  //         };
  //       }).filter((product: any) => product.quantity > 0);
        
  //       if (unfulfilledItems.length > 0) {
  //         logger.info(`Found ${unfulfilledItems.length} unfulfilled items to process`);
          
  //         // Restock inventory for unfulfilled items
  //         await productRepository.restockProductsFromOrder(unfulfilledItems);
  //         logger.info(`Restocked inventory for unfulfilled items`);
          
  //         // Reverse category sales for unfulfilled items
  //         if (existingOrder.groupId) {
  //           const unfulfilled = {
  //             products: unfulfilledItems,
  //             groupId: existingOrder.groupId
  //           };
  //           await OrderController.reverseCategorySales(unfulfilled);
  //           logger.info(`Reversed category sales for unfulfilled items`);
  //         }
  //       }
  //     }
  //     // SCENARIO 3: Order refunded - expand this condition
  //     else if ((webhookData.refunds && webhookData.refunds.length > 0) || 
  //              webhookData.financial_status === "refunded" || 
  //              webhookData.financial_status === "partially_refunded") {
        
  //       logger.info(`Processing refund for order: ${webhookData.id}, financial status: ${webhookData.financial_status}`);
        
  //       // Update financial status
  //       updateData.financialStatus = webhookData.financial_status;
        
  //       // Check if this is a full or partial refund
  //       let isFullRefund = webhookData.financial_status === "refunded";
        
  //       // If we have refund line items, check if it's a full refund
  //       if (webhookData.refunds && webhookData.refunds.length > 0) {
  //         isFullRefund = await orderRepository.isFullRefund(webhookData);
  //       }
        
  //       if (isFullRefund) {
  //         logger.info(`Full refund detected for order: ${webhookData.id}`);
  //         updateData.refundStatus = "full";
  //         needsInventoryAdjustment = true;
  //         needsCategorySalesReversal = true;
  //         needsBadgeReprocessing = true;
  //       } else {
  //         logger.info(`Partial refund detected for order: ${webhookData.id}`);
  //         updateData.refundStatus = "partial";
          
  //         // Only process partial refund if we have refund line items
  //         if (webhookData.refunds && webhookData.refunds.length > 0) {
  //           await orderRepository.handlePartialRefund(webhookData, existingOrder);
  //         } else {
  //           logger.warn(`No refund line items found for partial refund on order: ${webhookData.id}`);
  //         }
  //       }
  //     } 
  //     // SCENARIO 4: Order returned
  //     else if (webhookData.returns && webhookData.returns.length > 0) {
  //       logger.info(`Processing return for order: ${webhookData.id}`);
        
  //       updateData.orderStatus = "returned";
        
  //       // Process the returned items
  //       const isFullReturn = await orderRepository.isFullReturn(webhookData);
        
  //       if (isFullReturn) {
  //         logger.info(`Full return detected for order: ${webhookData.id}`);
  //         updateData.returnStatus = "full";
  //         needsInventoryAdjustment = true;
  //         needsCategorySalesReversal = true;
  //         needsBadgeReprocessing = true;
  //       } else {
  //         logger.info(`Partial return detected for order: ${webhookData.id}`);
  //         updateData.returnStatus = "partial";
  //         await orderRepository.handlePartialReturn(webhookData, existingOrder);
  //       }
  //     }
  //     // SCENARIO 5: Generic status update
  //     else {
  //       logger.info(`Processing generic status update for order: ${webhookData.id}`);
        
  //       if (webhookData.financial_status !== existingOrder.financialStatus) {
  //         updateData.financialStatus = webhookData.financial_status;
  //       }
        
  //       if (webhookData.fulfillment_status !== existingOrder.fulfillmentStatus) {
  //         updateData.fulfillmentStatus = webhookData.fulfillment_status;
  //       }
  //     }
      
  //     // Apply the updates to the order
  //     if (Object.keys(updateData).length > 0) {
  //       const updatedOrder = await orderRepository.updateOrder(existingOrder._id, updateData);
        
  //       if (!updatedOrder) {
  //         logger.error(`Failed to update order: ${webhookData.id}`);
  //         return;
  //       }
        
  //       // Process inventory adjustments if needed
  //       if (needsInventoryAdjustment) {
  //         try {
  //           await productRepository.restockProductsFromOrder(existingOrder.products);
  //           logger.info(`Inventory restocked for order: ${webhookData.id}`);
  //         } catch (error: any) {
  //           logger.error(`Failed to adjust inventory: ${error.message}`);
  //         }
  //       }
        
  //       // Process category sales reversal if needed
  //       if (needsCategorySalesReversal && existingOrder.groupId) {
  //         try {
  //           await OrderController.reverseCategorySales(existingOrder);
  //           logger.info(`Category sales reversed for order: ${webhookData.id}`);
  //         } catch (error: any) {
  //           logger.error(`Failed to reverse category sales: ${error.message}`);
  //         }
  //       }
        
  //       // Process badge reassignment if needed
  //       // if (needsBadgeReprocessing && existingOrder.groupId) {
  //       //   try {
  //       //     await badgeAssignmentProcess.processAssignments(existingOrder.groupId.toString());
  //       //     logger.info(`Badge assignments reprocessed for group ${existingOrder.groupId}`);
  //       //   } catch (error: any) {
  //       //     logger.error(`Error reprocessing badge assignments: ${error.message}`);
  //       //   }
  //       // }
  //     }
      
  //     logger.info(`Order update processed successfully for order: ${webhookData.id}`);
  //   } catch (error: any) {
  //     logger.error(`OrderController - updateOrderWB: Error: ${error.message}`, error);
  //     console.error("OrderController - updateOrderWB: Error:", error);
  //   }
  // }

  public async updateOrderWB(req: Request, res: Response): Promise<void> {
    try {
        const webhookData = req.body;
        logger.info(`Processing order update webhook for order: ${webhookData?.id || "unknown"}`);

        res.status(200).json({ success: true, message: "Order update webhook received" });

        const existingOrder = await orderRepository.getOrderByShopifyId(webhookData.id.toString());
        if (!existingOrder) {
            logger.error(`Order not found for Shopify ID: ${webhookData.id}`);
            return;
        }

        // console.log("Cancel order payload: ", JSON.stringify(webhookData));

        // Track changes to avoid duplicate processing
        const updateData: any = {};
        const processFlags = {
            inventoryAdjusted: false,
            categorySalesReversed: false,
            badgeReprocessed: false,
        };

        const isCancelled = webhookData.cancelled_at && webhookData.cancel_reason;
        const isPartiallyFulfilled = webhookData.fulfillment_status === "partial" || 
                                     (webhookData.fulfillments && webhookData.fulfillments.length > 0 && webhookData.fulfillment_status !== "fulfilled");
        const hasRefunds = (webhookData.refunds && webhookData.refunds.length > 0) || 
                           webhookData.financial_status === "refunded" || webhookData.financial_status === "partially_refunded";
        const hasReturns = webhookData.returns && webhookData.returns.length > 0;

        // ======= STEP 1: Process Cancellations (Highest Priority) =======
        if (isCancelled) {
          logger.info(`Processing cancellation for order: ${webhookData.id}, reason: ${webhookData.cancel_reason}`);
          updateData.orderStatus = "cancelled";
          updateData.financialStatus = webhookData.financial_status || "refunded";
      
          // If already partial ly refunded, handle only remaining products
          const remainingProducts = await orderRepository.getRemainingProducts(webhookData, existingOrder);
          if (remainingProducts.length > 0) {
              await productRepository.restockProductsFromOrder(remainingProducts);
              if (existingOrder.groupId) {
                  await OrderController.reverseCategorySales({ groupId: existingOrder.groupId, products: remainingProducts });
              }
          } else {
              // Only set flags if we didn't directly process remaining products
              processFlags.inventoryAdjusted = true;
              processFlags.categorySalesReversed = true;
              processFlags.badgeReprocessed = true;
          }
      }

        // ======= STEP 2: Process Full Refunds (Skip if Already Cancelled) =======
        if (!isCancelled && hasRefunds) {
          logger.info(`Processing refund for order: ${webhookData.id}, financial status: ${webhookData.financial_status}`);
          
          updateData.financialStatus = webhookData.financial_status;
          
          // Enhanced refund check
          let isFullRefund = false;
          if (webhookData.refunds && webhookData.refunds.length > 0) {
            // Always use proper line item analysis when refund data is available
            isFullRefund = await orderRepository.isFullRefund(webhookData, existingOrder);
            logger.info(`Full refund check based on effective quantities: ${isFullRefund}`);
          } else if (webhookData.financial_status === "refunded") {
            // Only use financial status as fallback when no line items available
            logger.warn(`Using financial_status='refunded' to determine full refund (less reliable)`);
            isFullRefund = true;
          }
          
          if (isFullRefund) {
            updateData.refundStatus = "full";
            
            // Extract specific refunded items from the webhook instead of using all remaining products
            const refundedItems: any[] = [];
            let directProcessingOccurred = false;
            
            if (webhookData.refunds && webhookData.refunds.length > 0) {
              try {
                // Get most recent refund
                const latestRefund = webhookData.refunds[webhookData.refunds.length - 1];
                const refundId = latestRefund.id.toString();
                
                // Get total order quantities by product
                const orderTotalQuantities = existingOrder.products.reduce((acc: any, product: any) => {
                  acc[product.shopifyId] = (acc[product.shopifyId] || 0) + product.quantity;
                  return acc;
                }, {});
                
                // Calculate total already refunded quantity by product
                const totalRefundedByProduct = (existingOrder.refundedProducts || []).reduce((acc: any, product: any) => {
                  acc[product.shopifyId] = (acc[product.shopifyId] || 0) + product.quantity;
                  return acc;
                }, {});``
                
                // Process each refund line item individually, checking remaining quantities
                latestRefund.refund_line_items.forEach((item: any) => {
                  const lineItem = webhookData.line_items?.find((li: any) => li.id === item.line_item_id);
                  if (lineItem) {
                    const shopifyProductId = `gid://shopify/Product/${lineItem.product_id}`;
                    
                    // Check how much of this product has already been refunded
                    const alreadyRefundedQty = totalRefundedByProduct[shopifyProductId] || 0;
                    const orderTotalQty = orderTotalQuantities[shopifyProductId] || 0;
                    
                    // Compare against original order quantity, not just current refund quantity
                    const remainingQtyToRefund = Math.max(0, orderTotalQty - alreadyRefundedQty);
                    const quantityToProcess = Math.min(item.quantity, remainingQtyToRefund);
                    
                    if (quantityToProcess > 0) {
                      logger.info(`Processing refund for product ${shopifyProductId}: ${quantityToProcess} of ${item.quantity} requested (${remainingQtyToRefund} remaining in order)`);
                      refundedItems.push({
                        shopifyId: shopifyProductId,
                        quantity: quantityToProcess,
                        amount: Number(lineItem.price) || 0,
                        isChampion: existingOrder.products.find((p: any) => 
                          p.shopifyId === shopifyProductId)?.isChampion || false,
                        championQuantity: existingOrder.products.find((p: any) => 
                          p.shopifyId === shopifyProductId)?.championQuantity || 0,
                        refundId: refundId
                      });
                    } else {
                      logger.info(`Skipping fully refunded product ${shopifyProductId} in refund ${refundId} (${alreadyRefundedQty}/${orderTotalQty} already processed)`);
                    }
                  }
                });
                
                // Process only the specific items in this refund that weren't already processed
                if (refundedItems.length > 0) {
                  logger.info(`Processing ${refundedItems.length} refundable items from current webhook`);
                  await productRepository.restockProductsFromOrder(refundedItems);
                  
                  if (existingOrder.groupId) {
                    await orderRepository.reversePartialCategorySales(existingOrder.groupId.toString(), refundedItems, existingOrder._id);
                  }
                  
                  // Record these items in the database to prevent duplicate processing
                  const productsToRecord = refundedItems.map(item => ({
                    shopifyId: item.shopifyId,
                    quantity: item.quantity,
                    refundDate: new Date(),
                    refundId: refundId
                  }));
                  
                  await OrderModel.findByIdAndUpdate(existingOrder._id, {
                    $push: { refundedProducts: { $each: productsToRecord } }
                  });
                  
                  logger.info(`Recorded ${productsToRecord.length} products in refundedProducts array`);
                  directProcessingOccurred = true;
                } else {
                  logger.info(`No refundable items remaining in order ${webhookData.id}`);
                  directProcessingOccurred = true;
                }
              } catch (error: any) {
                logger.error(`Error processing refund items: ${error.message}`);
              }
            }
            
            // Only set process flags if we didn't do direct processing
            if (!directProcessingOccurred) {
              logger.info(`Processing inventory adjustment via flags for order ${webhookData.id}`);
              processFlags.inventoryAdjusted = true;
              processFlags.categorySalesReversed = true;
            }
            
            processFlags.badgeReprocessed = true;
            
            // Always record the products in the database for tracking
            const alreadyRefundedIds = (existingOrder.refundedProducts || [])
              .map((p: any) => p.shopifyId);
            
            // Find products that aren't already in refundedProducts
            const productsToAdd = existingOrder.products
              .filter((p: any) => !alreadyRefundedIds.includes(p.shopifyId))
              .map((p: any) => ({
                shopifyId: p.shopifyId,
                quantity: p.quantity,
                refundDate: new Date(),
                refundId: webhookData.refunds && webhookData.refunds.length > 0 
                  ? webhookData.refunds[webhookData.refunds.length-1]?.id || null
                  : null
              }));
            
            // Update the order document if there are products to add
            if (productsToAdd.length > 0) {
              logger.info(`Adding ${productsToAdd.length} products to refundedProducts array for full refund`);
              await OrderModel.findByIdAndUpdate(existingOrder._id, {
                $push: { refundedProducts: { $each: productsToAdd } }
              });
            }
          } else {
            updateData.refundStatus = "partial";
            // Add this flag to track that we did direct processing
            let directProcessingOccurred = false;
            
            if (webhookData.refunds && webhookData.refunds.length > 0) {
              try {
                await orderRepository.handlePartialRefund(webhookData, existingOrder);
                directProcessingOccurred = true;
              } catch (error:any) {
                logger.error(`Error in partial refund handling: ${error.message}`);
              }
            }
            
            // Only set processing flags if we didn't do direct processing
            if (!directProcessingOccurred) {
              processFlags.inventoryAdjusted = true;
              processFlags.categorySalesReversed = true;
            }
          }
        }

        // ======= STEP 3: Process Returns (Skip if Already Cancelled/Refunded) =======
        if (!isCancelled && !hasRefunds && hasReturns) {
          logger.info(`Processing return for order: ${webhookData.id}`);
          
          updateData.orderStatus = "returned";
          
          // Check if it's a full or partial return
          let isFullReturn = false;
          if (webhookData.returns && webhookData.returns.length > 0) {
            // Use proper line item analysis for returns
            isFullReturn = await orderRepository.isFullReturn(webhookData, existingOrder);
            logger.info(`Full return check based on effective quantities: ${isFullReturn}`);
          }
          
          if (isFullReturn) {
            updateData.returnStatus = "full";
            
            // Extract returned items from webhook
            const returnedItems: any[] = [];
            let directProcessingOccurred = false;
            
            if (webhookData.returns && webhookData.returns.length > 0) {
              try {
                // Get most recent return
                const latestReturn = webhookData.returns[webhookData.returns.length - 1];
                const returnId = latestReturn.id.toString();
                
                // Check if we've processed this return before
                const existingReturnIds = (existingOrder.returnedProducts || [])
                  .map((p: any) => p.returnId)
                  .filter((id: any) => id !== null);
                
                // Get total order quantities
                const orderTotalQuantities = existingOrder.products.reduce((acc: any, product: any) => {
                  acc[product.shopifyId] = (acc[product.shopifyId] || 0) + product.quantity;
                  return acc;
                }, {});
                
                // Calculate total already returned by product
                const totalReturnedByProduct = (existingOrder.returnedProducts || []).reduce((acc: any, product: any) => {
                  acc[product.shopifyId] = (acc[product.shopifyId] || 0) + product.quantity;
                  return acc;
                }, {});
                
                // Check if this could be a new return with new items
                const hasNewItems = latestReturn.return_line_items.some((item: any) => {
                  const lineItem = webhookData.line_items?.find((li: any) => li.id === item.line_item_id);
                  if (!lineItem) return false;
                  
                  const shopifyProductId = `gid://shopify/Product/${lineItem.product_id}`;
                  const totalReturned = totalReturnedByProduct[shopifyProductId] || 0;
                  const orderTotal = orderTotalQuantities[shopifyProductId] || 0;
                  
                  return totalReturned < orderTotal;
                });
                
                // If it's a duplicate return ID but there are new items, process it
                const isNewReturn = !existingReturnIds.includes(returnId) || hasNewItems;
                
                if (!isNewReturn) {
                  logger.warn(`Skipping duplicate processing of return ID ${returnId} for order ${webhookData.id}`);
                  directProcessingOccurred = true;
                } else {
                  logger.info(`Processing return ID ${returnId} - contains new items to process`);
                  
                  // Process unprocessed items from this return
                  latestReturn.return_line_items.forEach((item: any) => {
                    const lineItem = webhookData.line_items?.find((li: any) => li.id === item.line_item_id);
                    if (lineItem) {
                      const shopifyProductId = `gid://shopify/Product/${lineItem.product_id}`;
                      
                      // Check remaining quantity to return
                      const alreadyReturnedQty = totalReturnedByProduct[shopifyProductId] || 0;
                      const orderTotalQty = orderTotalQuantities[shopifyProductId] || 0;
                      const remainingQtyToReturn = orderTotalQty - alreadyReturnedQty;
                      
                      // Only process up to the remaining quantity
                      const quantityToProcess = Math.min(item.quantity, remainingQtyToReturn);
                      
                      if (quantityToProcess > 0) {
                        returnedItems.push({
                          shopifyId: shopifyProductId,
                          quantity: quantityToProcess,
                          amount: Number(lineItem.price) || 0,
                          isChampion: existingOrder.products.find((p: any) => 
                            p.shopifyId === shopifyProductId)?.isChampion || false,
                          championQuantity: existingOrder.products.find((p: any) => 
                            p.shopifyId === shopifyProductId)?.championQuantity || 0,
                          returnId: returnId
                        });
                      } else {
                        logger.info(`No remaining quantity to return for product ${shopifyProductId}`);
                      }
                    }
                  });
                  
                  // Process the returned items
                  if (returnedItems.length > 0) {
                    logger.info(`Processing ${returnedItems.length} returned items from current webhook`);
                    await productRepository.restockProductsFromOrder(returnedItems);
                    
                    if (existingOrder.groupId) {
                      await orderRepository.reversePartialCategorySales(existingOrder.groupId.toString(), returnedItems, existingOrder._id);
                    }
                    
                    // Record these items in the database to prevent duplicate processing
                    const productsToRecord = returnedItems.map(item => ({
                      shopifyId: item.shopifyId,
                      quantity: item.quantity,
                      returnDate: new Date(),
                      returnId: returnId
                    }));
                    
                    await OrderModel.findByIdAndUpdate(existingOrder._id, {
                      $push: { refundedProducts: { $each: productsToRecord } }
                    });
                    
                    logger.info(`Recorded ${productsToRecord.length} products in refundedProducts array`);
                    directProcessingOccurred = true;
                  } else {
                    logger.info(`No items to process in this return`);
                    directProcessingOccurred = true;
                  }
                }
              } catch (error: any) {
                logger.error(`Error processing return items: ${error.message}`);
              }
            }
            
            // Only set process flags if we didn't do direct processing
            if (!directProcessingOccurred) {
              logger.info(`Processing inventory adjustment via flags for order ${webhookData.id}`);
              processFlags.inventoryAdjusted = true;
              processFlags.categorySalesReversed = true;
            }
            
            processFlags.badgeReprocessed = true;
            
            // Always record the products in the database for tracking
            const alreadyReturnedIds = (existingOrder.returnedProducts || [])
              .map((p: any) => p.shopifyId);
            
            // Find products that aren't already in returnedProducts
            const productsToAdd = existingOrder.products
              .filter((p: any) => !alreadyReturnedIds.includes(p.shopifyId))
              .map((p: any) => ({
                shopifyId: p.shopifyId,
                quantity: p.quantity,
                returnDate: new Date(),
                returnId: webhookData.returns && webhookData.returns.length > 0 
                  ? webhookData.returns[webhookData.returns.length-1]?.id || null
                  : null
              }));
            
            // Update the order document if there are products to add
            if (productsToAdd.length > 0) {
              logger.info(`Adding ${productsToAdd.length} products to returnedProducts array for full return`);
              await OrderModel.findByIdAndUpdate(existingOrder._id, {
                $push: { returnedProducts: { $each: productsToAdd } }
              });
            }
          } else {
            await orderRepository.handlePartialReturn(webhookData, existingOrder);
          }
        }

        // ======= STEP 4: Process Partial Fulfillment (Skip if Canceled/Refunded) =======
        if (!isCancelled && !hasRefunds && !hasReturns && isPartiallyFulfilled) {
            logger.info(`Processing partial fulfillment for order: ${webhookData.id}`);
            updateData.fulfillmentStatus = "partial";

            const fulfilledItems = new Map();
            webhookData.fulfillments?.forEach((fulfillment: any) => {
                fulfillment.line_items?.forEach((item: any) => {
                    const shopifyId = `gid://shopify/Product/${item.product_id}`;
                    fulfilledItems.set(shopifyId, (fulfilledItems.get(shopifyId) || 0) + parseInt(item.quantity) || 0);
                });
            });

            const unfulfilledItems = existingOrder.products
                .filter((product: any) => (fulfilledItems.get(product.shopifyId) || 0) < product.quantity)
                .map((product: any) => ({ ...product, quantity: product.quantity - (fulfilledItems.get(product.shopifyId) || 0) }))
                .filter((product: any) => product.quantity > 0);

            if (unfulfilledItems.length > 0) {
                await productRepository.restockProductsFromOrder(unfulfilledItems);
                if (existingOrder.groupId) {
                    await OrderController.reverseCategorySales({ products: unfulfilledItems, groupId: existingOrder.groupId });
                }
            }
        }

        // ======= STEP 5: Generic Status Updates =======
        if (!isCancelled && !isPartiallyFulfilled && !hasRefunds && !hasReturns) {
            if (webhookData.financial_status !== existingOrder.financialStatus) {
                updateData.financialStatus = webhookData.financial_status;
            }
            if (webhookData.fulfillment_status !== existingOrder.fulfillmentStatus) {
                updateData.fulfillmentStatus = webhookData.fulfillment_status;
            }
        }

        // ======= STEP 6: Apply Updates to Order =======
        if (Object.keys(updateData).length > 0) {
          await orderRepository.updateOrder(existingOrder._id, updateData);
          
          // Only process inventory adjustment if flag is set AND it wasn't already directly processed
          if (processFlags.inventoryAdjusted) {
              logger.info(`Processing inventory adjustment via flags for order ${webhookData.id}`);
              // For champion products, we need to be extra careful about double processing
              if (hasReturns || hasRefunds) {
                  logger.info(`Order has returns/refunds - checking what remains to be processed`);
                  const remainingProducts = await orderRepository.getRemainingProducts(webhookData, existingOrder);
                  if (remainingProducts.length > 0) {
                      logger.info(`Found ${remainingProducts.length} products remaining to process`);
                      await productRepository.restockProductsFromOrder(remainingProducts);
                  } else {
                      logger.info(`No remaining products to process - skipping inventory adjustment`);
                  }
              } else {
                  await productRepository.restockProductsFromOrder(existingOrder.products);
              }
          }
          
          // Same for category sales
          if (processFlags.categorySalesReversed && existingOrder.groupId) {
              logger.info(`Processing category sales reversal via flags for order ${webhookData.id}`);
              if (hasReturns || hasRefunds) {
                  const remainingProducts = await orderRepository.getRemainingProducts(webhookData, existingOrder);
                  if (remainingProducts.length > 0) {
                      await OrderController.reverseCategorySales({
                          groupId: existingOrder.groupId,
                          products: remainingProducts
                      });
                  } else {
                      logger.info(`No remaining products to process - skipping category sales reversal`);
                  }
              } else {
                  await OrderController.reverseCategorySales(existingOrder);
              }
          }
        }

        badgeRepository.handleShopifyOrderUpdateForBadge(existingOrder?.groupId);

        logger.info(`Order update processed successfully for order: ${webhookData.id}`);
    } catch (error: any) {
        logger.error(`OrderController - updateOrderWB: Error: ${error.message}`, error);
    }
}



  public static async reverseCategorySales(order: any): Promise<void> {
    if (!order.groupId) {
      logger.warn('No groupId provided, skipping category sales reversal');
      return;
    }
    
    try {
      // Get products with category information - fix issue by preserving champion info
      const productsWithCategories = await categoryRepository.getProductCategoryDetails(order.products);
      logger.info(`Retrieved category details for ${productsWithCategories.length} products`);
      
      // Debug each product to see what's coming in
      productsWithCategories.forEach(product => {
        logger.info(`Product for reversal: shopifyId=${product.shopifyId}, isChampion=${product.isChampion}, championQuantity=${product.championQuantity}, quantity=${product.quantity}, amount=${product.amount}`);
      });
      
      // Group by category and calculate totals
      const categorySalesMap = productsWithCategories.reduce((acc: any, product: any) => {
        if (!product.categoryId) return acc;
        
        if (!acc[product.categoryId]) {
          acc[product.categoryId] = { totalAmount: 0, totalQuantity: 0 };
        }
        
        // Ensure values are valid numbers
        const quantity = Number(product.quantity) || 0;
        const amount = Number(product.amount) || 0;
        let championQuantity = Number(product.championQuantity) || 1;
        
        // Force a minimum value of 1 for championQuantity to avoid multiplication by 0
        if (championQuantity < 1) championQuantity = 1;
        
        // For champion products, use different calculation logic
        if (product.isChampion) {
          // Champion products use the single price value, not multiplied by quantity
          acc[product.categoryId].totalAmount += amount * quantity;
          
          // Calculate effective quantity - ALWAYS multiply for champion products
          const effectiveQuantity = quantity * championQuantity;
          acc[product.categoryId].totalQuantity += effectiveQuantity;
          
          logger.info(`Champion product reversal - ID: ${product.shopifyId}, Amount: ${amount}, Qty: ${quantity}, ChampionQty: ${championQuantity}, EffectiveQty: ${effectiveQuantity}`);
          logger.info(`Running total for category ${product.categoryId}: amount=${acc[product.categoryId].totalAmount}, quantity=${acc[product.categoryId].totalQuantity}`);
        } else {
          // Regular products multiply amount by quantity
          acc[product.categoryId].totalAmount += amount * quantity;
          acc[product.categoryId].totalQuantity += quantity;
          
          logger.info(`Regular product reversal - ID: ${product.shopifyId}, Amount: ${amount}, Qty: ${quantity}, Total: ${amount * quantity}`);
          logger.info(`Running total for category ${product.categoryId}: amount=${acc[product.categoryId].totalAmount}, quantity=${acc[product.categoryId].totalQuantity}`);
        }
        
        return acc;
      }, {});
      
      // Log the calculated totals for debugging
      Object.entries(categorySalesMap).forEach(([categoryId, sales]: [string, any]) => {
        logger.info(`FINAL Category ${categoryId} sales to reverse: amount=${sales && sales?.totalAmount}, quantity=${sales?.totalQuantity}`);
      });
      
      // Update each category's sales record (decrement)
      const updatePromises = Object.entries(categorySalesMap).map(
        async ([categoryId, sales]: [string, any]) => {
          try {
            // Ensure amounts are valid numbers before updating DB
            const amountToDecrement = Number(sales.totalAmount) || 0;
            const quantityToDecrement = Number(sales.totalQuantity) || 0;
            
            if (isNaN(amountToDecrement) || isNaN(quantityToDecrement)) {
              logger.error(`Invalid values for category ${categoryId}: amount=${sales.totalAmount}, quantity=${sales.totalQuantity}`);
              return { success: false, categoryId, error: "Invalid numeric values" };
            }
            
            logger.info(`DB UPDATE for category ${categoryId}: amount=${-amountToDecrement}, quantity=${-quantityToDecrement}`);
            
            const result = await GroupCollectionSalesModel.findOneAndUpdate(
              {
                groupId: order.groupId,
                categoryId: categoryId
              },
              [
                {
                  $set: {
                    totalAmount: { $max: [{ $subtract: ["$totalAmount", amountToDecrement] }, 0] },
                    totalQuantity: { $max: [{ $subtract: ["$totalQuantity", quantityToDecrement] }, 0] }
                  }
                }
              ],
              { new: true }
            );
            
            logger.info(
              `Reversed sales for group ${order.groupId}, category ${categoryId}: ` +
              `-${amountToDecrement} amount, -${quantityToDecrement} quantity. New totals: amount=${result?.totalAmount}, quantity=${result?.totalQuantity}`
            );
            
            return { success: true, categoryId };
          } catch (error: any) {
            logger.error(`Failed to reverse sales for category ${categoryId}: ${error.message}`);
            return { success: false, categoryId, error: error.message };
          }
        }
      );
      
      const results = await Promise.all(updatePromises);
      const successCount = results.filter(r => r.success).length;
      
      logger.info(`Reversed sales for ${successCount}/${results.length} categories`);
    } catch (error: any) {
      logger.error(`Error in reverseCategorySales: ${error.message}`);
      throw error;
    }
  }


}
