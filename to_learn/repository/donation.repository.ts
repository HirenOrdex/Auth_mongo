import logger from '../configs/winston.config';
import DonationModel from '../models/donation.model';


export class DonationRepository { 

    public async acceptDonation(donationData:any){
        try{

            let donationAmount = 0;
          let donationType: "standalone" | "productBased" = "standalone";

          if (donationData?.line_items) {
            if(donationData?.line_items?.length > 1){
              donationType = "productBased";
              const donationItem = donationData?.line_items?.find((item:any) => item?.vendor === "Group Fundraisers");
              console.log("donationItem:>>>>>>",donationItem)
              // If found, use its price as the donation amount
              if (donationItem) {
                  donationAmount = parseFloat(donationItem?.price ) * donationItem?.quantity;
                  console.log("donationAmount:",donationAmount);
              }

            } else {
              if(donationData?.line_items[0]?.vendor === "Group Fundraisers"){
                donationType = "standalone";
                donationAmount = donationData?.total_price;
              } else {  
                return;
              }
            }
          }

          const donationdonationData = {
            orderId: donationData?.id,
            donorFirstName: donationData?.customer?.first_name,
            donorLastName: donationData?.customer?.last_name,
            donorEmail: donationData?.customer?.email,
            donorPhone: donationData?.customer?.phone,
            donationAmount: donationAmount,
            groupId: donationData?.note_attributes[0]?.value,
            donationDate: donationData?.created_at,
            currencyCode: donationData?.currency,
            donationType: donationType
          };
    
          console.log("donationData:>>>>>>", donationdonationData);

            const storeDonation = await DonationModel.create(donationdonationData);

            console.log("storeDonation",storeDonation);

            if(storeDonation){
                logger.info("AcceptDonation : Donation Stored Successfully")
                return donationData;
            } else{
                logger.error("AcceptDonation : Error while storing donation")
                return null;
            }

        } catch(err){
            logger.error("AcceptDonation : Server Error while storing donation", err)
        }
    }

    public async processOrderDonations(order: any): Promise<{
      processedOrder: any;
      donationAmount: number;
      donationProcessed: boolean;
    }> {
      try {
        let donationAmount = 0;
        let donationProcessed = false;
        
        // Clone order to avoid mutating the original
        const processedOrder = JSON.parse(JSON.stringify(order));
        
        // Find donation product
        const donationProduct = processedOrder?.line_items?.find(
          (item: any) => item?.vendor === "Group Fundraisers"
        );
        
        if (donationProduct) {
          // Process donation
          await this.acceptDonation(processedOrder);
          
          // Calculate donation amount
          donationAmount = parseFloat(donationProduct?.price) * (donationProduct?.quantity || 1);
          
          // Remove donation from line items
          processedOrder.line_items = processedOrder?.line_items?.filter(
            (item: any) => item?.id !== donationProduct?.id
          );
          
          donationProcessed = true;
          logger.info(`Processed donation of ${donationAmount} for order ${order.id}`);
        }
        
        return {
          processedOrder,
          donationAmount,
          donationProcessed
        };
      } catch (error: any) {
        logger.error(`Error processing donations: ${error?.message}`);
        return {
          processedOrder: order,
          donationAmount: 0,
          donationProcessed: false
        };
      }
    }

}