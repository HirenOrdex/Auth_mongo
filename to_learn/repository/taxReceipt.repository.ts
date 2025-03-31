import logger from "../configs/winston.config";
import { OrderModel } from "../models/order.model";
import { ProductsModel } from "../models/product.model";
import { TaxReceiptConfigModel } from "../models/taxReceiptConfig.model";
import { TaxReceiptPdfModel } from "../models/taxReceiptPdfDetails.model";
import { ShopifyService } from "../services/shopify.service";

const shopifyService:ShopifyService = new ShopifyService();

export class TaxReceiptRepository {

    public async createOrUpdateTaxReceiptConfig(config: any) {
        try{
            const findConfig = await TaxReceiptConfigModel.find({isDeleted: false});
            if (findConfig.length > 0) {
                let updateConfig;
                if (config.startingNum == findConfig[0]?.startingNum) {
                    updateConfig = await TaxReceiptConfigModel.updateOne({ isDeleted: false }, config);
                } else {
                    config.isStartingFieldUpdated = true;
                    updateConfig = await TaxReceiptConfigModel.updateOne({ isDeleted: false }, config);
                }
                return updateConfig;
            } else {
                const newConfig = new TaxReceiptConfigModel(config);
                await newConfig.save();
                return newConfig;
            }
        } catch(error:any){
            throw new Error(error?.message);
        }
    }

    public async getTaxReceiptConfig() {
        try {
            const taxReceiptConfig = await TaxReceiptConfigModel.findOne({ isDeleted: false });
            return taxReceiptConfig;
        } catch (error: any) {
            throw new Error(error?.message);
        }
    }

    public async getProductDetails(productId: number, totalAmount: number) {
        try {
            // Query MongoDB using the last digits of `shopifyId`
            let productData = await ProductsModel.findOne({
                shopifyId: { $regex: `${productId}$` }
            });

            let parentProduct
            //If the product has a `parentProduct`, fetch the main product instead
            if (productData?.parentProduct) {
                console.log(`Fetching parent product for: ${productData.name}`);
                parentProduct = await ProductsModel.findOne({ _id: productData.parentProduct });
                console.log("parentProduct----",parentProduct)
            }

            if (productData) {
                console.log("parentProduct?.recieptQuantity------",parentProduct?.recieptQuantity)
                console.log("productData?.recieptQuantity----",productData?.recieptQuantity)
                const recieptPercentage = parentProduct?.recieptQuantity ?? productData?.recieptQuantity ?? 0;

                // Calculate taxable amount
                const taxableAmount = (recieptPercentage / 100) * totalAmount;

                console.log(`Product Found: ${productData.name}`);
                console.log(`Total Amount: $${totalAmount}`);
                console.log(`Reciept Percentage: ${recieptPercentage}%`);
                console.log(`Taxable Amount: $${taxableAmount.toFixed(2)}\n`);

                return {
                    name:productData.name,
                    amount: totalAmount,
                    taxPercentage:recieptPercentage,
                    taxReceiptableAmount: taxableAmount
                };
            } else {
                console.log(`Product with Shopify ID ending in ${productId} not found.`);
                logger.error(`Product with Shopify ID ending in ${productId} not found.`);
            }
        } catch (error:unknown) {
            console.error(`Error fetching product:${productId}`, error);
                logger.error(`Error fetching product:${productId}` + JSON.stringify(error, Object.getOwnPropertyNames(error)));
        }
    };

    public async generatetaxReceiptNo(
        prefix: string, 
        taxReceiptLength: number, 
        startingNum: number, 
        currentNum: number,
        isStartingFieldUpdated: boolean
    ): Promise<string> {
        try {
            const taxReceiptData = await TaxReceiptPdfModel.findOne().sort({ createdAt: -1 });
            console.log("taxReceiptData-------",taxReceiptData)
    
            let taxReceiptNo;
            let formattedTaxNumber: string;
    
            if (taxReceiptData && taxReceiptData?.taxReceiptNo && !isStartingFieldUpdated) {
                console.log("in if----")
                console.log("taxReceiptData====", taxReceiptData);
                const taxReceiptConfig = taxReceiptData.taxReceiptNo;
                console.log("taxReceiptConfig---", taxReceiptConfig);
    
                // Extract last numeric part of tax receipt
                const lastNumber = parseInt(taxReceiptConfig.replace(prefix, ''), 10);
                const newNumber = lastNumber + currentNum; // Increment by currentNum
    
                // Ensure new number is padded properly
                formattedTaxNumber = newNumber.toString().padStart(taxReceiptLength, '0');
            } else {
                console.log("in else----")
                // Start with the initial number, ensuring it's padded properly
                formattedTaxNumber = startingNum.toString().padStart(taxReceiptLength, '0');
            }
    
            console.log("formattedTaxNumber------", formattedTaxNumber);
            taxReceiptNo = `${prefix}${formattedTaxNumber}`;
            console.log("Generated Tax Receipt No:", taxReceiptNo);
            return taxReceiptNo;
        } catch (error: any) {
            console.error("error in generatetaxReceiptNo------", error)
            logger.error(`Error in generatetaxReceiptNo`+ JSON.stringify(error, Object.getOwnPropertyNames(error)));
            throw new Error(error?.message);
        }
    }

