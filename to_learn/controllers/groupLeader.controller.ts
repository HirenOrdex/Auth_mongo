import { Request, Response } from "express";
import logger from "../configs/winston.config";
import { RolesModel } from "../models/role.model";
import { GroupLeaderRepository } from "../repository/groupLeader.repository";
import { UserRepository } from "../repository/user.repository";
import { GroupRepository } from "../repository/group.repository";
import { Types } from "mongoose";
import { IGroupLeader, IGroupLeaderCreate } from "../types/groupLeader.type";
import { IGroup } from "../types/group.type";
import { IUser } from "../models/user.model";
import MailService from "../services/email.service";
import { sendEmailWithTemplate } from "../services/sendgrid.service";
import { FRONTEND_BASEURL, GROUP_ADDITION_CONFIRMATION_TEMPLATE_ID } from "../configs/env.config";

const groupLeaderRepository = new GroupLeaderRepository();
const groupRepository = new GroupRepository();
const userRepository: UserRepository = new UserRepository();
const mailService = new MailService();

export class GroupLeaderController {


  public async createGroupLeader(req: Request, res: Response): Promise<void> {
    try {
      console.log("req.body==>", req?.body);

      const {
        firstName,
        lastName,
        email,
        password,
      }: IGroupLeaderCreate = req?.body;

      let role = await RolesModel.findOne({ name: "groupLeader" });
      if (!role) {
        logger.error("CreateGroupLeader : Role not found");
        console.error("Role not found");
        res.status(400).json({
          success: false,
          data: null,
          message: "Role not found",
          error: null,
        });
        return;
      }

      let groupLeader: IGroupLeader | null = await groupLeaderRepository.getGroupLeaderByKey("email", email);

      if (groupLeader) {

        const user: IUser | null = await userRepository?.getUserByKey("email", email);
        console.log("user==>", user);

        if (user) {

          logger.error("CreateGroupLeader : Group Leader already exists");
          console.error("Group Leader already exists");
          res.status(400).json({
            success: false,
            data: null,
            message: "Group Leader already exists",
            error: null,
          });
          return;
        } else {
          const userData = {
            firstName,
            lastName,
            email: email.toLowerCase(),
            password,
            userRole: role._id,
          };

          const createdUser = await userRepository?.createUser(userData);

          if (!createdUser) {
            logger.info(`CreateGroupLeader : Unable to create user for group`);
            console.error("CreateGroupLeader : Unable to create user for group");
            res.status(400).json({
              success: false,
              data: null,
              message: "Unable to create user for group",
              error: null,
            });
            return;

          }

          logger.info(`CreateGroupLeader : User created successfully for group`);
          console.log("CreateGroupLeader : User created successfully for group");
          res.status(201).json({
            success: true,
            data: createdUser,
            message: "User created successfully for groupleader",
            error: null,
          });
          return;
        }

      } else {
        const groupLeaderData = {
          firstName,
          lastName,
          email: email.toLowerCase(),
          password,
          userRole: role._id
        };

        const createdGroupLeader: IGroupLeader | null = await groupLeaderRepository.createGroupLeader(groupLeaderData);

        if (!createdGroupLeader) {
          logger.error("CreateGroupLeader : Unable to create group leader");
          console.error("CreateGroupLeader : Unable to create group leader");
          res.status(400).json({
            success: false,
            data: null,
            message: "Unable to create group leader",
            error: null,
          });
          return;
        }

        logger.info("CreateGroupLeader : Group leader created successfully");
        console.log("CreateGroupLeader : Group leader created successfully");
        res.status(201).json({
          success: true,
          data: createdGroupLeader,
          message: "Group leader created successfully",
          error: null,
        });


      }
    } catch (error: any) {
      logger.error(`CreateGroupLeader : Error while creating group leader: ${error}`);
      res.status(400).json({ success: false, data: null, message: error?.message, error: null });
      return;
    }
  };

