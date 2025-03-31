import { GroupModel } from "../models/group.model";
import mongoose, { ObjectId, Types } from "mongoose";
import { ICreateGroup, IGroup, IUpdateGroup } from "../types/group.type";
import { UserRepository } from "./user.repository";
import logger from "../configs/winston.config";
import { GroupLeaderModel } from "../models/groupLeader.model";
import { options } from "joi";
import { GroupLeaderRepository } from "./groupLeader.repository";
import { IGroupLeader } from "../types/groupLeader.type";
import MailService from "../services/email.service";
import { UserModel } from "../models/user.model";
import { ProductsModel } from "../models/product.model";
import { RolesModel } from "../models/role.model";
import { ProductRepository } from "./product.repository";
import { UpcomingEventsModel } from "../models/upcomingEvents.model";
import { sendEmailWithTemplate } from "../services/sendgrid.service";
import { FRONTEND_BASEURL, GROUP_ADDITION_CONFIRMATION_TEMPLATE_ID, SHOPIFY_BASEURL } from "../configs/env.config";
import { CategoryModel } from "../models/category.model";

const userRepository: UserRepository = new UserRepository();
const productRepository: ProductRepository = new ProductRepository();
//const groupLeaderRepository: GroupLeaderRepository = new GroupLeaderRepository();
const mailService = new MailService();

export class GroupRepository {
  public async createGroup(body: ICreateGroup): Promise<IGroup | null> {
    try {

      // const user = await userRepository.createUser({
      //   firstName: body?.name,
      //   email: body?.email,
      //   password: "Ordex@123",
      //   userRole: new Types.ObjectId(body?.userRole)
      // });

      // console.log("user==>", user);

      // if (!user) {
      //   console.error("createSection : Unable to create user|section");
      //   logger.error("createSection : Unable to create user|section");
      //   return null;
      // }

      console.log("body", body)

      const newGroup = await GroupModel.create(body);

      if (!newGroup) {
        return null;
      }

      console.log("body?.groupLeader", body?.groupLeader)

      let groupLeaderData: IGroupLeader | null = await GroupLeaderModel.findOne({ _id: body?.groupLeader, isDeleted: false });

      let user = await UserModel.findOne({ _id: groupLeaderData?.userId, isVerified: false, isDeleted: false });

      if (user) {
        // await mailService.sendRegistrationMail(groupLeaderData?.email);
        if (groupLeaderData?.email) {
          await sendEmailWithTemplate(groupLeaderData.email, GROUP_ADDITION_CONFIRMATION_TEMPLATE_ID, {
            url: `${FRONTEND_BASEURL}/complete-registration?verification=true`,
            shopifyURL:`${SHOPIFY_BASEURL}/pages/group?name=${body?.name}`
          });
          console.log("mail sent");
        }
      } else {
        console.log("group leader not found or already verified");
      }

      console.log("new group ==>", newGroup);

      return newGroup;
    } catch (err: any) {
      logger.error(`GroupRepository - createGroup: error when creating group: ${err}`);
      throw new Error(err?.message);
    }
  }

