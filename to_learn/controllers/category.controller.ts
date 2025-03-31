import { Request, Response } from "express";
import { CategoryRepository } from "../repository/category.repository";
import { ICategory, ICreateCategoryInput, IShopifyCategoryCreateResponse, IUpdateCategoryInput } from "../types/category.type";
import logger from "../configs/winston.config";
import { ShopifyService } from "../services/shopify.service";
import { Types } from "mongoose";
import { ProductRepository } from "../repository/product.repository";
import { GroupRepository } from "../repository/group.repository";
import { BunnyService } from "../services/bunny.service";
import { ProductsModel } from "../models/product.model";
import { IProduct } from "../types/product.type";
import { GroupCollectionSalesModel } from "../models/groupCollectionSales.model";

const categoryRepository: CategoryRepository = new CategoryRepository();
const shopifyService: ShopifyService = new ShopifyService();
const productRepository: ProductRepository = new ProductRepository();
const bunnyService: BunnyService = new BunnyService();
const groupRepository: GroupRepository = new GroupRepository();

export class CategoryController {

    public async createCategory(req: Request, res: Response): Promise<void> {
        try {
            const category: ICreateCategoryInput = { ...req?.body?.data };

            console.log("category ==>", category);

            const files = req.files as { [fieldname: string]: Express.Multer.File[] };

            const image: Express.Multer.File = files?.image?.[0];
            const icon: Express.Multer.File = files?.icon?.[0];
            const sale_icon: Express.Multer.File = files?.sale_icon?.[0];

            if (!image) {
                logger.error("CategoryController: createCategory: image is required");
                res.status(400).send({ success: false, data: null, message: "Image is required", error: "Image is required" });
                return;
            }

            let imageUrl: string | null = null;
            let iconUrl: string | null = null;
            let saleIconUrl: string | null = null;

            // Check if category already exists
            const existingCategory: ICategory | null = await categoryRepository.getCategoryByKey("name", category.name);

            if (existingCategory) {
                logger.error("CategoryController: createCategory: category already exists");
                res.status(400).send({ success: false, data: null, message: "Collection already exists", error: "Collection already exists" });
                return;
            }

            try {
                imageUrl = await bunnyService.uploadFile(image?.buffer, `/category/${image?.originalname}`);

                iconUrl = await bunnyService.uploadFile(icon?.buffer, `/category/${icon?.originalname}`);

                saleIconUrl = await bunnyService.uploadFile(sale_icon?.buffer, `/category/${sale_icon?.originalname}`);

                if (!imageUrl || !iconUrl || !saleIconUrl) {
                    logger.error("CategoryController: createCategory: error while uploading image");
                    res.status(400).send({ success: false, data: null, message: "Image not uploaded", error: "Image not uploaded" });
                    return;
                }


            } catch (err: any) {
                logger.error(`CategoryController: createCategory: error while uploading image ${err?.message}`);
                res.status(500).send({ success: false, data: null, message: err?.message, error: err?.message });
                return;
            }

            // Create category on Shopify
            const shopifyCategory: { id: string, handle: string } | null | undefined = await shopifyService.createCollection(category?.name, imageUrl, category?.description);

            if (!shopifyCategory) {
                logger.error("CategoryController: createCategory: error while creating category on Shopify");
                res.status(400).send({ success: false, data: null, message: "Collection not created on Shopify", error: "Collection not created on Shopify" });
                return;
            }

            category.shopifyId = shopifyCategory?.id;
            category.handle = shopifyCategory?.handle;

            const newCategory: ICategory | null = await categoryRepository.createCategory({ ...category, image: imageUrl, icon: iconUrl, sale_icon: saleIconUrl });

            if (!newCategory) {
                logger.error("CategoryCotroller : createCategory: error while creating category");
                res.status(400).send({ success: false, data: null, message: "Collection not created", error: "Collection not created" });
                return;
            }

            console.log("category created ==>", newCategory);

            if (newCategory?.active === true) {
                // publish to shopify   
                const shopifyResponse: boolean | null | undefined = await shopifyService.pubishToSalesChannel(shopifyCategory?.id);

                //CC
                if (!shopifyResponse) {
                    logger.error("CategoryController: createCategory: error while publishing to sales channel");
                    res.status(400).send({ success: false, data: null, message: "Collection not published to sales channel", error: "Collection not published to sales channel" });
                    return;
                }
            }

            // Add new category to all groups
            const groupsWithoutCategory:any  = await groupRepository.getGroupsExcludingCategory(newCategory?._id);

            if(groupsWithoutCategory && groupsWithoutCategory?.length > 0) {
                for (const group of groupsWithoutCategory) {
                    const groupCategory = await groupRepository.addCategoryToGroup(group?._id, newCategory?._id?.toString());
                    if (!groupCategory) {   
                        logger.error("CategoryController: createCategory: error while adding category to group");
                        //res.status(400).send({ success: false, data: null, message: "Collection not added to group", error: "Collection not added to group" });
                        //return;
                    } 

                    logger.info(`CategoryController: createCategory: category: ${newCategory?.name} added to group : ${group?.name}`);
                } 

            }

            res.status(201).send({ success: true, data: newCategory, message: "Collection created successfully", error: null });
        } catch (err: any) {
            logger.error(`CategoryController: createCategory: error while creating category ${err?.message}`);
            res.status(500).send({ success: false, data: null, message: err?.message, error: err?.message });
            return;
        }
    }

