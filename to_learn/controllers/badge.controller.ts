import { Request, Response } from "express";

import { BadgeRepository } from "../repository/badge.repository";
import { BunnyService } from "../services/bunny.service";
import { IBadge, ICreateBadge, IUpdateBadge } from "../types/badge.type";
import logger from "../configs/winston.config";
import { Types } from "mongoose";
import { GroupRepository } from "../repository/group.repository";

const badgeRepository: BadgeRepository = new BadgeRepository();
const bunnyService: BunnyService = new BunnyService();
const groupRepository: GroupRepository = new GroupRepository();

export class BadgeController {
    public async createBadge(req: Request, res: Response): Promise<void> {

        try{
            const files = req?.files as { [fieldname: string]: Express.Multer.File[] };
            const lockedImageFile = files?.lockedImage?.[0];
            const unlockedImageFile = files?.unlockedImage?.[0];
    
            if (!lockedImageFile || !unlockedImageFile) {
                console.error("BadgeController - createBadge: Image not provide");
                logger.error("BadgeController - createBadge: Image not provided");
                res.status(400).json({ success: false, data: null, message: 'Please provide badge image', error: null });
                return;
            }
    
            const data: ICreateBadge = req?.body?.data;
    
            if (data?.assignType ==="byCategory"  && ((data?.amountNeeded && data?.categoryQty) || (!data?.amountNeeded && !data?.categoryQty))) {
                console.error("BadgeController - createBadge: Please provide either amount or points, not both");
                logger.error("BadgeController - createBadge: Please provide either amount or points, not both");
                res.status(400).json({ success: false, data: null, message: 'Please Specify only sale amount or points', error: null });
                return;
            }
    
            // check if badge already exists
            const badgeExists = await badgeRepository.getBadgeByKey('name', data?.name);
    
            if (badgeExists) {
                console.info("BadgeController - createBadge: Badge already exists for given name");
                res.status(400).json({ success: false, data: null, message: 'Badge already exists for given name', error: null });
                return;
            }
    
            let lockedImage: string | null;
            let unlockedImage: string | null;
            // upload to bunny
            try {
                lockedImage = await bunnyService.uploadFile(lockedImageFile?.buffer, `/badges/${lockedImageFile?.originalname}`);
                unlockedImage = await bunnyService.uploadFile(unlockedImageFile?.buffer, `/badges/${unlockedImageFile?.originalname}`);
                console.log("BadgeController - lockedImage ===> ", lockedImage);
            } catch (error: any) {
                console.error("BadgeController - createBadge: Error in uploading image to bunny: ", error);
                logger.error("BadgeController - createBadge: Error in uploading image to bunny: ", error?.message);
                res.status(400).json({ success: false, data: null, message: 'Error in uploading image', error: error?.message });
                return;
            }
    
            const badge: IBadge | any = {
                ...data,
                lockedImage: lockedImage || '',
                unlockedImage: unlockedImage || '',
            };
    
            console.log("BadgeController - badgeData ===> ", badge);
    

            const newBadge = await badgeRepository.createBadge(badge);

            if (!newBadge) {
                console.error("BadgeController - createBadge: Badge not created ");
                logger.error("BadgeController - createBadge: Badge not created");
                res.status(400).json({ success: false, data: null, message: 'Badge not created', error: null });
                return;
            }

            // assign it to all groups
            await groupRepository.assignBadgeToAllGroups(newBadge._id);

            console.info("BadgeController - createBadge: Badge created successfully ");
            logger.info(`BadgeController - createBadge: Badge created successfully`);
            res.status(201).json({ success: true, data: newBadge, message: 'Badge created successfully', error: null });
            return;
                

        } catch (error: any) {
            console.error(`BadgeController - createBadge: Internal server error: ${error}`);
            logger.error(`BadgeController - createBadge: Internal server error: ${error?.message}`);
            res.status(500).json({ success: false, data: null, message: 'Internal Server Error', error: error?.message });
            return;
        }

    }