    public async getDonerName(admin_graphql_api_id: string): Promise<string | null> {
        try {
            // console.log("id-------", id)
            // const donerData = await OrderModel.findOne({ orderId: id });

            const donerData = await shopifyService.getOrderMetafeilds(admin_graphql_api_id);

            console.log("donerData----",donerData);
    

            const donation_from = donerData?.find((meta: any) => meta.key === 'Donation_From')?.value || '';
    
            console.log("donationFrom----", donation_from || null);
    
            return donation_from ?? null;
        } catch (error: any) {
            console.error("error in getDonerName------", error)
            logger.error(`Error in getDonerName`+ JSON.stringify(error, Object.getOwnPropertyNames(error)));
            throw new Error(error?.message);
        }
    }
    
    

    public async sendTextReceipt(body: any) {
        try {
            console.log("body----", body)
            const { line_items, billing_address, created_at , email , subtotal_price , id , admin_graphql_api_id , note_attributes} = body
            const taxReceiptConfig:any = await TaxReceiptConfigModel.findOne({ isDeleted: false });

            const groupName = note_attributes[1].value
            const groupId = note_attributes[0].value
            console.log("groupname-------", groupName)
            console.log("groupId-------", groupId)

            //to generate receipt number
            const taxReceiptNo= await this.generatetaxReceiptNo(taxReceiptConfig?.prefix,taxReceiptConfig?.taxReceiptLength,taxReceiptConfig?.startingNum,taxReceiptConfig?.currentNum,taxReceiptConfig?.isStartingFieldUpdated)
            console.log("taxReceiptNo-----",taxReceiptNo)


            // to get product data
            const onlyProductData = line_items.filter((e: { vendor: string; }) => e.vendor == 'scouts')
            let productData = []
            if (onlyProductData?.length > 0) {
                productData = await Promise.all(onlyProductData.map(async (item: any) => {
                    return this.getProductDetails(item.product_id, item.pre_tax_price);
                }));

            }
            console.log("fetchProductsData----", productData)

            // to get donation amount
            const onlyDonationData = line_items.filter((e: { vendor: string; }) => e.vendor == "Group Fundraisers" || e.vendor == "DonateMate")
            let donationAmount = 0
            if (onlyDonationData?.length > 0) {
                donationAmount = parseFloat(onlyDonationData[0].pre_tax_price)
                console.log("fetchdonationData----", donationAmount)
            }

            console.log("productData-----", productData)
            // to get total tax receiptable amount
            const totalTaxReceiptableAmount = (productData.reduce((sum, item) => sum + parseFloat(item.taxReceiptableAmount), 0) + donationAmount).toFixed(2);
            console.log("totalTaxReceiptableAmount----", totalTaxReceiptableAmount)

            // to get doner name
            const donerName= await this.getDonerName(admin_graphql_api_id)
            console.log("donerName----", donerName)

            //format date and time
            const formatDateAndTime = (dateStr: string): string => {
                const date = new Date(dateStr);

                const simpleDate = date.toLocaleString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });

                return simpleDate;
            };
            const orderDate = formatDateAndTime(created_at)
            console.log("order date-----", orderDate)

            return { taxReceiptConfig,billing_address, productData, donationAmount, totalTaxReceiptableAmount, orderDate,taxReceiptNo , email , subtotal_price , donerName , admin_graphql_api_id , groupName, groupId}
        } catch (error: any) {
            console.error("error in sendTextReceipt------", error)
            logger.error("Error in sendTextReceipt" + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            throw new Error(error?.message);
        }
    }

    public async addTaxReceiptPdfData(data: any) {
        try {
            console.log("data------",data)
            const addData = await TaxReceiptPdfModel.create(data)
            console.log("add data------", addData)

            if (!addData) {
                return null
            }
            return addData
        } catch (error: any) {
            console.error("error in addTaxReceiptPdfData repository------", error)
            logger.error("Error in addTaxReceiptPdfData repository" + JSON.stringify(error, Object.getOwnPropertyNames(error)));
            throw new Error(error?.message);
        }
    }

}