    public async updateCategory(req: Request, res: Response): Promise<void> {
        try {
            const id: string = req?.params?.id;
            const category: IUpdateCategoryInput = req?.body?.data;

            const files = req.files as { [fieldname: string]: Express.Multer.File[] };

            const image: Express.Multer.File = files?.image?.[0];
            const icon: Express.Multer.File = files?.icon?.[0];
            const sale_icon: Express.Multer.File = files?.sale_icon?.[0];

            let imageUrl: string | null | undefined = null;
            let iconUrl: string | null | undefined = null;
            let saleIconUrl: string | null | undefined = null;

            if (!id) {
                logger.error("CtegoryController: updateCategory: id is required");
                res.status(400).json({ success: false, data: null, message: "Id is required", error: "Id is required" });
                return;
            }

            // Check if category exists
            const existingCategory: ICategory | null = await categoryRepository.getCategoryByKey("_id", new Types.ObjectId(id));

            if (!existingCategory) {
                logger.error("CategoryController: updateCategory: category not found");
                res.status(400).json({ success: false, data: null, message: "Collection not found", error: "Collection not found" });
                return;
            }

            const duplicateCategory: ICategory | null = await categoryRepository.getCategoryByKey("name", category.name, { _id: { $ne: id } });

            if (duplicateCategory) {
                logger.error("CategoryController: updateCategory: category already exists for given name");
                res.status(400).json({ success: false, data: null, message: "Collection already exists for given name", error: "Collection already exists for given name" });
                return;
            }


            try {
                if (image) {
                    imageUrl = await bunnyService.uploadFile(image?.buffer, `/category/${image?.originalname}`);
                }

                if (icon) {
                    iconUrl = await bunnyService.uploadFile(icon?.buffer, `/category/${icon?.originalname}`)
                }

                if (sale_icon) {
                    saleIconUrl = await bunnyService.uploadFile(sale_icon?.buffer, `/category/${sale_icon?.originalname}`)
                }

                if ((image && icon && sale_icon) && (!imageUrl || !iconUrl || !saleIconUrl)) {
                    logger.error("CategoryController: createCategory: error while uploading image");
                    res.status(400).send({ success: false, data: null, message: "Image not uploaded", error: "Image not uploaded" });
                    return;
                }


            } catch (err: any) {
                logger.error(`CategoryController: createCategory: error while uploading image ${err?.message}`);
                res.status(500).send({ success: false, data: null, message: err?.message, error: err?.message });
                return;
            }

            imageUrl = imageUrl || category?.imageUrl;
            iconUrl = iconUrl || category?.iconUrl;
            saleIconUrl = saleIconUrl || category?.saleIconUrl;


            // update title on shopify,
            const shopifyResponse = await shopifyService.updateCollection(existingCategory?.shopifyId, category?.name, imageUrl, category?.description); //TY

            if (!shopifyResponse) {
                logger.error("CategoryController: updateCategory: error while updating category on Shopify");
                res.status(400).json({ success: false, data: null, message: "Collection not updated on Shopify", error: "Collection not updated on Shopify" });
                return;
            }

            category.handle = shopifyResponse?.handle;

            const updatedCategory: ICategory | null = await categoryRepository.updateCategory(id, { ...category, image: imageUrl, icon: iconUrl, sale_icon: saleIconUrl });

            if (!updatedCategory) {
                logger.error("CategoryController: updateCategory: error while updating category");
                res.status(400).json({ success: false, data: null, message: "Collection not updated", error: "Collection not updated" });
                return;
            }

            if (updatedCategory?.active === false) {
                const shopifyResponse: boolean | null | undefined = await shopifyService.unpublishFromSalesChannel(updatedCategory?.shopifyId);
                if (!shopifyResponse) {
                    logger.error("CategoryController: updateCategory: error while unpublishing to sales channel");
                    res.status(400).send({ success: false, data: null, message: "Collection not unpublished to sales channel", error: "Collection not unpublished to sales channel" });
                    return;
                }

                // remove refrence from the badge tbl
                await categoryRepository.removeCategoryFromBadge(updatedCategory?._id.toString());

                // also archive the products under that category
                const productsToBeArchived = await productRepository.getProductsByCategory(updatedCategory?._id);

                if (productsToBeArchived && productsToBeArchived?.length > 0) {
                    console.log("Archive Product>>>")
                    productsToBeArchived.forEach(async (product) => {
                        console.log("Product to archive>>>", product?.name);
                        await shopifyService.archiveProduct(product?.shopifyId);
                        await productRepository.deleteProduct(product?._id);
                        // also archive the champion products
                        const championProducts = await ProductsModel.find({ parentProduct: product?._id });

                        if (championProducts?.length > 0) {
                            championProducts.forEach(async (championProduct) => {
                                console.log("Champion Product to Archive>>>", championProduct)
                                await shopifyService.archiveProduct(championProduct?.shopifyId);
                                await productRepository.deleteProduct(championProduct?._id?.toString());
                            });
                        }
                    });
                }

                // also inactivate the category in group
                // await groupRepository.updateGroupCategory(updatedCategory?._id, false);

            } else {
                const shopifyResponse: boolean | null | undefined = await shopifyService.pubishToSalesChannel(updatedCategory?.shopifyId);
                if (!shopifyResponse) {
                    logger.error("CategoryController: updateCategory: error while publishing to sales channel");
                    res.status(400).send({ success: false, data: null, message: "Collection not published to sales channel", error: "Collection not published to sales channel" });
                    return;
                }

                // also publish the products under that category
                const productsToBePublished = await productRepository.getDeletedProductsByCategory(updatedCategory?._id);

                if (productsToBePublished) {
                    productsToBePublished.forEach(async (product) => {
                        if (product?.shopifyId) {
                            console.log("Product to b activated>>", product?.name)
                            await shopifyService.activeProduct(product?.shopifyId);
                            await productRepository.activateProduct(product?._id);
                        }

                        // also archive the champion products
                        const championProducts = await ProductsModel.find({ parentProduct: product?._id });

                        if (championProducts?.length > 0) {
                            championProducts.forEach(async (championProduct) => {
                                if (championProduct?.shopifyId) {
                                    await shopifyService.activeProduct(championProduct?.shopifyId);
                                    await productRepository.activateProduct(championProduct?._id?.toString());

                                }
                            });
                        }
                    });
                }

                // also activate the category in group
                // await groupRepository.updateGroupCategory(updatedCategory?._id, true);
            }

            res.status(200).send({ success: true, data: updatedCategory, message: "Collection updated successfully", error: null });
        } catch (err: any) {
            logger.error(`CategoryController: updateCategory: error while updating category ${err?.message}`);
            res.status(500).send({ success: false, data: null, message: err?.message, error: err?.message });
            return;
        }
    }