    public async updateBadge(req: Request, res: Response): Promise<void> {
        try{

            const badgeId: string = req?.params?.id;
    
            if (!badgeId) {
                console.error("BadgeController - updateBadge: Badge id not provided")
                logger.error("BadgeController - updateBadge: Badge id not provided");
                res.status(400).json({ success: false, data: null, message: 'Please provide badge id', error: null });
                return;
            }
            const badgeData: IUpdateBadge = req?.body?.data;
    
            if (badgeData?.assignType === 'byCategory' && (badgeData?.amountNeeded && badgeData?.categoryQty || !badgeData?.amountNeeded && !badgeData?.categoryQty)) {
                console.error("BadgeController - updateBadge: Please provide either amount or points, not both")
                logger.error("BadgeController - updateBadge: Please provide either amount or points, not both");
                res.status(400).json({ success: false, data: null, message: 'Please Specify only sale amount or points', error: null });
                return;
            }
    
            if (badgeData?.amountNeeded) {
                badgeData.categoryQty = null;
            }
            if (badgeData?.categoryQty) {
                badgeData.amountNeeded = null;
            }
    
            // check if badge exists
            const badgeExists = await badgeRepository.getBadgeByKey('_id', new Types.ObjectId(badgeId));
    
            if (!badgeExists) {
                console.error("BadgeController - updateBadge: Badge does not exist")
                logger.error("BadgeController - updateBadge: Badge does not exist");
                res.status(400).json({ success: false, data: null, message: 'Badge does not exist', error: null });
                return;
            }
    
    
            // check for names
            const nameExists = await badgeRepository.getBadgeByKey('name', badgeData?.name, { _id: { $ne: badgeId } });
    
            if (nameExists) {
                logger.error("BadgeController - updateBadge: Badge with name already exists");
                res.status(400).json({ success: false, data: null, message: 'Badge with name already exists', error: null });
                return;
            }

            const files = req.files as { [fieldname: string]: Express.Multer.File[] };
            const lockedImageFile = files?.lockedImage?.[0];
            const unlockedImageFile = files?.unlockedImage?.[0];

            let lockedImage: string | null = null;
            let unlockedImage: string | null = null;


            try {
                if (lockedImageFile) lockedImage = await bunnyService.uploadFile(lockedImageFile?.buffer, `/badges/${lockedImageFile?.originalname}`);
                if (unlockedImageFile) unlockedImage = await bunnyService.uploadFile(unlockedImageFile?.buffer, `/badges/${unlockedImageFile?.originalname}`);
            } catch (error: any) {
                console.error("BadgeController - updateBadge: Error in uploading image to bunny: ", error?.message);
                logger.error("BadgeController - updateBadge: Error in uploading image to bunny: ", error?.message);
                res.status(400).json({ success: false, data: null, message: 'Error in uploading image', error: error?.message });
                return;
            }

            badgeData.lockedImage = lockedImage ? lockedImage : badgeData?.lockedUrl;
            badgeData.unlockedImage = unlockedImage ? unlockedImage : badgeData?.unlockedUrl;




            const updatedBadge: IBadge | null = await badgeRepository.updateBadge(badgeId, badgeData);

            if (!updatedBadge) {
                console.error("BadgeController - updateBadge: Badge not updated ");
                logger.error("BadgeController - updateBadge: Badge not updated");
                res.status(400).json({ success: false, data: null, message: 'Badge not updated', error: null });
                return;
            }

            console.info("BadgeController - updateBadge:  Badge updated successfully ");

            logger.info("BadgeController - updateBadge: Badge updated successfully");
            res.status(200).json({ success: true, data: updatedBadge, message: 'Badge updated successfully', error: null });
            return;


        } catch (error: any) {
            console.error("BadgeController - updateBadge: Internal server error: ", error);

            logger.error("BadgeController - updateBadge: Internal server error: ", error?.message);
            res.status(500).json({ success: false, data: null, message: 'Internal Server Error', error: error?.message });
            return;
        }

    }