  public async getAllGroup(filters: {
    name?: string | null;
    pageNo: number | any;
    pageSize: number | any;
    categoryId?: string | null;
    amount?: number | null;
  }): Promise<{
    group: IGroup[];
    totalCount: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  } | null> {
    try {
      const { name, pageNo, pageSize, categoryId, amount } = filters;

      const query: any = { isDeleted: false };

      if (name) query.name = { $regex: name, $options: 'i' };

      const limit = pageSize;
      const skip = (pageNo - 1) * pageSize;

      console.log("limit", limit);
      console.log("skip", skip);

      const matchStage: any = { ...query };

      if (categoryId) {
        console.log("CategoryId>>>", categoryId);
        matchStage["categories"] = { 
          $elemMatch: { 
            categoryId: new mongoose.Types.ObjectId(categoryId),
            status: "active" 
          }
        };
      }

      if (amount) {
        console.log("amount>>>", amount);
        matchStage["goals.amount"] = amount;
      }


      const group: IGroup[] = await GroupModel.aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: "categories",
            localField: "categories.categoryId", // Changed from products.productId
            foreignField: "_id",
            as: "categoryDetails", // Changed from productsDetails
            pipeline:[
              {
                $match: {
                  active: true,
                  isDeleted: false
                }
              }
            ]
          }
        },
        {
          $lookup: {
            from: "categories",
            localField: "goals.categoryId", // Changed from goals.productId
            foreignField: "_id",
            as: "goalCategoryDetails", // Changed from goalsDetails
            pipeline:[
              {
                $match: {
                  active: true,
                  isDeleted: false
                }
              }
            ]
          }
        },
        {
          $addFields: {
            groupLeaderName: "$groupLeader.name",
            // Map over all category details
            categories: {
              $map: {
                input: {
                  $filter: {
                    input: "$categoryDetails", // Changed from productsDetails
                    as: "categoryDetail", // Changed from productDetail
                    cond: {
                      $in: [
                        "$$categoryDetail._id",
                        {
                          $map: {
                            input: {
                              $filter: {
                                input: "$categories",
                                as: "category",
                                cond: {
                                  $eq: [
                                    "$$category.status",
                                    "active"
                                  ]
                                }
                              }
                            },
                            as: "category",
                            in: "$$category.categoryId" // Changed from productId
                          }
                        }
                      ]
                    }
                  }
                },
                as: "categoryDetail", // Changed from productDetail
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
                          } // Changed from productId
                        }
                      },
                      0
                    ]
                  },
                  category: {
                    // Changed from product
                    _id: "$$categoryDetail._id",
                    name: "$$categoryDetail.name",
                    description:
                      "$$categoryDetail.description",
                    image: "$$categoryDetail.image", // Added to reflect category fields
                    icon: "$$categoryDetail.icon", // Added to reflect category fields
                    sale_icon: "$$categoryDetail.sale_icon", // Added to reflect category fields
                    active: "$$categoryDetail.active"
                  }
                }
              }
            },
            // Map over all goal category details
            goals: {
              $map: {
                input: {
                  $filter: {
                    input: "$goalCategoryDetails", // Changed from goalsDetails
                    as: "goalCategoryDetail", // Changed from goalDetail
                    cond: {
                      $and: [
                        // Date conditions commented out as in original
                      ]
                    }
                  }
                },
                as: "goalCategoryDetail", // Changed from goalDetail
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
                          } // Changed from productId
                        }
                      },
                      0
                    ]
                  },
                  category: {
                    // Changed from goal
                    _id: "$$goalCategoryDetail._id",
                    name: "$$goalCategoryDetail.name",
                    description:
                      "$$goalCategoryDetail.description",
                    image: "$$goalCategoryDetail.image", // Added to reflect category fields
                    icon: "$$goalCategoryDetail.icon", // Added to reflect category fields
                    sale_icon: "$$goalCategoryDetail.sale_icon", // Added to reflect category fields
                    active:
                      "$$goalCategoryDetail.active"
                  }
                }
              }
            }
          }
        },
        {
          $addFields: {
            categories: {
              $map: {
                input: "$categories",
                as: "category",
                in: {
                  status: "$$category.status.status",
                  category: "$$category.category" // Changed from product
                }
              }
            },
            goals: {
              $map: {
                input: "$goals",
                as: "goal",
                in: {
                  amount: "$$goal.amount.amount",
                  category: "$$goal.category" // Changed from product
                }
              }
            }
          }
        },
        // Filter products by status "active" and only keep goals whose category exists in the filtered products
        {
          $addFields: {
            categories: {
              $filter: {
                input: "$categories",
                as: "c",
                cond: { $eq: ["$$c.status", "active"] }
              }
            },
            goals: {
              $filter: {
                input: "$goals",
                as: "g",
                cond: {
                  $in: [
                    "$$g.category._id", // Changed from product
                    {
                      $map: {
                        input: "$categories",
                        as: "c",
                        in: "$$c.category._id" // Changed from product
                      }
                    }
                  ]
                }
              }
            }
          }
        },
        // {
        //   $lookup: {
        //     from: "groupproductsales",
        //     localField: "_id",
        //     foreignField: "groupId",
        //     as: "raisedAmountByGroup"
        //   }
        // },
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
                  isDeleted: false,
                  active: true // Filter for active products only
                }
              },
              {
                $lookup:{
                  from: "offlineproducts",
                  localField: "productId",
                  foreignField: "_id",
                  as: "productDetails",
                  pipeline:[
                    {
                      $match: {
                        isDeleted: false
                      },
                    },
                      {
                        $project:{
                          isDeleted:1,
                          name:1,
                        }
                      }
                  ]
                }
              },
              {
                $unwind: "$productDetails"
              },
              {
                $project: {
                  name: "$productDetails.name",
                  amount: "$amount",
                  _id: 0
                }
              }
            ],
            as: "raisedAmountByGroup"
          }
        },
        {
          $lookup: {
            from: "groupcollectionsales",
            let: { groupId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$groupId", "$$groupId"] },
                  isDeleted: false
                }
              },
              {
                $project: {
                  categoryId: 1,
                  totalAmount: 1,
                  _id: 0
                }
              }
            ],
            as: "categorySales"
          }
        },
        // Extract active category IDs to filter relevant sales
        {
          $addFields: {
            activeCategoryIds: {
              $map: {
                input: {
                  $filter: {
                    input: "$categories", 
                    as: "cat",
                    cond: { $eq: ["$$cat.status", "active"] }
                  }
                },
                as: "cat",
                in: { $toString: "$$cat.category._id" }
              }
            }
          }
        },

        // Calculate online sales total for active categories
        {
          $addFields: {
            onlineSalesAmount: {
              $reduce: {
                input: {
                  $filter: {
                    input: "$categorySales",
                    as: "sale",
                    cond: { $in: [{ $toString: "$$sale.categoryId" }, "$activeCategoryIds"] }
                  }
                },
                initialValue: 0,
                in: { $add: ["$$value", "$$this.totalAmount"] }
              }
            }
          }
        },
        // Replace existing totalAmountRaised calculation with combined total
        {
          $addFields: {
            totalAmountRaised: {
              $add: [
                { $sum: "$raisedAmountByGroup.amount" },  // Offline sales
                "$onlineSalesAmount"                      // Online sales
              ]
            }
          }
        },
        // {
        //   $addFields: {
        //     totalAmountRaised: {
        //       $sum: "$raisedAmountByGroup.amount"
        //     }
        //   }
        // },
        {
          $project: {
            categoryDetails: 0, // Changed from productsDetails
            goalCategoryDetails: 0, // Changed from goalsDetails
            raisedAmountByGroup:0,
            // categorySales: 0,
            // activeCategoryIds: 0,
            onlineSalesAmount: 0
          }
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "groupleaders",
            localField: "groupLeader",
            foreignField: "_id",
            as: "groupLeader"
          }
        },
        {
          $unwind: {
            path: "$groupLeader",
            preserveNullAndEmptyArrays: true
          }
        }
      ]);

      if (!group || group.length === 0) {
        return null;
      }

      const totalCount = await GroupModel.countDocuments(matchStage);
      const hasPreviousPage = pageNo > 1;
      const hasNextPage = pageNo * pageSize < totalCount;

      return {
        group,
        totalCount,
        hasPreviousPage,
        hasNextPage,
      };
    } catch (err: any) {
      logger.error(`GroupRepository - getAllGroup: error when getting all group: ${err}`);
      throw new err(`Error occurred while getting all groups: ${err?.message}`);
    }
  }

  public async getGroupByKey(
    key: string,
    value?: string | Types.ObjectId,
    options: any = {}
  ): Promise<IGroup[] | null> {

    try {

      const group: IGroup[] = await GroupModel.aggregate([
        {
          $match: {
            [key]: value,
            isDeleted: false,
            ...options
          }
        },
        {
          $lookup: {
            from: "groupleaders",
            localField: "groupLeader",
            foreignField: "_id",
            as: "groupLeader",
          },
        },
        {
          $unwind: {
            path: "$groupLeader",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "categories.categoryId",
            foreignField: "_id",
            as: "categoryDetails",
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "goals.categoryId",
            foreignField: "_id",
            as: "goalCategoryDetails",
          },
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
                              "$$categoryDetail._id",
                            ],
                          },
                        },
                      },
                      0,
                    ],
                  },
                  category: {
                    _id: "$$categoryDetail._id",
                    name: "$$categoryDetail.name",
                    description: "$$categoryDetail.description",
                    image: "$$categoryDetail.image",
                    icon: "$$categoryDetail.icon",
                    sale_icon: "$$categoryDetail.sale_icon",
                    active: "$$categoryDetail.active",
                    createdAt: "$$categoryDetail.createdAt",
                  },
                },
              },
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
                              "$$goalCategoryDetail._id",
                            ],
                          },
                        },
                      },
                      0,
                    ],
                  },
                  category: {
                    _id: "$$goalCategoryDetail._id",
                    name: "$$goalCategoryDetail.name",
                    description: "$$goalCategoryDetail.description",
                    image: "$$goalCategoryDetail.image",
                    icon: "$$goalCategoryDetail.icon",
                    sale_icon: "$$goalCategoryDetail.sale_icon",
                    active: "$$goalCategoryDetail.active",
                  },
                },
              },
            },
          },
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
                      status: "$$category.status.status",
                      category: "$$category.category",
                    },
                  },
                },
                sortBy: { "category.createdAt": -1 }, // Sort by createdAt in descending order
              },
            },
            goals: {
              $sortArray: {
                input: {
                  $map: {
                    input: "$goals",
                    as: "goal",
                    in: {
                      amount: "$$goal.amount.amount",
                      category: "$$goal.category",
                    },
                  },
                },
                sortBy: { "category.createdAt": -1 }, // Sort by createdAt in descending order
              },
            },
          },
        },
        {
          $project: {
            categoryDetails: 0,
            goalCategoryDetails: 0,
          },
        },
        { $sort: { createdAt: -1 } },
      ]);


      //console.log("group==>", group);

      if (!group || group.length === 0) {
        return null;
      }

      return group;
    } catch (err: any) {
      logger.error(`GroupRepository - getGroupByKey: error when getting group by key: ${err}`);
      throw new Error(err?.message);
    }
  }
  public async getGroupById(id: string): Promise<IGroup | null> {

    try {

      const group: any[] = await GroupModel.aggregate([
        {
          $match: {
            _id: new Types.ObjectId(id),
            isDeleted: false
          }
        },
        {
          $lookup: {
            from: "groupleaders",
            localField: "groupLeader",
            foreignField: "_id",
            as: "groupLeader"
          }
        },
        {
          $unwind: {
            path: "$groupLeader",
            preserveNullAndEmptyArrays: true
          }
        },
        // Get ALL active categories (assigned and unassigned)
        {
          $lookup: {
            from: "categories",
            pipeline: [
              {
                $match: {
                  active: true,
                  isDeleted: false
                }
              }
            ],
            as: "allCategories"
          }
        },
        // Get assigned categories
        {
          $lookup: {
            from: "categories",
            let: {
              categoryIds: "$categories.categoryId"
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ["$_id", "$$categoryIds"]
                  },
                  active: true,
                  isDeleted: false
                }
              }
            ],
            as: "categoryDetails"
          }
        },
        // Get categories with goals
        {
          $lookup: {
            from: "categories",
            let: {
              goalCategoryIds: "$goals.categoryId"
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ["$_id", "$$goalCategoryIds"]
                  },
                  active: true,
                  isDeleted: false
                }
              }
            ],
            as: "goalCategoryDetails"
          }
        },
        {
          $addFields: {
            groupLeaderName: "$groupLeader.name",
            // Process assigned categories
            assignedCategories: {
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
                    image: "$$categoryDetail.image",
                    icon: "$$categoryDetail.icon",
                    sale_icon: "$$categoryDetail.sale_icon",
                    active: "$$categoryDetail.active",
                    createdAt:
                      "$$categoryDetail.createdAt"
                  }
                }
              }
            },
            // Process assigned goals
            assignedGoals: {
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
                    image: "$$goalCategoryDetail.image",
                    icon: "$$goalCategoryDetail.icon",
                    sale_icon: "$$goalCategoryDetail.sale_icon",
                    active:
                      "$$goalCategoryDetail.active",
                    createdAt:
                      "$$goalCategoryDetail.createdAt"
                  }
                }
              }
            },
            // Create unassigned categories (with status: inactive)
            unassignedCategories: {
              $map: {
                input: {
                  $filter: {
                    input: "$allCategories",
                    as: "category",
                    cond: {
                      $not: {
                        $in: [
                          "$$category._id",
                          {
                            $map: {
                              input: "$categories",
                              as: "cat",
                              in: "$$cat.categoryId"
                            }
                          }
                        ]
                      }
                    }
                  }
                },
                as: "unassignedCategory",
                in: {
                  status: { status: "inactive" },
                  category: {
                    _id: "$$unassignedCategory._id",
                    name: "$$unassignedCategory.name",
                    description:
                      "$$unassignedCategory.description",
                    image: "$$unassignedCategory.image",
                    icon: "$$unassignedCategory.icon",
                    sale_icon: "$$unassignedCategory.sale_icon",
                    active:
                      "$$unassignedCategory.active",
                    createdAt:
                      "$$unassignedCategory.createdAt"
                  }
                }
              }
            },
            // Create unassigned goals (with amount: null)
            unassignedGoals: {
              $map: {
                input: {
                  $filter: {
                    input: "$allCategories",
                    as: "category",
                    cond: {
                      $not: {
                        $in: [
                          "$$category._id",
                          {
                            $map: {
                              input: "$goals",
                              as: "goal",
                              in: "$$goal.categoryId"
                            }
                          }
                        ]
                      }
                    }
                  }
                },
                as: "unassignedCategory",
                in: {
                 amount: {
                    categoryId: "$$unassignedCategory._id",
                    amount: null  // Use null instead of 0
                  },
                  category: {
                    _id: "$$unassignedCategory._id",
                    name: "$$unassignedCategory.name",
                    description:
                      "$$unassignedCategory.description",
                    image: "$$unassignedCategory.image",
                    icon: "$$unassignedCategory.icon",
                    sale_icon: "$$unassignedCategory.sale_icon",
                    active:
                      "$$unassignedCategory.active",
                    createdAt:
                      "$$unassignedCategory.createdAt"
                  }
                }
              }
            }
          }
        },
        {
          $addFields: {
            // Merge assigned and unassigned categories
            mergedCategories: {
              $concatArrays: [
                "$assignedCategories",
                "$unassignedCategories"
              ]
            },
            // Merge assigned and unassigned goals
            mergedGoals: {
              $concatArrays: [
                "$assignedGoals",
                "$unassignedGoals"
              ]
            }
          }
        },
        {
          $addFields: {
            // Format categories for final output
            categories: {
              $sortArray: {
                input: {
                  $map: {
                    input: "$mergedCategories",
                    as: "category",
                    in: {
                      status:
                        "$$category.status.status",
                      category: "$$category.category"
                    }
                  }
                },
                sortBy: { "category.createdAt": -1 }
              }
            },
            // Format goals for final output
            goals: {
              $sortArray: {
                input: {
                  $map: {
                    input: "$mergedGoals",
                    as: "goal",
                    in: {
                      amount: "$$goal.amount.amount",
                      category: "$$goal.category"
                    }
                  }
                },
                sortBy: { "category.createdAt": -1 }
              }
            }
          }
        },
        {
          $project: {
            categoryDetails: 0,
            goalCategoryDetails: 0,
            allCategories: 0,
            assignedCategories: 0,
            unassignedCategories: 0,
            assignedGoals: 0,
            unassignedGoals: 0,
            mergedCategories: 0,
            mergedGoals: 0
          }
        }
      ]);

      console.log("group==>", group);

      if (!group || group.length === 0) {
        return null;
      }

      // Format availability dates for each product in the products array
      // if (Array.isArray(group[0].products)) {
      //   group[0].products = group[0].products.map((prod: any) => {
      //     if (prod.product) {
      //       prod.product.availablityStartDate = productRepository.convertMMDDToISO(prod.product.availablityStartDate);
      //       prod.product.availablityEndDate = productRepository.convertMMDDToISO(prod.product.availablityEndDate);
      //     }
      //     return prod;
      //   });
      // }

      return group[0];
    } catch (err: any) {
      logger.error(`GroupRepository - getGroupById: error when getting group by id ${err}`);
      throw new Error(err?.message);
    }
  }

  public async deleteGroup(id: string): Promise<IGroup | null> {
    try {
      console.log(id);
      console.log("deleting group...");
      const deletedGroup = await GroupModel.findByIdAndUpdate(id, { isDeleted: true }); // soft delete
      if (!deletedGroup) {
        return null;
      }
      console.log("group deleted ==>", deletedGroup);

      return deletedGroup;
    } catch (err: any) {
      logger.error(`GroupRepository - deleteGroup: error when deleting group: ${err}`);
      throw new Error(err?.message);
    }
  }

  public async updateGroup(id: string, body: Partial<IUpdateGroup>): Promise<IGroup | null> {
    try {
      console.log("ID", id)

      body.categories = body.categories?.map((cat) => ({
        categoryId: new Types.ObjectId(cat.categoryId),
        status: cat.status,
      }));

      body.goals = body.goals?.map((goal) => ({
        categoryId: new Types.ObjectId(goal.categoryId),
        amount: goal.amount,
      }));

      console.log("updating group...", body);

      const updatedData = await GroupModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
        },
        {
          $set: body,
        },
        {
          new: true,
        }
      );

      console.log("updatedData", updatedData)

      if (!updatedData) {
        return null;
      }

      let groupLeaderData: IGroupLeader | null = await GroupLeaderModel.findOne({ _id: body?.groupLeader, isDeleted: false });

      let user = await UserModel.findOne({ _id: groupLeaderData?.userId, isVerified: false, isDeleted: false });

      if (user) {
        // await mailService.sendRegistrationMail(groupLeaderData?.email);
        if (groupLeaderData?.email) {
          await sendEmailWithTemplate(groupLeaderData.email, GROUP_ADDITION_CONFIRMATION_TEMPLATE_ID, {
            shopifyURL:`${SHOPIFY_BASEURL}/pages/group?name=${updatedData?.name}`,
            url: `${FRONTEND_BASEURL}/complete-registration?verification=true`
          });
          console.log("mail sent");
        }
        console.log("mail sent");
      } else {
        console.log("group leader not found or already verified");
      }

      console.log("updatedData", updatedData)
      return updatedData;
    } catch (err: any) {
      logger.error(`GroupRepository - updateGroup: error when updating group: ${err}`);
      throw new Error(err?.message);
    }
  }

  public async createBulkGroups(groups: IGroup[]): Promise<IGroup[] | null> {
    try {
      const newGroups = await GroupModel.insertMany(groups, { ordered: true });
      console.log("Inserted groups:", newGroups);
      return newGroups;
    } catch (err: any) {
      logger.error(`GroupRepository - createBulkGroups: error when creating bulk groups: ${err}`);
      throw new Error(err?.message);
    }
  }

  public async getGroupLeaderByEmail(email: string): Promise<any | null> {
    try {
      const groupLeader = await GroupLeaderModel.findOne({ email, isDeleted: false });
      console.log("groupLeader ==>", groupLeader);

      if (!groupLeader) {
        return null;
      }

      // Verify the associated user's email
      const user = await UserModel.findOne({
        _id: groupLeader?.userId,
        isDeleted: false
      });

      if (!user) {
        console.log("User either not found, already verified, or deleted");
        return null; // Return null if user is already verified or doesn't exist
      }

      return groupLeader;
    } catch (err: any) {
      logger.error(`GroupRepository - getGroupLeaderByEmail: error when getting group leader by email: ${err}`);
      throw new Error(err?.message);
    }
  }


  public async getAllProducts(): Promise<any> {
    try {
      const products = await ProductsModel.find({ isDeleted: false });
      if (products) {
        //console.log("Products>>>", products);
        return products;
      } else {
        console.log("No Products Found!");
        return null;
      }

    } catch (err: any) {
      console.log("Error while fetching products");
      throw new Error(err?.message);
    }
  }

  public async getAllCategories(): Promise<any> {
    try {
      const categories = await CategoryModel.find({ isDeleted: false, active: true });
      if (categories) {
        //console.log("Categories>>>", categories);
        return categories;
      } else {
        console.log("No Categories Found!");
        return null;
      }

    } catch (err: any) {
      console.log("Error while fetching categories");
      throw new Error(err?.message);
    }
  }

  public async createBulkGroupLeader(body: any): Promise<IGroupLeader | null> {
    try {

      const { firstName, lastName, email } = body;

      const randomPassword = Math.random().toString(36).slice(-8);

      let role: any = await RolesModel.findOne({ name: "groupLeader" });

      const newUser: any = await userRepository.createUser({
        firstName,
        lastName,
        email,
        password: randomPassword,
        isVerified: false,
        userRole: role?._id
      });

      let grpLeader;
      if (newUser) {
        grpLeader = await GroupLeaderModel.create({
          userId: newUser?._id,
          email,
          firstName,
          lastName
        });
      }

      if (grpLeader) {
        return grpLeader;
      } else {
        return null;
      }


    } catch (err: any) {
      throw new Error(`Error While Creating Bulk Group Leader ${err?.message} `);
    }
  }

  public async removeCategory(categoryId: string  | Types.ObjectId) {
    try {
      const groups = await GroupModel.find({ $or: [{ "categories.categoryId": categoryId }, { "goals.categoryId": categoryId }] });

      console.log("groups == > ", groups);

      // perform pull on them
      groups.forEach(async (group: any) => {
        await GroupModel.updateOne({ _id: group._id }, { $pull: { categories: { categoryId }, goals: { categoryId } } });
      });

    } catch (err: any) {
      logger.error(`GroupRepository - removeProduct: error when removing product from group: ${err?.message}`);
      throw new Error(err?.message);
    }
  }

  public async getGroupByIdShopify(name: string): Promise<IGroup | null> {

    try {

  
      const group: IGroup[] = await GroupModel.aggregate([
        {
          $match: {
            // name: name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim(),
            $expr: {
              $eq: [
                  { $toLower: { $replaceAll: { input: "$name", find: " ", replacement: "" } } }, // Remove spaces from DB field and convert to lowercase
                  name.replace(/\s+/g, '').trim().toLowerCase() // Remove spaces from input and convert to lowercase
              ]
          },
            isDeleted: false
          }
        },
        {
          $lookup: {
            from: "groupleaders",
            localField: "groupLeader",
            foreignField: "_id",
            as: "groupLeader",
            pipeline:[
              {
                $match: {
                  isDeleted: false
                }
              },
              {
                $project:{
                  firstName: 1,
                  lastName: 1,
                  email: 1,
                }
              }
            ]
          },
        },
        {
          $unwind: {
            path: "$groupLeader",
            preserveNullAndEmptyArrays: true
          }
        },
        // Lookup categories for group assignment
        {
          $lookup: {
            from: "categories",
            localField: "categories.categoryId",
            foreignField: "_id",
            as: "categoryDetails",
            pipeline:[
              {
                $match: {
                  active: true,
                  isDeleted: false
                }
              }
            ]
          }
        },
        // Lookup goals categories
        {
          $lookup: {
            from: "categories",
            localField: "goals.categoryId",
            foreignField: "_id",
            as: "goalCategoryDetails",
            pipeline:[
              {
                $match: {
                  active: true,
                  isDeleted: false
                }
              }
            ]
          }
        },
        {
          $lookup: {
            from: "donations",
            localField: "_id",
            foreignField: "groupId",
            as: "donations"
          }
        },
        {
          $addFields: {
            totalDonationAmount: { $sum: "$donations.donationAmount" }
          }
        },
        {
          $lookup: {
            from: "upcomingevents",
            localField: "_id",
            foreignField: "groupId",
            as: "upcomingevents"
          }
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
        {
          $addFields: {
            upcomingevents: {
              $map: {
                input: {
                  $filter: {
                    input: "$upcomingevents",
                    as: "event",
                    cond: {
                      $or: [
                        { $ne: [{ $ifNull: ["$$event.title", ""] }, ""] },
                        { $ne: [{ $ifNull: ["$$event.description", ""] }, ""] },
                        { $ne: [{ $ifNull: ["$$event.image", ""] }, ""] }
                      ]
                    }
                  }
                },
                as: "event",
                in: {
                  _id: "$$event._id",
                  title: "$$event.title",
                  description: "$$event.description",
                  date: {
                    $cond: {
                      if: { $and: [
                        { $ne: ["$$event.date", null] },
                        { $ne: ["$$event.date", ""] }
                      ]},
                      then: {
                        $dateToString: {
                          format: "%b-%d-%Y",
                          date: {
                            $dateFromString: { dateString: "$$event.date", format: "%m-%d-%Y" }
                          }
                        }
                      },
                      else: null
                    }
                  },
                  image: "$$event.image",
                  createdAt: "$$event.createdAt",
                  updatedAt: "$$event.updatedAt"
                }
              }
            }
          }
        },
        // Process categories and get active category IDs
        {
          $addFields: {
            processedCategories: {
              $map: {
                input: "$categoryDetails",
                as: "catDetail",
                in: {
                  status: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$categories",
                          as: "cat",
                          cond: { $eq: ["$$cat.categoryId", "$$catDetail._id"] }
                        }
                      },
                      0,
                    ],
                  },
                  category: {
                    _id: "$$catDetail._id",
                    name: "$$catDetail.name",
                    description: "$$catDetail.description",
                    image: "$$catDetail.image",
                    icon: "$$catDetail.icon",
                    sale_icon: "$$catDetail.sale_icon",
                    active: "$$catDetail.active",
                    createdAt: "$$catDetail.createdAt",
                    slug: "$$catDetail.handle"
                  }
                }
              }
            },
            // Extract active category IDs for later use
            activeCategoryIds: {
              $map: {
                input: {
                  $filter: {
                    input: "$categories",
                    as: "cat",
                    cond: { $eq: ["$$cat.status", "active"] }
                  }
                },
                as: "activeCat",
                in: "$$activeCat.categoryId"
              }
            }
          }
        },
        // Process goals and add them to the document
        {
          $addFields: {
            processedGoals: {
              $map: {
                input: "$goalCategoryDetails",
                as: "goalCat",
                in: {
                  categoryId: "$$goalCat._id",
                  amount: {
                    $let: {
                      vars: {
                        goalMatch: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: "$goals",
                                as: "g",
                                cond: { $eq: ["$$g.categoryId", "$$goalCat._id"] }
                              }
                            },
                            0
                          ]
                        }
                      },
                      in: "$$goalMatch.amount"
                    }
                  },
                  category: {
                    _id: "$$goalCat._id",
                    name: "$$goalCat.name",
                    description: "$$goalCat.description",
                    image: "$$goalCat.image",
                    icon: "$$goalCat.icon",
                    sale_icon: "$$goalCat.sale_icon",
                    active: "$$goalCat.active",
                    slug: "$$goalCat.handle",
                    createdAt: "$$goalCat.createdAt"
                  }
                }
              }
            }
          }
        },
        // Second lookup for product sales (can be combined with the first one)
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
                  isDeleted: false,
                  active: true // Filter for active products only
                }
              },
              {
                $lookup:{
                  from: "offlineproducts",
                  localField: "productId",
                  foreignField: "_id",
                  as: "productDetails",
                  pipeline:[
                    {
                      $match: {
                        isDeleted: false
                      }
                    }
                  ]
                }
              },
              {
                $unwind: "$productDetails"
              },
              {
                $project: {
                  _id: "$productId",
                  name: "$productDetails.name",
                  amount: "$amount",
                  image: { 
                    $cond: [
                      { $isArray: "$productDetails.image" },
                      { $ifNull: [{ $arrayElemAt: ["$productDetails.image", 0] }, ""] },
                      "$productDetails.image"
                    ]
                  }
                }
              }
            ],
            as: "offlineProductSales"
          }
        },
        {
          $lookup: {
            from: "groupcollectionsales",
            let: { groupId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$groupId", "$$groupId"] },
                  isDeleted: false
                }
              },
              {
                $lookup: {
                  from: "categories",
                  localField: "categoryId",
                  foreignField: "_id",
                  as: "categoryInfo"
                }
              },
              {
                $unwind: {
                  path: "$categoryInfo",
                  preserveNullAndEmptyArrays: true
                }
              },
              {
                $project: {
                  id: { $toString: "$categoryId" },  // Convert to string for easier comparison
                  name: "$categoryInfo.name",
                  image: "$categoryInfo.image",
                  icon: "$categoryInfo.icon",
                  sale_icon: "$categoryInfo.sale_icon",
                  slug: "$categoryInfo.handle",
                  totalAmount: 1,
                  totalQuantity: 1,
                  _id:0
                }
              }
            ],
            as: "allCategorySales"
          }
        },
        {
          $addFields: {
            // Filter for only active categories
            categories: {
              $filter: {
                input: {
                  $sortArray: {
                    input: {
                      $map: {
                        input: "$processedCategories",
                        as: "cat",
                        in: {
                          status: "$$cat.status.status",
                          category: "$$cat.category"
                        }
                      }
                    },
                    sortBy: { "category.createdAt": -1 }
                  }
                },
                as: "item",
                cond: { $eq: ["$$item.status", "active"] }
              }
            },
            // Filter goals to include only those with active categoryIds
            goals: {
              $sortArray: {
                input: {
                  $filter: {
                    input: {
                      $map: {
                        input: "$processedGoals",
                        as: "goal",
                        in: {
                          amount: "$$goal.amount",
                          category: "$$goal.category"
                        }
                      }
                    },
                    as: "goal",
                    // Check if this goal's category ID is in the active categories list
                    cond: {
                      $in: ["$$goal.category._id", "$activeCategoryIds"]
                    }
                  }
                },
                sortBy: { "category.createdAt": -1 }
              }
            }
          }
        },
        // Calculate totals
        {
          $addFields: {
            // Extract IDs of active categories
            activeCategoryIds: {
              $map: {
                input: "$categories",
                as: "cat",
                in: { $toString: "$$cat.category._id" }  // Convert to string for comparison
              }
            }
          }
        },
        
        // Filter sales to only include active categories
        {
          $addFields: {
            onlineCategorySales: {
              $filter: {
                input: "$allCategorySales",
                as: "sale",
                cond: { $in: ["$$sale.id", "$activeCategoryIds"] }
              }
            }
          }
        },
        {
          $addFields: {
            totalGoalAmount: { $sum: "$goals.amount" },
            // Retain offline sales from the groupproductsales lookup as is
            onlineSalesTotal: { $sum: "$onlineCategorySales.totalAmount" },
            offlineSalesTotal: { $sum: "$offlineProductSales.amount" },
            overallSales: { 
              $add: [
                { $sum: "$offlineProductSales.amount" },
                { $sum: "$onlineCategorySales.totalAmount" },
                "$totalDonationAmount"
              ]
            },
            offlineSales: "$offlineProductSales",
            onlineSales: "$onlineCategorySales"
          }
        },
        // Final projection
        {
          $project: {
            categoryDetails: 0,
            processedGoals: 0,
            processedCategories: 0,
            goals:0,
            activeCategoryIds: 0,
            goalCategoryDetails: 0,
            donations: 0,
            offlineProductSales: 0,
            allCategorySales: 0,
            onlineCategorySales: 0,
            onlineSalesTotal:0
          }
        },
        {
          $sort: { createdAt: -1 }
        }
      ]
      );

      console.log("group==>", group);

      if (!group || group?.length === 0) {
        return null;
      }

      return group[0];
    } catch (err: any) {
      logger.error(`GroupRepository - getGroupById: error when getting group by id ${err}`);
      throw new Error(err?.message);
    }
  }

  public async updateGroupCategory(id: string | Types.ObjectId, active: boolean): Promise<void> {
    
    try{
      const groupsRelatedToCategory = await GroupModel.find({ "categories.categoryId": id, isDeleted: false });

      console.log("groupsRelatedToCategory ==>", groupsRelatedToCategory);

      // change status to inactive
      if (!active) {
        groupsRelatedToCategory.forEach(async (group: any) => {
          await GroupModel.updateOne({ "categories.categoryId": id }, { $set: { "categories.$.status": "inactive" } });
        });
      } else {
        // change status to active, only update if goal amount is greater than 1
        groupsRelatedToCategory.forEach(async (group: any) => {
          // await GroupModel.updateOne({ "categories.categoryId": id }, { $set: { "categories.$.status": "active" } });
          await GroupModel.updateOne({ "categories.categoryId": id, "goals.amount": { $gt: 0 } }, { $set: { "categories.$.status": "active" } });
        });
      }

    } catch (err: any) {
      logger.error(`GroupRepository - updateGroupCategory: error when updating group category: ${err?.message}`);
      throw new Error(err?.message);
    }
  }
  public async createOrUpdateEvents(groupId: string, eventData: any): Promise<any | null> {
    try {
      console.log(groupId);
      const group = await GroupModel.findOne({ _id: groupId, isDeleted: false });
      console.log("group", group)
      if (!group) {
        return null;
      }

      let event = await UpcomingEventsModel.findOne({ groupId: groupId });

      console.log("event", event)

      if (event) {
        event = await UpcomingEventsModel.findOneAndUpdate(
          { groupId: groupId },
          { $set: eventData },
          { new: true }
        );
      } else {

        event = new UpcomingEventsModel({ groupId, ...eventData });
        await event.save();
        console.log("event", event)

      }

      return event;

    } catch (error) {

    }

  }

  public async getSingleEventByGroupId(groupId: string): Promise<any | null> {
    try {
      console.log(groupId);
      const group = await GroupModel.findOne({ _id: groupId, isDeleted: false });
      console.log("group", group);

      if (!group) {
        return null;
      }

      const eventData = await UpcomingEventsModel.findOne({ groupId: groupId });
      console.log("eventData---->>", eventData);

      return eventData; // Ensure the function returns event data if found
    } catch (error) {
      console.error("Error in getSingleEventByGroupId:", error);
      return null; // Return null in case of an error
    }
  }

  public async getAllActiveGroups(): Promise<any[]> {
    try {
      return await GroupModel.find({
        isDeleted: false
      });
    } catch (error: any) {
      logger.error(`Error getting active groups: ${error.message}`);
      return [];
    }
  }
  
  public async assignBadgeToGroup(groupId: mongoose.Types.ObjectId, badgeId: mongoose.Types.ObjectId): Promise<boolean> {
    try {
      // First check if the badge already exists in the group
      const groupWithBadge = await GroupModel.findOne({
        _id: groupId,
        "badges.badgeId": badgeId,
        isDeleted: false
      });
  
      if (groupWithBadge) {
        // Badge exists, update its status to unlocked
        const result = await GroupModel.updateOne(
          { _id: groupId, "badges.badgeId": badgeId },
          { $set: { "badges.$.status": "unlocked" } }
        );
        logger.info(`Badge ${badgeId} status updated to unlocked for group ${groupId}`);
        return result.modifiedCount > 0;
      } else {
        // Badge does not exist, add it with unlocked status
        const result = await GroupModel.findByIdAndUpdate(
          groupId,
          { 
            $push: { 
              badges: { 
                badgeId: badgeId, 
                status: "unlocked" 
              } 
            } 
          },
          { new: true }
        );
        logger.info(`Badge ${badgeId} added to group ${groupId} with unlocked status`);
        return !!result;
      }
    } catch (error: any) {
      logger.error(`Error assigning badge ${badgeId} to group ${groupId}: ${error.message}`);
      return false;
    }
  }
  

  public async removeBadgeFromGroups(badgeId: string): Promise<boolean> {
    try {
      // Find groups that have the badge in the new structure
      const result = await GroupModel.updateMany(
        { "badges.badgeId": new Types.ObjectId(badgeId) },
        { $pull: { badges: { badgeId: new Types.ObjectId(badgeId) } } }
      );
      
      logger.info(`Badge ${badgeId} removed from ${result.modifiedCount} groups`);
      return result.modifiedCount > 0;
    } catch (error: any) {
      logger.error(`Error removing badge ${badgeId} from groups: ${error.message} -- ${error}`);
      return false;
    }
  }

  public async getGroupsExcludingCategory(categoryId: string | any): Promise<any | null> {
    try {
      const groups =  await GroupModel.find({
        "categories.categoryId": { $ne: new Types.ObjectId(categoryId) },
        isDeleted: false
      });

      console.log("groups==>", groups);

      return groups;
    } catch (error: any) {
      logger.error(`Error getting groups excluding category ${categoryId}: ${error.message}`);
      return null;
    }
  }

  public async addCategoryToGroup(groupId: string, categoryId: string): Promise<any> {
    try{  
      const result = await GroupModel.updateOne(
        { _id: groupId },
        { 
          $push: { 
              categories: { categoryId: categoryId, status: "inactive" } 
          } 
      });
      console.log("result==>", result);
      return result;

    } catch (error: any) {
      logger.error(`Error adding category ${categoryId} to group ${groupId}: ${error.message}`);
      return false;
    }
  }

  public async assignBadgeToAllGroups(badgeId: mongoose.Types.ObjectId): Promise<boolean> {
    try {
      // Directly update all groups that don't have this badge
      const result = await GroupModel.updateMany(
        { 
          isDeleted: false,
          "badges.badgeId": { $ne: badgeId }
        },
        { 
          $push: { 
            badges: { 
              badgeId: badgeId, 
              status: "locked" 
            } 
          } 
        }
      );
      
      logger.info(`Badge ${badgeId} assigned to ${result.modifiedCount} groups`);
      
      // If no groups were modified, it means they all already had the badge
      if (result.modifiedCount === 0) {
        logger.info(`Badge ${badgeId} is already assigned to all groups`);
      }
      
      return result.modifiedCount > 0 || result.matchedCount > 0;
    } catch (error: any) {
      logger.error(`Error assigning badge ${badgeId} to all groups: ${error.message}`);
      return false;
    }
  }

}