    public async deleteCategory(req: Request, res: Response): Promise<void> {
        try {
            const id: string = req?.params?.id;

            if (!id) {
                logger.error("CategoryController: deleteCategory: id is required");
                res.status(400).json({ success: false, data: null, message: "Id is required", error: "Id is required" });
                return;
            }

            const deletedCategory: ICategory | null = await categoryRepository.deleteCategory(id);

            if (!deletedCategory) {
                logger.error("CategoryController: deleteCategory: error while deleting category");
                res.status(400).json({ success: false, data: null, message: "Collection not deleted", error: "Collection not deleted" });
                return;
            }

            //delete the collection
            const shopifyResponse: boolean | null | undefined = await shopifyService.deleteCollection(deletedCategory?.shopifyId);

            if (!shopifyResponse) {
                logger.error("CategoryController: deleteCategory: error while deleting category on Shopify");
                res.status(400).json({ success: false, data: null, message: "Collection not deleted on Shopify", error: "Collection not deleted on Shopify" });
                return;
            }

            //archive the products under that category
            const productsToBeArchived = await productRepository.getProductsByCategory(deletedCategory?._id);

            if (productsToBeArchived && productsToBeArchived.length > 0) {
                productsToBeArchived.forEach(async (product) => {
                    await shopifyService.archiveProduct(product?.shopifyId);

                    const productData = (product as any)?.toObject ? (product as any).toObject() : JSON.parse(JSON.stringify(product));
                    await productRepository.updateProduct(product?._id, { ...productData, category: null });

                    // also archive the champion products
                    const championProducts = await ProductsModel.find({ parentProduct: product?._id });

                    if (championProducts?.length > 0) {
                        championProducts.forEach(async (championProduct) => {
                            await shopifyService.archiveProduct(championProduct?.shopifyId);
                        });
                    }
                });
            }


            // await groupRepository.removeCategory(deletedCategory?._id);

            // remove refrence from the badge tbl
            await categoryRepository.removeCategoryFromBadge(deletedCategory?._id.toString())

            //delete the sales for this category
            await GroupCollectionSalesModel.findOneAndUpdate({ categoryId: deletedCategory?._id }, { isDeleted: true });

            res.status(200).send({ success: true, data: deletedCategory, message: "Collection deleted successfully", error: null });
        } catch (err: any) {
            logger.error(`CategoryController: deleteCategory: error while deleting category ${err?.message}`);
            res.status(500).send({ success: false, data: null, message: err?.message, error: err?.message });
            return;
        }
    }