  public async getAllGroupLeaders(req: Request, res: Response): Promise<void> {
    // const pageNo = parseInt(req?.query?.pageNo as string);
    // const pageSize = parseInt(req?.query?.pageSize as string);
    const pageNo = parseInt(req?.query?.pageNo as string, 10);
    const pageSize = parseInt(req?.query?.pageSize as string, 10);

    if (pageNo && isNaN(pageNo) ||pageSize && isNaN(pageSize)) {
      res.status(400).json({
        success: false,
        data: null,
        message: "Invalid page number or page size",
        error: null,
      });
      return;
    }

    const name = (req?.query?.name as string) || null;
    const groupId = (req?.query?.groupId as string) || null;


    try {
      const groupsLeaders: {
        group: IGroupLeader[];
        totalCount: number;
        hasPreviousPage: boolean;
        hasNextPage: boolean;
      } | null = await groupLeaderRepository?.getAllGroupLeader({
        name,
        groupId,
        pageNo,
        pageSize,
      });

      console.log("groupsLeaders==>", groupsLeaders);

      if (!groupsLeaders) {
        res.status(200).json({
          success: true,
          data: null,
          message: "No Group Leaders Found!",
          error: null,
        });
        return;
      }

      //const { group, totalCount, hasPreviousPage, hasNextPage } = groups

      res.status(200).json({
        success: true,
        data: groupsLeaders,
        message: "Group Leaders fetched successfully",
        error: null,
      });
      return;
    } catch (err: any) {
      logger.error("GroupLeaderController: getAllGroups - error while getting groups", err);
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message,
      });
      return;
    }
  };

  public async getGroupLeaderById(req: Request, res: Response) {
    const id: string = req?.params?.id;

    if (!id) {
      logger.error("GroupLeaderController: getGroupById - no id provided.")
      res.status(400).json({ success: false, data: null, message: "No id provided.", error: null });
      return;
    }
    try {

      const groupLeader: IGroupLeader | null = await groupLeaderRepository.getGroupLeaderById(id);

      if (!groupLeader) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Unable to find Group Leader.",
          error: null
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: groupLeader,
        message: "Group leader fetched successfully.",
        error: null
      })
    } catch (err: any) {
      logger.error("GroupLeaderController: getGroupById - error while fetching group");
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message
      });
      return;
    }
  };

  public async deleteGroupLeader(req: Request, res: Response) {
    const id = req?.params?.id;

    if (!id) {
      logger.error("GroupLeaderController: deleteGroup - no id provided.")
      res.status(400).json({ success: false, data: null, message: "No id provided.", error: null });
      return;
    }
    try {

      const groupLeader: IGroupLeader | null = await groupLeaderRepository.getGroupLeaderByKey("_id", new Types.ObjectId(id));

      if (!groupLeader) {
        logger.error(`GroupLeaderController: deleteGroup - unable to find group leader for ID ${id}`)
        res.status(400).json({
          success: false,
          data: null,
          message: "Unable to find group leader."
        });
        return;
      }

      const deletedGroupLeader: IGroupLeader | null = await groupLeaderRepository.deleteGroupLeader(id);

      if (!deletedGroupLeader) {
        logger.error(`GroupLeaderController: deleteGroup - unable to delete group leader for ID ${id}`)
        res.status(400).json({
          success: false,
          data: null,
          message: "Unable to delete group leader."
        });
        return;
      }

      // remove group leader from groups
      const groups: IGroup[] | null = await groupRepository.getGroupByKey("groupLeader", new Types.ObjectId(id));

      //console.log("groups==>", groups);

      if (groups) {
        const groupIds = groups?.map((group: any) => groupRepository.updateGroup(group?._id, { groupLeader: null }));
        const updatedGroups = await Promise.all(groupIds);

        console.log("updatedGroups : deleted the groupLeader ==>", updatedGroups);

      }

      res.status(200).json({
        success: true,
        data: deletedGroupLeader,
        message: "Group Leader Deleted Successfully.",
        error: null
      })
    } catch (err: any) {
      logger.error("GroupLeaderController: deleteGroup - error while deleting group");
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message
      });
      return;
    }
  };

  public async updateGroupLeader(req: Request, res: Response) {
    const id: string = req?.params?.id;

    if (!id) {
      logger.error("GroupLeaderController: updateGroupLeader - no id provided.")
      res.status(400).json({ success: false, data: null, message: "No id provided.", error: null });
      return;
    }
    try {

      const groupLeader: IGroupLeader | null = await groupLeaderRepository.getGroupLeaderById(id);

      const changedUseremail = await userRepository.getUserByKey("email", req?.body?.email);

      if (!groupLeader) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Unable to find groupleader."
        });
        return;
      }

      const updatedGroupLeader: IGroupLeader | null = await groupLeaderRepository.updateGroupLeader(id, req?.body);

      if (!updatedGroupLeader) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Unable to update groupLeader."
        });
        return;
      }

      // update user
      const user: IUser | null = await userRepository.getUserByKey("email", groupLeader.email);

      if (user) {
        const updatedUser: any = await userRepository.updateUser(groupLeader?.email, req?.body);
        console.log("controller updated user =>", updatedUser);
        if (!updatedUser) {
          res.status(400).json({
            success: false,
            data: null,
            message: "Unable to update user associated with groupLeader."
          });
          return;
        }

        if ((changedUseremail === null || changedUseremail?.isVerified === false) && groupLeader?.email !== req?.body?.email) {
          const unverifyUser = await userRepository.unverifyGroupLeader(updatedUser?._id);
          console.log("unverifyUser", unverifyUser)
          if (unverifyUser) {
            console.log("Sending Mail")
            // await mailService.sendRegistrationMail(unverifyUser?.email);
            await sendEmailWithTemplate(unverifyUser?.email,GROUP_ADDITION_CONFIRMATION_TEMPLATE_ID,{url:`${FRONTEND_BASEURL}/complete-registration?verification=true`}) 
          }
        }
      }


      res.status(200).json({
        success: true,
        data: updatedGroupLeader,
        message: "Group Leader Updated Successfully.",
        error: null
      })
    } catch (err: any) {
      logger.error("GroupLeaderController: updateGroupLeader - error while updating group");
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message
      });
      return;
    }
  }

  public async getGroupLeaderDetails(req: Request, res: Response) {
    const id: string = req?.params?.id;
    const groupId: string = req?.query?.groupId as string;

    if (!id) {
      logger.error("GroupLeaderController: getGroupLeaderDetails - no id provided.")
      res.status(400).json({ success: false, data: null, message: "No id provided.", error: null });
      return;
    }
    try {

      const groupLeader: IGroupLeader | null = await groupLeaderRepository.getGroupLeaderByUserID(id);

      console.log("groupLeader>>>>>>>", groupLeader);
      console.log("id", id)

      if (!groupLeader) {
        logger.info(`GroupLeaderController: getGroupLeaderDetails - unable to find group leader for ID ${id}`)
        res.status(400).json({
          success: false,
          data: null,
          message: "Unable to find group leader.",
          error: null
        });
        return;
      }

      const groupLeaderDetails = await groupLeaderRepository.getGroupLeaderDetails(id, groupId);

      res.status(200).json({
        success: true,
        data: groupLeaderDetails,
        message: "Group leader details fetched successfully.",
        error: null
      })
      return;
    } catch (err: any) {
      logger.error("GroupLeaderController: getGroupLeaderDetails - error while fetching group leader details");
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message
      });
      return;
    }
  }


}