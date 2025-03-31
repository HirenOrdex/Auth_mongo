import { Types } from "mongoose";
import logger from "../configs/winston.config";
import { GroupLeaderModel } from "../models/groupLeader.model";
import { IGroupLeader, IGroupLeaderUpdate } from "../types/groupLeader.type";
import { UserRepository } from "./user.repository";
import { GroupRepository } from "./group.repository";
import { GroupModel } from "../models/group.model";

const userRepository: UserRepository = new UserRepository();
const groupRepository: GroupRepository = new GroupRepository();

export class GroupLeaderRepository {
  public async createGroupLeader(body: any): Promise<IGroupLeader | null> {
    try {
      // create user for the group
      const user = await userRepository.createUserForGroupLeader(body);

      console.log("user==>", user);

      if (!user) {
        return null;
      }

      const newGroupLeader = new GroupLeaderModel({
        firstName: body?.firstName,
        lastName: body?.lastName,
        userId: user?._id,
        email: body?.email,
      });

      await newGroupLeader.save();

      if (!newGroupLeader) {
        return null;
      }

      logger.info(
        `GroupLeaderRepository - createGroupLeader: Group leader created successfully`
      );
      return newGroupLeader;
    } catch (err: any) {
      logger.error(
        `GroupLeaderRepository - createGroupLeader: error when creating groupLeader: ${err}`
      );
      throw new Error(err?.message);
    }
  }

  public async getGroupLeaderByKey(
    key: string,
    value: string | Types.ObjectId | any,
    options?: any
  ): Promise<IGroupLeader | null> {
    try {
      const groupLeader = await GroupLeaderModel.findOne({
        [key]: value,
        isDeleted: false,
        ...options,
      });

      console.log("groupLeaderId==>", groupLeader?._id);

      // find groups by groupLeader
      const groups = await groupRepository.getGroupByKey(
        "groupLeader",
        groupLeader?._id
      );

      //console.log("groups==>", groups);

      if (!groupLeader) {
        return null;
      }

      groupLeader.toObject();

      // groupLeader.groups = groups ?? [];

      console.log("group Leader==>", groupLeader);

      return groupLeader;
    } catch (err: any) {
      logger.error(
        `GroupLeaderRepository - getGroupLeaderByKey: error when getting groupLeader by key: ${err}`
      );
      throw new Error(err?.message);
    }
  }
  public async getGroupLeaderById(id: string): Promise<IGroupLeader | null> {
    try {
      const groupLeader: IGroupLeader[] | null =
        await GroupLeaderModel.aggregate([
          {
            $match: {
              _id: new Types.ObjectId(id),
              isDeleted: false,
            },
          },
          {
            $lookup: {
              from: "groups",
              localField: "_id",
              foreignField: "groupLeader",
              as: "groups",
              pipeline: [
                {
                  $match: {
                    isDeleted: false,
                  },
                },
                {
                  $project: {
                    goals: 0,
                    products: 0,
                    badges: 0,
                    crest: 0,
                    groupLeader: 0,
                  },
                },
              ],
            },
          },
          {
            $project: {
              userId: 0,
            },
          },
        ]);

      console.log("group Leader==>", groupLeader);

      if (!groupLeader || groupLeader.length === 0) {
        return null;
      }

      return groupLeader[0];
    } catch (err: any) {
      logger.error(
        `GroupLeaderRepository - getGroupLeaderById: error when getting groupLeader by id: ${err}`
      );
      throw new Error(err?.message);
    }
  }