    public async getAllCategories(req: Request, res: Response): Promise<void> {
        const name = req?.query?.name as string || null;
        const parentId = req?.query?.parentId as string || null;
        const active = req?.query?.active as string || null;

        const page = parseInt(req?.query?.page as string, 10);
        const pageSize = parseInt(req?.query?.pageSize as string, 10);

        if (page && (isNaN(page) || page <= 0)) {
            logger.error("ProductController - getAllProducts: Invalid page number");
            res.status(400).send({ success: false, data: null, message: "Invalid page number", error: "Invalid page number" });
            return;
        }

        if (pageSize && isNaN(pageSize) || pageSize <= 0) {
            logger.error("ProductController - getAllProducts: Invalid page size");
            res.status(400).send({ success: false, data: null, message: "Invalid page size", error: "Invalid page size" });
            return;
        }


        try {
            const categories: {
                category: ICategory[];
                totalCount: number;
                hasPreviousPage: boolean;
                hasNextPage: boolean;
            } | null = await categoryRepository.getCategories({ name, parentId, active, page, pageSize });
            console.log("categories ==>", categories);

            if (!categories) {
                logger.error("CategoryController: getAllCategories: error while getting categories");
                res.status(400).send({ success: false, data: null, message: "Collections not found", error: "Collections not found" });
                return;
            }

            res.status(200).send({ success: true, data: categories, message: "Collections found", error: null });
        } catch (err: any) {
            logger.error(`CategoryController: getAllCategories: error while getting categories ${err?.message}`);
            res.status(500).send({ success: false, data: null, message: err?.message, error: err?.message });
            return;
        }
    }

    public async getCategoryById(req: Request, res: Response): Promise<void> {
        try {
            const id: string = req?.params?.id;

            if (!id) {
                logger.error("CategoryController: getCategoryByKey: id are required");
                res.status(400).send({ success: false, data: null, message: "id are required", error: "id are required" });
                return;
            }

            const category: ICategory | null = await categoryRepository.getCategoryByKey("_id", id);
            console.log("category ==>", category);

            if (!category) {
                logger.error("CategoryController: getCategoryByKey: error while getting category");
                res.status(400).send({ success: false, data: null, message: "Collections not found", error: "Collections not found" });
                return;
            }

            res.status(200).send({ success: true, data: category, message: "Collection found", error: null });
        } catch (err: any) {
            logger.error(`CategoryController: getCategoryByKey: error while getting category ${err?.message}`);
            res.status(500).send({ success: false, data: null, message: err?.message, error: err?.message });
            return;
        }
    }
}
