import { CustomerModel } from "../models/customer.model";
import logger from "../configs/winston.config";

export class CustomerRepository {
    public async createCustomer(customerData: any): Promise<any | null> {
        try {
            const customer = await CustomerModel.create(customerData);
            if (!customer) {
                return null;
            }
            return customer;
        }catch(err:any){
            console.error(`CustomerRepository - createCustomer: Internal server error ${err}`);
            logger.error(`CustomerRepository - createCustomer: Internal server error ${err}`);
            throw new Error(err);
        }
    }

    public async updateCustomer(customerId: string, customerData: any): Promise<any | null> {
        try{
            const customer = await CustomerModel.findOneAndUpdate({_id:customerId}, customerData, {new: true});

            if(!customer){
                return null;
            }

            return customer;
        }catch(err:any){
            console.error(`CustomerRepository - updateCustomer: Internal server error ${err}`);
            logger.error(`CustomerRepository - updateCustomer: Internal server error ${err}`);
            throw new Error(err);
        }
    }

    public async findCustomerByShopifyId(shopifyId: string): Promise<any | null> {
        try{
            const customer = await CustomerModel.findOne({shopifyId});

            if(!customer){
                return null;
            }

            return customer;
        }catch(err:any){
            console.error(`CustomerRepository - findCustomerByShopifyId: Internal server error ${err}`);
            logger.error(`CustomerRepository - findCustomerByShopifyId: Internal server error ${err}`);
            throw new Error(err);
        }
    }

    public async processWebhookCustomer(order: any): Promise<any> {
        try {
          // Find existing customer by Shopify ID
          let customer;
          if (order?.customer?.id) {
            logger.info(`Looking for customer with Shopify ID: ${order?.customer?.id}`);
            customer = await this.findCustomerByShopifyId(order?.customer?.id?.toString());
      
            if (customer) {
              // Update existing customer
              const customerUpdateData = this.extractCustomerData(order, customer);
              customer = await this.updateCustomer(customer?._id, customerUpdateData);
              logger.info(`Updated existing customer: ${customer?._id}`);
            } else {
              // Create new customer
              const newCustomerData = this.extractCustomerData(order);
              customer = await this.createCustomer(newCustomerData);
              logger.info(`Created new customer: ${customer?._id}`);
            }
          }
      
          return customer;
        } catch (error: any) {
          logger.error(`Error processing webhook customer: ${error?.message}`);
          console.error(`Error processing webhook customer: ${error}`);
          return null;
        }
    }

    private extractCustomerData(order: any, existingCustomer?: any): any {
        // Extract customer data from webhook with optional existing customer fallback
        const data: any = {
          shopifyId: order?.customer?.id?.toString(),
          firstName: order?.billing_address?.first_name || (existingCustomer?.firstName || ""),
          lastName: order?.billing_address?.last_name || (existingCustomer?.lastName || ""),
          email: order?.customer?.email || (existingCustomer?.email || ""),
        };
        
        // Add billing address if present
        if (order?.billing_address) {
          data.billingAddress = {
            address1: order?.billing_address?.address1 || "",
            address2: order?.billing_address?.address2 || "",
            company: order?.billing_address?.company || "",
            city: order?.billing_address?.city || "",
            province: order?.billing_address?.province || "",
            provinceCode: order?.billing_address?.province_code || "",
            postalCode: order?.billing_address?.zip || "",
            country: order?.billing_address?.country || "",
            countryCode: order?.billing_address?.country_code || ""
          };
        }
        
        // Add shipping address if present
        if (order?.shipping_address) {
          data.shippingAddress = {
            address1: order?.shipping_address?.address1 || "",
            address2: order?.shipping_address?.address2 || "",
            company: order?.shipping_address?.company || "",
            city: order?.shipping_address?.city || "",
            province: order?.shipping_address?.province || "",
            provinceCode: order?.shipping_address?.province_code || "",
            postalCode: order?.shipping_address?.zip || "",
            country: order?.shipping_address?.country || "",
            countryCode: order?.shipping_address?.country_code || ""
          };
        }
        
        return data;
      }
}