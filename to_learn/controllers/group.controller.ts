import { Request, Response } from "express";
import { GroupRepository } from "../repository/group.repository";
import logger from "../configs/winston.config";
import {
  ICreateGroup,
  IGroup,
  IGroupCrestImage,
  IUpdateGroup,
} from "../types/group.type";
import { BunnyService } from "../services/bunny.service";
import ExcelJS from 'exceljs';
import MailService from "../services/email.service";
import { UserRepository } from "../repository/user.repository";
import { RolesModel } from "../models/role.model";
import { GroupLeaderRepository } from "../repository/groupLeader.repository";
import { OfflineProductRepository } from "../repository/offlineProducts.repository";
import { BadgeRepository } from "../repository/badge.repository";
import { GroupModel } from "../models/group.model";
import { UpcomingEventsModel } from "../models/upcomingEvents.model";
import { ProductRepository } from "../repository/product.repository";
import { FRONTEND_BASEURL, GROUP_ADDITION_CONFIRMATION_TEMPLATE_ID, SCOUT_LOGO, SHOPIFY_BASEURL } from "../configs/env.config";
import { sendEmailWithTemplate } from "../services/sendgrid.service";

const mailService = new MailService();
const groupRepository: GroupRepository = new GroupRepository();
const bunnyService: BunnyService = new BunnyService();
const userRepository: UserRepository = new UserRepository();
const groupLeaderRepository: GroupLeaderRepository = new GroupLeaderRepository();
const offlineProductRepository: OfflineProductRepository = new OfflineProductRepository();
const badgeRepository: BadgeRepository = new BadgeRepository();

type ResponseType = {
  success: boolean;
  data: any;
  message: string;
  error: any;
};

