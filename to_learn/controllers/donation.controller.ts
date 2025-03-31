import { Request, Response } from "express";
import { DonationRepository } from "../repository/donation.repository";
import logger from "../configs/winston.config";



const donationRepository: DonationRepository = new DonationRepository();

export class DonationController {

    public async acceptShopifyDonation(req: Request, res: Response): Promise<void> {
        console.log("Request:>>>>>>", req.body);
    
        const data = req?.body;
    
        try {
          let donationAmount = 0;
          let donationType: "standalone" | "productBased" = "standalone";

          if (data?.line_items) {
            if(data?.line_items?.length > 1){
              donationType = "productBased";
              const donationItem = data?.line_items?.find((item:any) => item?.vendor === "Group Fundraisers");
              console.log("donationItem:>>>>>>",donationItem)
              // If found, use its price as the donation amount
              if (donationItem) {
                  donationAmount = parseFloat(donationItem?.price) * donationItem?.quantity;
                  console.log("donationAmount:",donationAmount);
              }

            } else {

              if(data?.line_items[0]?.vendor === "DonateMate"){
                donationType = "standalone";
                donationAmount = data?.total_price;
              } else {
                return;
              }

            }
          }

          const donationData = {
            orderId: data?.id,
            donorFirstName: data?.customer?.first_name,
            donorLastName: data?.customer?.last_name,
            donorEmail: data?.customer?.email,
            donorPhone: data?.customer?.phone,
            donationAmount: donationAmount,
            groupId: data?.note_attributes[0]?.value,
            donationDate: data?.created_at,
            currencyCode: data?.currency,
            donationType: donationType
          };
    
          console.log("donationData:>>>>>>", donationData);

          const donation = await donationRepository.acceptDonation(donationData);

          if(donation){
            logger.info(
              "Accept Donation - Donation Accepted Successfully",
            );
            res.status(200).json({
                success: true,
                data: donation,
                message: "Donation Accepted Successfully",
              });
          } else{
            logger.error(
              "Accept Donation - Error while storing donation",
            );
            res.status(400).json({
                success: false,
                data: null,
                message: "Error while storing donation",
              });
          }
        } catch (err: any) {
          logger.error(
            "Accept Donation - Internal server error",
            err?.message
          );
          res
            .status(500)
            .json({
              success: false,
              data: null,
              message: "Internal server error",
              error: err?.message,
            });
        }   
      }
}