  public async getAllGroupLeader(filters: {
    name?: string | null;
    groupId?: string | null;
    pageNo: number;
    pageSize: number;
  }): Promise<{
    group: IGroupLeader[];
    totalCount: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  } | null> {
    try {
      const { name, groupId, pageNo, pageSize } = filters;

      const query: any = { isDeleted: false };

      if (name) {
        const nameParts = name.trim().split(/\s+/); // Split input by spaces
        console.log("nameParts", nameParts);
        
        query.$and = nameParts.map((part) => ({
          $or: [
            { firstName: { $regex: part, $options: "i" } },
            { lastName: { $regex: part, $options: "i" } },
          ],
        }));
      }

      //if(groupId) query._id = groupId;

      console.log("groupId>>>>>", groupId);

      const limit =  pageSize;
      const skip =  (pageNo - 1) * pageSize;
      // const limit = pageSize ? Number(pageSize) : null; // No limit if pageSize is missing
      // const skip = pageNo && pageSize ? (Number(pageNo) - 1) * Number(pageSize) : 0;

      console.log("limit==>", limit);
      console.log("skip==>", skip);

      // const group: IGroupLeader[] | null = await GroupLeaderModel.aggregate([
      //   {
      //     $match: { ...query },
      //   },
      //   {
      //     $sort: { createdAt: -1 },
      //   },
      //   {
      //     $lookup: {
      //       from: "groups",
      //       localField: "_id",
      //       foreignField: "groupLeader",
      //       as: "groups",
      //       pipeline: [
      //         {
      //           $match: {
      //             isDeleted: false,
      //             ...(groupId ? { _id: new Types.ObjectId(groupId) } : {}),
      //           },
      //         },
      //         {
      //           $project: {
      //             _id: 1,
      //             name: 1,
      //           },
      //         },
      //       ],
      //     },
      //   },
      //   {
      //     $match: { ...(groupId ? { groups: { $ne: [] } } : {}) },
      //   },
      //   {
      //     $project: {
      //       userId: 0,
      //     },
      //   },
      //   {
      //     $skip: skip,
      //   },
      //   {
      //     $limit: limit,
      //   },
      // ]);
      const pipeline: any[] = [
        { $match: { ...query } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "groups",
            localField: "_id",
            foreignField: "groupLeader",
            as: "groups",
            pipeline: [
              {
                $match: {
                  isDeleted: false,
                  ...(groupId ? { _id: new Types.ObjectId(groupId) } : {}),
                },
              },
              { $project: { _id: 1, name: 1 } },
            ],
          },
        },
        { $match: { ...(groupId ? { groups: { $ne: [] } } : {}) } },
        { $project: { userId: 0 } },
      ];
  
      // Apply pagination only if pageSize is provided
      if (limit) {
        pipeline.push({ $skip: skip }, { $limit: limit });
      }
  
      const group: IGroupLeader[] | null = await GroupLeaderModel.aggregate(pipeline);
      let totalCount;
      if (groupId) {
        if (groupId) {
          // Count matching documents for pagination when groupId is provided
          const countResult = await GroupLeaderModel.aggregate([
            { $match: { ...query } },
            {
              $lookup: {
                from: "groups",
                localField: "_id",
                foreignField: "groupLeader",
                as: "groups",
                pipeline: [
                  {
                    $match: {
                      isDeleted: false,
                      _id: new Types.ObjectId(groupId),
                    },
                  },
                ],
              },
            },
            {
              $match: { groups: { $ne: [] } },
            },
            {
              $count: "totalCount",
            },
          ]);

          totalCount = countResult?.length > 0 ? countResult[0]?.totalCount : 0;
        }
      } else {
        totalCount = await GroupLeaderModel.countDocuments(query);
      }

      //console.log("group==>", group);

      if (!group || group.length === 0) {
        return null;
      }

      const hasPreviousPage = pageNo > 1;
      const hasNextPage = pageNo * pageSize < totalCount;

      return {
        group,
        totalCount,
        hasPreviousPage,
        hasNextPage,
      };
    } catch (err: any) {
      logger.error(
        `GroupLeaderRepository - getAllGroupLeader: error when getting all groupLeader: ${err}`
      );
      throw new err(err?.message);
    }
  }

  public async deleteGroupLeader(id: string): Promise<IGroupLeader | null> {
    try {
      console.log(id);
      console.log("deleting group...");
      const deletedGroup = await GroupLeaderModel.findByIdAndUpdate(id, {
        isDeleted: true,
      }); // soft delete
      if (!deletedGroup) {
        return null;
      }
      console.log("group deleted ==>", deletedGroup);
      const deleteUser = await userRepository.deleteUser(deletedGroup?.email);
      if (!deleteUser) {
        return null;
      }
      return deletedGroup;
    } catch (err: any) {
      logger.error(
        `GroupLeaderRepository - deleteGroupLeader: error when deleting groupLeader: ${err}`
      );
      throw new Error(err?.message);
    }
  }

  public async updateGroupLeader(
    id: string,
    body: IGroupLeaderUpdate
  ): Promise<IGroupLeader | null> {
    try {
      console.log(id);
      console.log("updating group...");

      if (body.email) {
        body.email = body.email.toLowerCase();
      }

      const updatedGroup = await GroupLeaderModel.findByIdAndUpdate(
        id,
        { $set: body },
        { new: true }
      );

      if (!updatedGroup) {
        return null;
      }

      console.log("group updated ==>", updatedGroup);

      return updatedGroup;
    } catch (err: any) {
      logger.error(
        `GroupLeaderRepository - updateGroupLeader: error when updating groupLeader: ${err}`
      );
      throw new Error(err?.message);
    }
  }

  public async getGroupLeaderDetails(
    id: string,
    groupId: string
  ): Promise<IGroupLeader | null> {
    if (!id) {
      return null;
    }

    try {
      const groupLeader: IGroupLeader[] | null =
        await GroupLeaderModel.aggregate([
          {
            $match: {
              userId: new Types.ObjectId(id),
              isDeleted: false
            }
          },
          {
            $lookup: {
              from: "groups",
              localField: "_id",
              foreignField: "groupLeader",
              as: "leaderGroups",
              pipeline: [
                {
                  $match: {
                    isDeleted: false
                  }
                },
                {
                  $project: {
                    _id: 1,
                    name: 1
                  }
                }
              ]
            }
          },
          {
            $lookup: {
              from: "groups",
              localField: "_id",
              foreignField: "groupLeader",
              as: "groups",
              pipeline: [
                {
                  $match: {
                    isDeleted: false,
                    ...(groupId
                      ? {
                        _id: new Types.ObjectId(groupId)
                      }
                      : {})
                  }
                },
                // {
                //   $limit: 1
                // },
                {
                  $limit: 1
                },
                {
                  $lookup: {
                    from: "badges",
                    localField: "badges.badgeId",
                    foreignField: "_id",
                    as: "badgeDetails",
                    pipeline:[
                      {
                        $project:{
                          _id:1,
                          name:1,
                          description:1,
                          lockedImage:1,
                          unlockedImage:1,
                          badgePurchaseName:1,
                          badgePurchaseLink:1
                        }
                      }
                    ]
                  }
                },
                {
                  $addFields: {
                    badges: {
                      $map: {
                        input: "$badges",
                        as: "badge",
                        in: {
                          $mergeObjects: [
                            "$$badge",
                            {
                              $arrayElemAt: [
                                {
                                  $filter: {
                                    input: "$badgeDetails",
                                    as: "badgeDetail",
                                    cond: { $eq: ["$$badge.badgeId", "$$badgeDetail._id"] }
                                  }
                                },
                                0
                              ]
                            }
                          ]
                        }
                      }
                    }
                  }
                },
                {
                  $project: {
                    badgeDetails: 0 // Remove intermediate lookup array
                  }
                },
                //CC
                {
                  $lookup: {
                    from: "groupproductsales",
                    let: { groupId: "$_id" },
                    pipeline: [
                      {
                        $match: {
                          $expr: {
                            $eq: ["$groupId", "$$groupId"]
                          },
                          isDeleted: false
                        }
                      },
                      {
                        $project: {
                          isDeleted: 0,
                          createdAt: 0,
                          updatedAt: 0,
                          __v: 0
                        }
                      }
                    ],
                    as: "offlineProductSales"
                  }
                },
                //CC
                {
                  $lookup: {
                    from: "categories",
                    localField: "categories.categoryId",
                    foreignField: "_id",
                    as: "categoryDetails",
                    pipeline: [
                      {
                        $match: {
                          isDeleted: false,
                          active: true
                        }
                      }
                    ]
                  }
                },
                {
                  $lookup: {
                    from: "categories",
                    localField: "goals.categoryId",
                    foreignField: "_id",
                    as: "goalCategoryDetails",
                    pipeline: [
                      {
                        $match: {
                          isDeleted: false,
                          active: true
                        }
                      }
                    ]
                  }
                },
                {
                  $addFields: {
                    groupLeaderName: "$groupLeader.name",
                    categories: {
                      $map: {
                        input: "$categoryDetails",
                        as: "categoryDetail",
                        in: {
                          status: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$categories",
                                  as: "category",
                                  cond: {
                                    $eq: [
                                      "$$category.categoryId",
                                      "$$categoryDetail._id"
                                    ]
                                  }
                                }
                              },
                              0
                            ]
                          },
                          category: {
                            _id: "$$categoryDetail._id",
                            name: "$$categoryDetail.name",
                            description:
                              "$$categoryDetail.description",
                            image:
                              "$$categoryDetail.image",
                            icon: "$$categoryDetail.icon",
                            active:
                              "$$categoryDetail.active",
                            createdAt:
                              "$$categoryDetail.createdAt"
                          }
                        }
                      }
                    },
                    goals: {
                      $map: {
                        input: "$goalCategoryDetails",
                        as: "goalCategoryDetail",
                        in: {
                          amount: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$goals",
                                  as: "goal",
                                  cond: {
                                    $eq: [
                                      "$$goal.categoryId",
                                      "$$goalCategoryDetail._id"
                                    ]
                                  }
                                }
                              },
                              0
                            ]
                          },
                          category: {
                            _id: "$$goalCategoryDetail._id",
                            name: "$$goalCategoryDetail.name",
                            description:
                              "$$goalCategoryDetail.description",
                            image:
                              "$$goalCategoryDetail.image",
                            icon: "$$goalCategoryDetail.icon",
                            active:
                              "$$goalCategoryDetail.active",
                            createdAt:
                              "$$goalCategoryDetail.createdAt"
                          }
                        }
                      }
                    }
                  }
                },
                {
                  $addFields: {
                    categories: {
                      $sortArray: {
                        input: {
                          $map: {
                            input: "$categories",
                            as: "category",
                            in: {
                              status:
                                "$$category.status.status",
                              category:
                                "$$category.category"
                            }
                          }
                        },
                        sortBy: {
                          "category.createdAt": -1
                        } // Sort by createdAt in descending order
                      }
                    },
                    goals: {
                      $sortArray: {
                        input: {
                          $map: {
                            input: "$goals",
                            as: "goal",
                            in: {
                              amount:
                                "$$goal.amount.amount",
                              category: "$$goal.category"
                            }
                          }
                        },
                        sortBy: {
                          "category.createdAt": -1
                        } // Sort by createdAt in descending order
                      }
                    }
                  }
                },
                {
                  $lookup: {
                    from: "offlineproducts",
                    pipeline: [
                      {
                        $match: {
                          isDeleted: false
                        }
                      },
                      {
                        $project: {
                          _id: 1,
                          name: 1
                        }
                      }
                    ],
                    as: "allOfflineProducts"
                  }
                },
                {
                  $addFields: {
                    offlineProducts: {
                      $map: {
                        input: "$allOfflineProducts",
                        as: "offlineProduct",
                        in: {
                          _id: "$$offlineProduct._id",
                          name: "$$offlineProduct.name",
                          groupId: "$$ROOT._id",
                          // Find matching product sale if it exists
                          amount: {
                            $let: {
                              vars: {
                                matchedSale: {
                                  $arrayElemAt: [
                                    {
                                      $filter: {
                                        input:
                                          "$offlineProductSales",
                                        as: "sale",
                                        cond: {
                                          $eq: [
                                            "$$sale.productId",
                                            "$$offlineProduct._id"
                                          ]
                                        }
                                      }
                                    },
                                    0
                                  ]
                                }
                              },
                              in: {
                                $ifNull: [
                                  "$$matchedSale.amount",
                                  null
                                ]
                              }
                            }
                          },
                          active: {
                            $let: {
                              vars: {
                                matchedSale: {
                                  $arrayElemAt: [
                                    {
                                      $filter: {
                                        input:
                                          "$offlineProductSales",
                                        as: "sale",
                                        cond: {
                                          $eq: [
                                            "$$sale.productId",
                                            "$$offlineProduct._id"
                                          ]
                                        }
                                      }
                                    },
                                    0
                                  ]
                                }
                              },
                              in: {
                                $ifNull: [
                                  "$$matchedSale.active",
                                  false
                                ]
                              }
                            }
                          },
                          // Check if this product has an active sale for this group
                          isConfiguredForGroup: {
                            $cond: {
                              if: {
                                $gt: [
                                  {
                                    $size: {
                                      $filter: {
                                        input:
                                          "$offlineProductSales",
                                        as: "sale",
                                        cond: {
                                          $eq: [
                                            "$$sale.productId",
                                            "$$offlineProduct._id"
                                          ]
                                        }
                                      }
                                    }
                                  },
                                  0
                                ]
                              },
                              then: true,
                              else: false
                            }
                          }
                        }
                      }
                    }
                  }
                },
                {
                  $project: {
                    categoryDetails: 0,
                    goalCategoryDetails: 0,
                    offlineProductSales: 0,
                    allOfflineProducts: 0
                  }
                }
              ]
            }
          },
          {
            $project: {
              userId: 0
            }
          }
        ]);

      console.log("group Leader==>", groupLeader);

      if (!groupLeader || groupLeader?.length === 0) {
        return null;
      }

      console.log("LOGGGGGGG", groupLeader[0]);

      return groupLeader[0];
    } catch (err: any) {
      logger.error(
        `GroupLeaderRepository - getGroupLeaderDetails: error when getting groupLeader by id: ${err}`
      );
      throw new Error(err?.message);
    }
  }

  public async getGroupLeaderByUserID(userId: string): Promise<any> {
    try {
      const id = userId;
      const grpLeader = await GroupLeaderModel.findOne({
        userId: id,
        isDeleted: false,
      });
      if (grpLeader) {
        return grpLeader;
      } else {
        return null;
      }
    } catch (err: any) {
      throw new Error(err);
    }
  }
}
