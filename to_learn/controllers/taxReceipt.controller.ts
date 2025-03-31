import { json, Request, RequestHandler, Response } from "express";
import { TaxReceiptRepository } from "../repository/taxReceipt.repository";
import { BunnyService } from "../services/bunny.service";
import logger from "../configs/winston.config";
import { TaxReceiptService } from "../services/taxReceipt.service";
import { error } from "console";

const taxReceiptConfigRepository = new TaxReceiptRepository();
const bunnyService: BunnyService = new BunnyService();
const taxReceiptService = new TaxReceiptService();

export class TaxReceiptController {

    public async createOrUpdateTaxReceiptConfig(req: Request, res: Response): Promise<void> {
        try{
            const configData = req?.body?.data;
            console.log("configData",configData)

            const files = req?.files as { [fieldname: string]: Express.Multer.File[] };

            console.log("files",files)

            if (files?.signatureImage?.[0]) {
                const uploadedSignature = await bunnyService.uploadFile(
                    files?.signatureImage[0]?.buffer,
                    `/taxReceipts-config/${files?.signatureImage[0]?.originalname}`
                );
                configData.signatureImage = uploadedSignature; // Store the URL
            }

             // Upload logo if provided
            if (files?.logo?.[0]) {
                const uploadedLogo = await bunnyService.uploadFile(
                    files?.logo[0]?.buffer,
                    `/taxReceipts-config/${files?.logo[0]?.originalname}`
                );
                configData.logo = uploadedLogo; // Store the URL
            }

            const taxReceiptConfig = await taxReceiptConfigRepository.createOrUpdateTaxReceiptConfig(configData);

            if(taxReceiptConfig){
                res.status(200).json({
                    success: true,
                    message: "Tax receipt saved successfully",
                    data: taxReceiptConfig
                });
            } else {
                res.status(400).json({
                    success: true,
                    message: "Unable to create/update tax receipt config",
                    data: null
                });
            }

        } catch (error:any) {
            res.status(500).json({
                success: true,
                message: "Unable to create/update tax receipt config",
                data: null,
                error: error?.message
            });
        }
    }

    public async getTaxReceiptConfig(req: Request, res: Response): Promise<void> {
        try{
            const taxReceiptConfig = await taxReceiptConfigRepository.getTaxReceiptConfig();

            if(taxReceiptConfig){
                res.status(200).json({
                    success: true,
                    message: "Tax receipt config fetched successfully",
                    data: taxReceiptConfig
                });
            } else {
                res.status(400).json({
                    success: true,
                    message: "Unable to get tax receipt config",
                    data: null
                });
            }
        } catch (error:any) {
            res.status(500).json({
                success: true,
                message: "Unable to get tax receipt config",
                data: null,
                error: error?.message
            });
        }
    }



    public async handleTaxReceipt (req: Request, res: Response): Promise<void> {
        try {
            console.log("req body-------",req.body)
            logger.info("req body-----"+JSON.stringify(req.body))

            if (!req.body || Object.keys(req.body).length === 0) {
                logger.error("req body is not present");
                console.error("req body is not present");
                throw new Error("req body is not present");
            }

            res.status(200).json({success: true, message: "Order webhook received" });

            const response = await taxReceiptService.generateAndSendTaxReceipt(req.body);

            if (!response) {
                logger.error("Failed to send tax receipt");
                console.error("Failed to send tax receipt");
                throw new Error("Failed to send tax receipt");     
            }else{
                logger.info("TaxReceiptController - tax receipt processed successfully for orderId: " + req.body.id);
                console.log("TaxReceiptController - tax receipt processed successfully for orderId: " + req.body.id);
            }
        } catch (error: any) {
            console.error("error in TaxReceiptController------",error)
            logger.error("error in TaxReceiptController------" + JSON.stringify(error, Object.getOwnPropertyNames(error)));
        }
    }
}