    public async deleteBadge(req: Request, res: Response): Promise<void> {
        const badgeId: string = req?.params?.id;

        if (!badgeId) {
            logger.error("BadgeController - deleteBadge: Badge id not provided");
            res.status(400).json({ success: false, data: null, message: 'Please provide badge id', error: null });
            return;
        }

        try {
            // find if it exists
            const badgeExists: IBadge | null = await badgeRepository.getBadgeByKey('_id', badgeId);

            if (!badgeExists) {
                logger.error("BadgeController - deleteBadge: Badge does not exist");
                res.status(400).json({ success: false, data: null, message: 'Badge does not exist', error: null });
                return;
            }

            const deletedBadge: IBadge | null = await badgeRepository.deleteBadge(badgeId);

            if (!deletedBadge) {
                logger.error("BadgeController - deleteBadge: Badge not deleted");
                res.status(400).json({ success: false, data: null, message: 'Badge not deleted', error: null });
                return;
            }

            await groupRepository.removeBadgeFromGroups(badgeId);
            console.log("BadgeController - deletedBadge ===> ", deletedBadge);
            logger.info("BadgeController - deleteBadge: Badge deleted successfully");
            res.status(200).json({ success: true, data: deletedBadge, message: 'Badge deleted successfully', error: null });
            return;

        } catch (error: any) {
            console.error("BadgeController - deleteBadge: ", error);
            res.status(500).json({ success: false, data: null, message: 'Internal Server Error', error: error?.message });
            return;
        }

    }

    public async getBadgeById(req: Request, res: Response): Promise<void> {
        const badgeId: string = req?.params?.id;

        if (!badgeId) {
            logger.error("BadgeController - getBadgeById: Badge id not provided");
            res.status(400).json({ success: false, data: null, message: 'Badge id is required', error: null });
            return;
        }

        try {
            const badge: IBadge | null = await badgeRepository.getBadgeByKey('_id', new Types.ObjectId(badgeId));

            if (!badge) {
                logger.error("BadgeController - getBadgeById: Badge does not exist");
                res.status(400).json({ success: false, data: null, message: 'Badge does not exist', error: null });
                return;
            }

            console.log("BadgeController - badge ===> ", badge);
            logger.info("BadgeController - getBadgeById: Badge fetched successfully");
            res.status(200).json({ success: true, data: badge, message: 'Badge fetched successfully', error: null });
            return;

        } catch (error: any) {
            console.error("BadgeController - getBadgeById: Internal server error: ", error);
            logger.error("BadgeController - getBadgeById: Internal server error: ", error?.message);
            res.status(500).json({ success: false, data: null, message: 'Internal Server Error', error: error?.message });
            return;
        }
    }

    public async getAllBadges(req: Request, res: Response): Promise<void> {

        const name: string = req?.query?.name as string;
        const badgeType: string = req?.query?.badgeType as string;
        const minPoints: number = parseInt(req?.query?.minPoints as string) || 0;
        const maxPoints: number = parseInt(req?.query?.maxPoints as string) || 0;
        const minAmount: number = parseFloat(req?.query?.minAmount as string) || 0;
        const maxAmount: number = parseFloat(req?.query?.maxAmount as string) || 0;

        const pageNo = parseInt(req?.query?.pageNo as string, 10);
        const pageSize = parseInt(req?.query?.pageSize as string, 10);

        if (pageNo && (isNaN(pageNo) || pageNo <= 0)) {
            logger.error("BadgeController - getAllBadges: Invalid page number");
            res.status(400).json({ success: false, data: null, message: 'Invalid page number' });
            return;
        }

        if (pageSize && isNaN(pageSize) || pageSize <= 0) {
            logger.error("BadgeController - getAllBadges: Invalid page size");
            res.status(400).json({ success: false, data: null, message: 'Invalid page size' });
            return;
        }


        try {

            const badges = await badgeRepository.getBadges({
                pageNo, pageSize, name, badgeType, minPoints, maxPoints, minAmount, maxAmount
            });

            console.log("BadgeController - badges ===> ", badges);
            logger.info("BadgeController - getAllBadges: Badges fetched successfully");

            res.status(200).json({ success: true, data: badges, message: 'Badges fetched successfully', error: null });
            return;


        } catch (err: any) {
            console.error("BadgeController - getAllBadges: Internal server error: ", err);
            logger.error("BadgeController - getAllBadges: Internal server error: ", err?.message);
            res.status(500).json({ success: false, data: null, message: 'Internal Server Error', error: err?.message });
            return;
        }

    }
}