export class GroupController {
  public async createGroup(req: Request, res: Response): Promise<void> {
    try {
      const crest = req?.files as Express.Multer.File[];
      console.log("crest==>", crest);
      console.log("req.body==>", req?.body?.data);
      const {
        name,
        description,
        groupLeader,
        categories,
        goals,
      }: ICreateGroup = req?.body?.data;

      const group = await groupRepository.getGroupByKey('name', name);

      if (group) {
        res.status(400).json({
          success: false,
          data: null,
          message: "The group already exists.",
        });
        return;
      }

      if (crest?.length > 1) {
        logger.error("CreateGroup : Only one crest image is allowed");
        res.status(400).json({
          success: false,
          data: null,
          message: "Only one crest image is allowed",
        });
        return;
      }

      // filter start

      let uniqueImageUrls: IGroupCrestImage[] = [];

      const imageUrls: IGroupCrestImage[] = [];

      const uploadPromises = crest?.map(async (crest) => {
        const url = await bunnyService.uploadFile(
          crest?.buffer,
          `/group/crest/${crest?.originalname}`,
        );

        if (url) {
          imageUrls.push({ url: url, fileName: crest?.originalname });
        }
      });

      // Wait for all promises to resolve
      await Promise.all(uploadPromises);

      //filter out the duplicate images
      uniqueImageUrls = imageUrls?.filter(
        (image, index, self) =>
          index === self?.findIndex((t) => t?.url === image?.url),
      );

      console.log("imageurls ==> ", uniqueImageUrls);

      // let group: IGroup | null | any = await groupRepository?.getGroupByKey("email", email);

      // if (group) {
      //   logger.info(`CreateGroup : Group already exists`);
      //   console.log("CreateGroup : Group already exists");
      //   res.status(400).json({
      //     success: false,
      //     data: null,
      //     message: "Group already exists",
      //     error: null,
      //   });
      //   return;
      // }

      let role = await RolesModel.findOne({ name: "group" });
      if (!role) {
        logger.error("GroupController - createGroup : Role not found");
        console.error("GroupController - createGroup : Role not found");
        res.status(400).json({
          success: false,
          data: null,
          message: "Role not found",
          error: null,
        });
        return;
      }

      console.log("role", role)

      //let group: IGroup[] | null = await groupRepository?.getGroupByKey("email", email);
      const groupData: ICreateGroup = {
        name,
        description: description || "Scout groups fundraise to support a variety of activities and initiatives. Funds raised often go toward organizing camps, outdoor adventures, and community service projects, as well as covering the cost of equipment and uniforms.\n\nThese efforts ensure that Scouts have the resources they need to develop skills, foster teamwork, and contribute positively to their local communities.\n\nFundraising also helps keep membership fees affordable and ensures that all young people can participate, regardless of financial background.",
        crest: uniqueImageUrls.length > 0  ? uniqueImageUrls.map((img) => img.url) : [`${SCOUT_LOGO}`],
        groupLeader,
        categories,
        goals,
        badges: await badgeRepository.getDefaultBadges() || [],
      };

      const createdGroup = await groupRepository?.createGroup(groupData);

      if (!createdGroup) {
        logger.error(`GroupController - createGroup : Unable to create group`);
        console.error("GroupController - createGroup : Unable to create group");
        res.status(400).json({
          success: false,
          data: null,
          message: null,
          error: "Unable to create group",
        });
        return;
      }

      logger.info(`GroupController - createGroup : Group created successfully`);
      //console.log("Group==>", createdGroup);
      res.status(201).json({
        success: true,
        data: createdGroup,
        message: "Group created successfully",
        error: null,
      });
      return;

    } catch (err: any) {
      logger.error(`GroupController : createGroup - internal server error: ${err?.message}`);
      console.error("GroupController : createGroup - internal server error: ", err?.message);

      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message,
      });
      return;
    }
  }

  public async getAllGroup(req: Request, res: Response): Promise<void> {
    const pageNo = parseInt(req?.query?.pageNo as string) || 1;
    const pageSize = parseInt(req?.query?.pageSize as string) || 10;

    if (pageNo && isNaN(pageNo) || pageSize && isNaN(pageSize)) {
      logger.error("GroupController: getAllGroup - Invalid page number or page size");
      res.status(400).json({
        success: false,
        data: null,
        message: "Invalid page number or page size",
        error: null,
      });
      return;
    }

    const name = (req?.query?.name as string) || null;
    const categoryId = (req?.query?.categoryId as string) || null;
    const amount = parseFloat(req?.query?.amount as string) || null;


    try {
      const groups: {
        group: IGroup[];
        totalCount: number;
        hasPreviousPage: boolean;
        hasNextPage: boolean;
      } | null = await groupRepository?.getAllGroup({
        name,
        pageNo,
        pageSize,
        categoryId,
        amount,
      });

      //console.log("groups==>", groups);

      if (!groups) {
        logger.info("GroupController: getAllGroup - No groups found");
        res.status(200).json({
          success: true,
          data: null,
          message: "No Groups Found!",
          error: null,
        });
        return;
      }

      //const { group, totalCount, hasPreviousPage, hasNextPage } = groups
      logger.info(`GroupController: getAllGroup - Groups Found Successfully`)
      res.status(200).json({
        success: true,
        data: groups,
        message: "Groups fetched successfully",
        error: null,
      });
      return;
    } catch (err: any) {
      logger.error(`CreateGroup : getAllGroup - internal server error: ${err?.message}`);
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err.message,
      });
      return;
    }
  }

  public async updateGroup(req: Request, res: Response): Promise<void> {
    const id: string = req?.params?.id;

    if (!id) {
      logger.error("GroupController: updateGroup - no id provided.")
      res.status(400).json({
        success: false,
        data: null,
        message: "Invalid group id",
        error: null,
      });
      return;
    }

    try {
      const {
        name,
        email,
        description,
        groupLeader,
        categories,
        goals,
        crest,
        offlineProducts
      } = req?.body?.data;

      const images = req?.files as Express.Multer.File[];

      if (images?.length > 1) {
        logger.error("GroupController: updateGroup - Only one crest image is allowed");
        res.status(400).json({
          success: false,
          data: null,
          message: "Only one crest image is allowed",
          error: null,
        });
        return;
      }

      console.log("Crest>>>>", crest);

      let uniqueImageUrls: IGroupCrestImage[] = [];

      console.log("Images>>>", images)
      if (images?.length > 0) {
        // filter start
        console.log("Images found>>>")

        const imageUrls: IGroupCrestImage[] = [];

        const uploadPromises = images?.map(async (images) => {
          const url = await bunnyService.uploadFile(
            images?.buffer,
            `/group/crest/${images?.originalname}`,
          );

          if (url) {
            imageUrls.push({ url: url, fileName: crest?.originalname });
          }
        });

        // Wait for all promises to resolve
        await Promise.all(uploadPromises);

        //filter out the duplicate images
        uniqueImageUrls = imageUrls?.filter(
          (image, index, self) =>
            index === self?.findIndex((t) => t?.url === image?.url),
        );

        console.log("imageurls ==> ", uniqueImageUrls);
      }

      const mergedCrest = [
        ...(Array.isArray(crest) ? crest : []),            // Existing crest URLs
        ...uniqueImageUrls.map((img) => img.url)           // New uploaded image URLs
      ];

      // Remove duplicate URLs
      const finalCrest = [...new Set(mergedCrest)];


      const groupData: IUpdateGroup = {
        name,
        description: description || "Scout groups fundraise to support a variety of activities and initiatives. Funds raised often go toward organizing camps, outdoor adventures, and community service projects, as well as covering the cost of equipment and uniforms.\n\nThese efforts ensure that Scouts have the resources they need to develop skills, foster teamwork, and contribute positively to their local communities.\n\nFundraising also helps keep membership fees affordable and ensures that all young people can participate, regardless of financial background.",
        groupLeader,
        categories,
        goals,
        crest: finalCrest || [`${SCOUT_LOGO}`],
      };

      console.log("Final Group Data>>>>", groupData);

      const updatedGroup: IGroup | null = await groupRepository?.updateGroup(
        id,
        groupData,
      );

      if (!updatedGroup) {
        logger.error("CreateGroup : updateGroup - Unable to update group");
        res.status(400).json({
          success: false,
          data: null,
          message: "Unable to update group",
          error: null,
        });
        return;
      }

      if (offlineProducts) {
        console.log("Offline Products>>>>", offlineProducts);
        await offlineProductRepository.manageGroupOfflineProductSale(id, offlineProducts);
      }

      // also update user
      // const user = await userRepository.getUserByKey("_id", updatedGroup?.userId ? updatedGroup?.userId.toString() : "");
      // if (user) {
      //   await userRepository.updateUser(user?.email, { firstName: updatedGroup?.name, email: updatedGroup?.email });
      // }else{
      //   res.status(400).json({
      //     success: false,
      //     data: null,
      //     message: "Unable to find user associated with group",
      //     error: null
      //   });
      //   return;
      // }

      console.log("GroupController: updateGroup - group updated successfully", updatedGroup);

      res.status(200).json({
        success: true,
        data: updatedGroup,
        message: "Group updated successfully",
        error: null,
      });
    } catch (err: any) {
      logger.error("GroupController: updateGroup - internal server error.", err?.message);
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message,
      });
      return;
    }
  }

  public async getGroupById(req: Request, res: Response) {
    const id: string = req?.params?.id;

    if (!id) {
      logger.error("GroupController: getGroupById - no id provided.")
      res.status(400).json({
        success: false,
        data: null,
        message: "group id is required",
        error: null
      });
      return;
    }

    try {

      const group = await groupRepository.getGroupById(id);

      if (!group) {
        logger.error(`GroupController: getGroupById Unable to find group for ID: ${id}`);
        res.status(400).json({
          success: false,
          data: null,
          message: "Unable to find group."
        });
        return;
      }

      console.log("GroupController: getGroupById - group fetched successfully.", group);
      logger.info(`GroupController: getGroupById - group fetched successfully.`)

      res.status(200).json({
        success: true,
        data: group,
        message: "group fetched successfully.",
        error: null
      })
      return;
    } catch (err: any) {
      logger.error("GroupController: getGroupById - internal server error.", err?.message);
      res.status(500).json({
        success: false,
        data: null,
        message: "internal server error",
        error: err?.message
      })
      return;
    }
  }

  public async deleteGroup(req: Request, res: Response) {
    const id: string = req?.params?.id;

    if (!id) {
      logger.error("GroupController: deleteGroup - no id provided.");
      res.status(400).json({
        success: false,
        data: null,
        message: "groupId is required",
        errorr: null
      })
      return;
    }

    try {

      const deletedGroup: IGroup | null = await groupRepository.deleteGroup(id);

      if (!deletedGroup) {
        logger.error("GroupController: deleteGroup - there was a problem when deleting group");
        res.status(400).json({
          success: false,
          data: null,
          message: "there was a problem when deleting group",
          error: null
        });
        return;
      }

      await offlineProductRepository.removeOfflineProductSaleByGroup(id);

      // // delete user associated with group
      // const user = await userRepository.getUserByKey("email", deletedGroup?.email);
      // if (user) {
      //   await userRepository.deleteUser(user?.email);
      // }

      console.log("GroupController: deleteGroup - group deleted successfully", deletedGroup);
      logger.info("GroupController: deleteGroup - group deleted successfully");

      res.status(200).json({
        success: true,
        data: deletedGroup,
        message: "Group deleted successfully",
        error: null
      });
      return;
    } catch (err: any) {
      logger.error("GroupController: deleteGroup - internal server error.", err?.message);
      res.status(500).json({
        success: false,
        data: null,
        message: "Internel server error",
        error: err?.message
      })
      return;
    }
  }

  public async createBulkGroups(req: Request, res: Response): Promise<void> {
    try {
      // Basic file check and workbook load
      if (!req?.file) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Please upload a file"
        });
        return;
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req?.file?.buffer);
      const worksheet: any = workbook.getWorksheet(1);

      // Collect all rows (skip header)
      const rows: any[] = [];
      worksheet?.eachRow((row: any, rowIndex: number) => {
        if (rowIndex !== 1) rows.push(row);
      });

      if (rows?.length === 0) {
        res.status(400).json({
          success: false,
          data: {
            failedEntries: [{ message: "Unfortunately, we could not upload your file as there were some errors, Uploaded file does not contain any records." }]
          },
          message: "Uploaded file does not contain any records.",
          error: null
        });
        return;
      }

      // Arrays to collect basic check errors (no DB access yet)
      const basicFailedEntries: any[] = [];
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const sheetGroupNames = new Set<string>();

      // Basic validations (email and product/goal amount matching)
      for (const row of rows) {
        const [name, description, groupLeaderEmail, firstName, lastName, categories, ...goalAmountArray] = row.values.slice(1);

        const email = typeof groupLeaderEmail === 'object' ? groupLeaderEmail?.text : groupLeaderEmail;

        if (!email) {
          basicFailedEntries.push({
            message: `Row ${row?.number}: No email provided.`
          });
          continue;
        }

        if (!emailRegex.test(email)) {
          basicFailedEntries.push({
            message: `Row ${row?.number}: The email ${email} is invalid.`,
          });
          continue;
        }

        const categoryNames = categories?.split(",")?.map((p: string) => p.trim());
        const goalAmounts = goalAmountArray?.map((amt: any) => parseFloat(amt))?.filter((amt: any) => !isNaN(amt));

        console.log("Category Names>>>", categoryNames);
        console.log("Goal Amounts>>>", goalAmounts);


        if (!categoryNames || !goalAmounts || categoryNames?.length !== goalAmounts?.length) {
          basicFailedEntries?.push({
            message: `Row ${row.number}: Products and goal amounts do not match or are missing or are not valid.`
          });
          continue;
        }

        // Check for duplicate group names in the sheet
        if (sheetGroupNames?.has(name)) {
          basicFailedEntries.push({
            message: `Row ${row?.number}: Duplicate group name "${name}" found in the sheet.`,
          });
          continue;
        } else {
          sheetGroupNames.add(name?.toLowerCase());
        }
      }

      if (basicFailedEntries?.length > 0) {
        basicFailedEntries.unshift({ message: "Unfortunately, we could not upload your file as there were some errors." });
        res.status(400).json({
          success: false,
          data: {
            failedEntries: basicFailedEntries
          },
          message: "Unfortunately, some rows failed basic validation. Please review these issues and try again."
        });
        return;
      }

      // Retrieve data from DB that do not change per row
      // const allProducts = await groupRepository.getAllProducts();
      const allCategories = await groupRepository.getAllCategories();

      // Arrays for merging error rows during DB checks
      const duplicateGroupRowNumbers: number[] = [];
      const duplicateGroupLeaderRowNumbers: any[] = [];
      const missinCategoryRowNumbers: number[] = [];

      const groups: any[] = [];
      const successEntries: any[] = [];
      const groupLeaderEmails: { email: string, name: string }[] = [];



      // Process each row with DB-related validations
      for (const row of rows) {
        const [name, description, groupLeaderEmail, firstName, lastName, categories, ...goalAmountArray] = row.values.slice(1);

        const email = typeof groupLeaderEmail === 'object' ? groupLeaderEmail?.text : groupLeaderEmail;
        const categoryNames = categories?.split(",")?.map((p: string) => p?.trim());
        const goalAmounts = goalAmountArray?.map((amt: any) => parseFloat(amt));

        // Check for duplicate group (using preloaded list)
        const duplicateGroup = await groupRepository.getGroupByKey("name", name);
        if (duplicateGroup) {
          duplicateGroupRowNumbers.push(row?.number);
          continue;
        }

        // Query group leader directly instead of using a preloaded collection
        let groupLeader = await groupLeaderRepository.getGroupLeaderByKey("email", email);
        const groupLeaderByName = await groupLeaderRepository.getGroupLeaderByKey("firstName", firstName?.trim(), { lastName: lastName?.trim() });

        console.log("Group Leader>>>", groupLeader);
        console.log("Group Leader By Name>>>", groupLeaderByName);

        // Check for duplicate group leader
        if ((!groupLeader && groupLeaderByName) || (groupLeader && !groupLeaderByName) || (groupLeader && groupLeader?._id.toString() !== groupLeaderByName?._id.toString())) {
          duplicateGroupLeaderRowNumbers.push(row?.number);
          continue;
        }

        // Upload image if exists
        let imageUrl: string | null = SCOUT_LOGO;
        // Check for missing products
        const missingProducts = categoryNames.filter((cName: string) => !allCategories.find((category: any) => category.name === cName));
        if (missingProducts.length > 0) {
          missinCategoryRowNumbers.push(row.number);
          continue;
        }



        // Map product information
        const selectedCategories = allCategories?.map((p: any) => {
          return {
            categoryId: p?._id, status: categoryNames?.includes(p?.name) ? "active" : "inactive"
          }
        });

        const categoryGoalAmounts = goalAmounts?.map((amount: number, index: number) => {
          return { categoryId: selectedCategories[index]?.categoryId, amount: amount };
        });

        // Create leader if none exists
        if (!groupLeader && !groupLeaderEmails.includes(email) && !groupLeaderByName) {
          const createdLeader = await groupRepository?.createBulkGroupLeader({
            firstName: firstName?.trim() || "",
            lastName: lastName?.trim() || "",
            email
          });
          groupLeader = createdLeader;
          groupLeaderEmails.push({ email: email, name: name });
        }

        groups.push({
          name,
          groupLeader: groupLeader?._id,
          description,
          categories: selectedCategories,
          goals: categoryGoalAmounts,
          crest: [imageUrl],
        });

        successEntries.push(row?.number);
      }

      // Build error details message
      const errorDetails: any[] = [];
      if (duplicateGroupRowNumbers?.length > 0) {
        errorDetails.push({ message: `row(s) ${duplicateGroupRowNumbers?.join(", ")} had duplicate group names` });
      }
      if (duplicateGroupLeaderRowNumbers?.length > 0) {
        errorDetails.push({ message: `row(s) ${duplicateGroupLeaderRowNumbers?.join(", ")} had duplicate group leaders (Leader with either an email or the name already exists.)` });
      }
      if (missinCategoryRowNumbers?.length > 0) {
        errorDetails.push({ message: `row(s) ${missinCategoryRowNumbers?.join(", ")} refrence either inactive or non-existing category.` });
      }
      if (errorDetails?.length > 0) {
        // Prepend the additional message to the error details array.
        errorDetails.unshift({ message: "Unfortunately, Below listed entries were not uploaded into the system." });
      }

      console.log("errorDetails==>", errorDetails);

      // Create groups in bulk
      const createdGroups = await groupRepository.createBulkGroups(groups);

      if (!createdGroups || createdGroups?.length === 0) {
        res.status(400).json({
          success: false,
          data: {
            successEntries: successEntries?.length > 0 ? [{ message: `Row(s) ${successEntries?.join(", ")} were inserted into the system.` }] : [],
            failedEntries: errorDetails
          },
          message: "Unable to create groups"
        });
        return;
      }

      // Send registration emails to new group leaders
      // await Promise.all(groupLeaderEmails?.map((email) => mailService?.sendRegistrationMail(email)));
      await Promise.all(groupLeaderEmails?.map((data: {
        email: string;
        name: string;
      }) => sendEmailWithTemplate(data?.email, GROUP_ADDITION_CONFIRMATION_TEMPLATE_ID, { url: `${FRONTEND_BASEURL}/complete-registration?verification=true`, shopifyURL: `${SHOPIFY_BASEURL}/pages/group?name=${data?.name}` })));


      // Send response based on errors
      if (errorDetails?.length > 0) {
        res.status(400).json({
          success: false,
          data: {
            successEntries: successEntries?.length > 0 ? [{ message: `Row(s) ${successEntries?.join(", ")} were uploaded into the system.` }] : [],
            failedEntries: errorDetails
          },
          message: "Partial upload: Some rows failed."
        });
        return;
      }


      res.status(201).json({
        success: true,
        data: null,
        message: "Groups have been uploaded successfully.",
        error: null
      });
    } catch (err: any) {
      logger.error(`GroupController : createBulkGroups - internal server error: ${err?.message}`);
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message
      });
    }
  }


  public async getGroupByIdShopify(req: Request, res: Response) {
    const name: string = req?.params?.name;

    if (!name) {
      logger.error("GroupController: getGroupById - no name provided.")
      res.status(400).json({
        success: false,
        data: null,
        message: "group name is required",
        error: null
      });
      return;
    }

    try {

      const group = await groupRepository.getGroupByIdShopify(name);

      if (!group) {
        logger.error(`GroupController: getGroupById Unable to find group for ID: ${name}`);
        res.status(400).json({
          success: false,
          data: null,
          message: "Unable to find group."
        });
        return;
      }

      console.log("GroupController: getGroupById - group fetched successfully.", group);
      logger.info(`GroupController: getGroupById - group fetched successfully.`)

      res.status(200).json({
        success: true,
        data: group,
        message: "group fetched successfully.",
        error: null
      })
      return;
    } catch (err: any) {
      logger.error("GroupController: getGroupById - internal server error.", err?.message);
      res.status(500).json({
        success: false,
        data: null,
        message: "internal server error",
        error: err?.message
      })
      return;
    }
  }


  public async createOrUpdateEvnts(req: Request, res: Response): Promise<void> {

    try {

      const groupId = req?.params?.id;
      const eventData = req?.body?.data;

      console.log("eventData", eventData);
      console.log("groupId", groupId)

      const image = req?.file as Express.Multer.File;
      console.log("crest==>", image);


      if (!groupId) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Group ID not found"
        })
        return;
      }

      let imageUrl: string | null = null;

      if (image) {
        imageUrl = await bunnyService.uploadFile(image.buffer, `/group/crest/${image.originalname}`);
      }

      if (imageUrl) {
        eventData.image = imageUrl;
      }

      const event = await groupRepository.createOrUpdateEvents(groupId, eventData);

      if (!event) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Unable to create or update event"
        })
        return;
      }

      res.status(200).json({
        success: true,
        data: event,
        message: "Event saved successfully"

      })

    } catch (error: any) {
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal Server Error",
        error: error?.message
      })
      return;
    }

  }

  public async getUpcomingEventsByGroupId(req: Request, res: Response): Promise<void> {
    const groupId = req.params.id;

    if (!groupId) {
      logger.error("GroupController: getGroupById - no id provided.");
      res.status(400).json({
        success: false,
        data: null,
        message: "Group id is required",
        error: null,
      });
      return;
    }

    try {
      console.log("groupId--------->", groupId);
      const eventData = await groupRepository.getSingleEventByGroupId(groupId);
      console.log("eventData---->>", eventData);

      if (!eventData) {
        res.status(200).json({
          success: false,
          data: null,
          message: "No upcoming events found for this group",
          error: null,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: eventData,
        message: "Upcoming event retrieved successfully",
        error: null,
      });
    } catch (error: any) {
      console.error("Error in getUpcomingEventsByGroupId:", error);
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal Server Error",
        error: error?.message,
      });
    }
  }
}
