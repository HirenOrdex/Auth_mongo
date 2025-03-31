import { Request, Response } from "express";
import {
  IChampionProduct,
  ICreateChampionProduct,
  IOfflineProduct,
  IProduct,
  IProductImage,
  IProductList,
  IShopifyProduct,
} from "../types/product.type";
import { ProductsModel } from "../models/product.model";
import { ShopifyService } from "../services/shopify.service";
import { BunnyService } from "../services/bunny.service";
import { ProductRepository } from "../repository/product.repository";
import logger from "../configs/winston.config";
import { CategoryRepository } from "../repository/category.repository";
import { Types } from "mongoose";
import { GroupRepository } from "../repository/group.repository";
import { OfflineSalesModel } from "../models/offlineSales.model";
import { OfflineProductsModel } from "../models/offlineProducts.model";
import { OfflineProductRepository } from "../repository/offlineProducts.repository";

const shopifyService: ShopifyService = new ShopifyService();
const bunnyService: BunnyService = new BunnyService();
const productRepository: ProductRepository = new ProductRepository();
const categoryRepository: CategoryRepository = new CategoryRepository();
const groupRepository: GroupRepository = new GroupRepository();
const offlineProductRepository: OfflineProductRepository =
  new OfflineProductRepository();
export class ProductController {
  // Create a new product
  public async createProduct(req: Request, res: Response): Promise<void> {
    const imageFiles = req?.files as {
      [fieldname: string]: Express.Multer.File[];
    };

    const images = imageFiles["images"];

    console.log("req.files =====> ", images);
    // buffer arrays
    if (!images || images?.length < 1) {
      console.log("CreateProduct: No files uploaded");
      logger.error("CreateProduct: No files uploaded");
      res.status(400).json({
        success: false,
        data: null,
        message: "Please upload an image",
        error: null,
      });
      return;
    }

    // filter start

    try {
      let uniqueImageUrls: IProductImage[] = [];

      const imageUrls: IProductImage[] = [];

      const uploadPromises = images?.map(async (image) => {
        const url = await bunnyService.uploadFile(
          image?.buffer,
          `/product/${image?.originalname}`
        );

        if (url) {
          imageUrls.push({ url: url, fileName: image?.originalname });
        }
      });

      // Wait for all promises to resolve
      await Promise.all(uploadPromises);

      //filter out the duplicate images
      uniqueImageUrls = imageUrls?.filter(
        (image, index, self) =>
          index === self?.findIndex((t) => t?.url === image?.url)
      );

      console.log("imageurls ==> ", uniqueImageUrls);

      //filter end

      const data: IProduct = req?.body?.data;
      console.log("data ==> ", data);

      // if product already exists in db or not
      const productExists: IProduct | null =
        await productRepository.getProductByKey("name", data?.name);

      if (productExists) {
        console.log(
          "ProductController - createProduct: Product already exists for the same name"
        );
        logger.error(
          "ProductController - createProduct: Product already exists for the same name"
        );
        res.status(400).json({
          success: false,
          data: null,
          message: "Product already exists for the same name",
          error: null,
        });
        return;
      }
      let shopifyProduct: IShopifyProduct | null = null;

      if (data?.sellModeType?.toString() === "offline") {
        //save the product in our db
        const newProduct: IOfflineProduct = {
          name: data?.name,
          image: uniqueImageUrls?.map(
            (image: IProductImage) => `${image?.url}`
          ),
          // sellModeType: data?.sellModeType,
        };

        const createdProduct: IOfflineProduct | null =
          await offlineProductRepository.createOfflineProduct(newProduct);

        // const createdProduct: IProduct | null =
        //   await productRepository.createProduct(newProduct);
        // console.log("createdProduct ==> ", createdProduct);

        if (!createdProduct) {
          console.log(
            "ProductController - createProduct: offline Product not created"
          );
          logger.error(
            "ProductController - createProduct: offline Product not created"
          );
          res.status(400).json({
            success: false,
            data: null,
            message: "Product not created",
            error: null,
          });
          return;
        }

        // if (data?.raisedSalesAmount) {
        //   try {
        //     const sale = await OfflineSalesModel.create({
        //       productId: createdProduct._id,
        //       amount: data.raisedSalesAmount,
        //     });

        //     if (sale) {
        //       logger.info(
        //         `ProductController - createProduct: Offline sales record created for product ${createdProduct._id} with amount ${data.raisedSalesAmount}`
        //       );
        //     } else {
        //       logger.warn(
        //         `ProductController - createProduct: Failed to create offline sales record for product ${createdProduct._id}`
        //       );
        //     }
        //   } catch (saleErr: any) {
        //     logger.error(
        //       `ProductController - createProduct: Error creating offline sales record: ${saleErr?.message}`
        //     );
        //     // We're not returning an error response here since the product was already created successfully
        //     // Just log the error and continue
        //   }
        // }

        logger.info(
          "ProductController - createProduct: offline product created:"
        );
        res.status(201).json({
          success: true,
          data: newProduct,
          message: "Offline product created successfully",
        });
      } else {
        // // Convert availability values if provided (expected as month number or month string)
        // if (data?.availablityStartDate && data?.availablityEndDate) {
        //     // Parse the provided month numbers
        //     const startMonth = parseInt(data.availablityStartDate.toString(), 10); // e.g. "3" or 3 for March
        //     const endMonth = parseInt(data.availablityEndDate.toString(), 10);

        //     // Use the current year, or set a default year if needed
        //     const currentYear = new Date().getFullYear();

        //     // Create a full date: first day of the start month
        //     const convertedStartDate = new Date(currentYear, startMonth - 1, 1);

        //     // Create a full date: last day of the end month (0th day of the next month gives the last day)
        //     const convertedEndDate = new Date(currentYear, endMonth, 0);

        //     // Replace the values in the data object
        //     data.availablityStartDate = convertedStartDate;
        //     data.availablityEndDate = convertedEndDate;
        // }

        // Check if only one of the availability dates is provided
        if (
          (data?.availablityStartDate && !data?.availablityEndDate) ||
          (!data?.availablityStartDate && data?.availablityEndDate)
        ) {
          res.status(400).json({
            success: false,
            data: null,
            message: "Both Start Date and End Date must be provided together",
            error: null,
          });
          return;
        }

        // Function to format date as "MM-DD"
        const formatDate = (date: Date): string => {
          const month = String(date.getMonth() + 1).padStart(2, "0"); // Ensure two digits
          const day = String(date.getDate()).padStart(2, "0"); // Ensure two digits
          return `${month}-${day}`;
        };

        const currentYear = new Date().getFullYear();

        const defaultStartDate = new Date(currentYear, 0, 1); // January 1st
        const defaultEndDate = new Date(currentYear, 11, 31); // December 31st

        console.log("Add Product Data <<<<<");
        console.log(data);

        // data.availablityStartDate = data?.availablityStartDate
        //   ? formatDate(new Date(data?.availablityStartDate))
        //   : formatDate(defaultStartDate);
        // data.availablityEndDate = data?.availablityEndDate
        //   ? formatDate(new Date(data?.availablityEndDate))
        //   : formatDate(defaultEndDate);

        if (!data?.availablityStartDate) {
          data.availablityStartDate = "01-01";
        }

        if (!data?.availablityEndDate) {
          data.availablityEndDate = "12-31";
        }

        shopifyProduct = await shopifyService.createProduct(
          data,
          uniqueImageUrls
        );

        if (!shopifyProduct) {
          logger.error(
            "ProductController - createProduct: Shopify product not created"
          );
          console.error(
            "ProductController - createProduct: Shopify product not created"
          );
          res.status(400).json({
            success: false,
            data: null,
            message: "shopify product not created",
            error: null,
          });
          return;
        }

        //save the product in our db
        const newProduct: IProduct = {
          name: data?.name,
          description: data?.description,
          image: uniqueImageUrls?.map(
            (image: IProductImage) => `${image?.url}`
          ),
          price: data?.price,
          sku: data?.sku,
          inventory: data?.inventory,
          sellModeType: data?.sellModeType,
          taxReciept: data?.taxReciept,
          recieptQuantity: data?.recieptQuantity,
          availablityStartDate: data?.availablityStartDate,
          availablityEndDate: data?.availablityEndDate,
          shopifyId: shopifyProduct?.product?.id,
          shopifyStatus: shopifyProduct?.product?.status as
            | "DRAFT"
            | "ACTIVE"
            | "ARCHIVED",
          vendor: shopifyProduct?.product?.vendor,
          variants: shopifyProduct?.variant,
          category:
            data?.sellModeType === "online" ? data?.category : undefined,
          // isChampionProduct: data?.isChampionProduct,
          // championQuantity: data?.isChampionProduct ? data?.championQuantity : undefined,
          minQuantity: data?.minQuantity,
        };

        const createdProduct: IProduct | null =
          await productRepository.createProduct(newProduct);
        console.log("createdProduct ==> ", createdProduct);

        if (!createdProduct) {
          console.log("ProductController - createProduct: Product not created");
          logger.error(
            "ProductController - createProduct: Product not created"
          );
          res.status(400).json({
            success: false,
            data: null,
            message: "Product not created",
            error: null,
          });
          return;
        }

        // add product to collection,
        // find category by id
        const category = await categoryRepository.getCategoryByKey(
          "_id",
          data?.category
        );
        console.log("category ==> ", category);

        if (category) {
          const collection = await shopifyService.assignToCollection(
            category?.shopifyId,
            newProduct?.shopifyId
          );
          console.log("collection ==> ", collection);
        } else {
          console.log("ProductController - createProduct: Category not found");
          logger.error("ProductController - createProduct: Category not found");
        }

        // also publish the product
        const publishedProduct: boolean | null | undefined =
          await shopifyService.pubishToSalesChannel(newProduct?.shopifyId);
        console.log("publishedProduct ==> ", publishedProduct);

        if (!publishedProduct) {
          console.log(
            "ProductController - createProduct: Product not published"
          );
          logger.error(
            "ProductController - createProduct: Product not published"
          );
        }

        if (data?.championProducts && data?.championProducts?.length > 0) {
          const championProducts: any[] = data?.championProducts;
          await Promise.all(
            championProducts?.map(async (championProduct: any, index) => {
              const { championName, championQuantity, championSku } = championProduct;

              const championFiles = req.files as {
                [fieldname: string]: Express.Multer.File[];
              };

              let championImages: { url: string | null; fileName: string } = {
                url: null,
                fileName: "",
              };

              if (championFiles["championImages"]) {
                const championImage = championFiles["championImages"][index];
                const champImageUrl = await bunnyService.uploadFile(
                  championImage?.buffer,
                  `/product/${championImage?.originalname}`
                );
                championImages = {
                  url: champImageUrl,
                  fileName: championImage?.originalname,
                };
              }

              const championPrice =
                championQuantity * (createdProduct?.price || 0);
              const championDescription = `Champion product for "${createdProduct?.name}".This product is designated as the champion version with a multiplier quantity of ${championQuantity}.`;
              // const championMedia = { url: champImageUrl, fileName: image?.originalname };

              // Create the champion product in Shopify
              const shopifyChampionProduct =
                await shopifyService.createChampionProduct(
                  championName,
                  championPrice,
                  championSku,
                  championQuantity,
                  championDescription,
                  championImages,
                  createdProduct?.inventory || 0,
                  category?.shopifyId
                );

              if (!shopifyChampionProduct) {
                console.error(
                  "ProductController - createProduct: Champion product not created"
                );
                logger.error(
                  "ProductController - createProduct: Champion product not created"
                );
                return;
              }

              const championProductData: ICreateChampionProduct = {
                name: championName,
                description: championDescription,
                parentProduct: createdProduct?._id,
                shopifyId: shopifyChampionProduct?.product?.id,
                shopifyStatus: shopifyChampionProduct?.product?.status as
                  | "DRAFT"
                  | "ACTIVE"
                  | "ARCHIVED",
                championQuantity: championQuantity,
                sku: championSku,
                isChampionProduct: true,
                variants: shopifyChampionProduct?.variant,
                image: championImages?.url ? [championImages.url] : [],
                position: index + 1,
              };

              const createdChampionProduct =
                await productRepository.createProduct(championProductData);

              if (!createdChampionProduct) {
                console.error(
                  "ProductController - createProduct: Champion product not created"
                );
                logger.error(
                  "ProductController - createProduct: Champion product not created"
                );
                return;
              }

              // also publish it.
              const publishedChampionProduct =
                await shopifyService.pubishToSalesChannel(
                  createdChampionProduct?.shopifyId
                );
              console.log(
                "publishedChampionProduct ==> ",
                publishedChampionProduct
              );

              logger.info(
                "ProductController - createProduct: Champion product created for product:",
                createdProduct?.name
              );
            })
          );
        }

        logger.info("ProductController - createProduct: product created:");
        res.status(201).json({
          success: true,
          data: newProduct,
          message: "Product created successfully",
        });
        return;
      }
    } catch (err: any) {
      console.log(
        "ProductController - createProduct: Internal server error :-",
        err?.message
      );
      logger.error(
        "ProductController - createProduct: Internal server error :-",
        err?.message
      );
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message,
      });
      return;
    }
  }

  public async updateProduct(req: Request, res: Response): Promise<void> {
    const imageFiles = req?.files as Express.Multer.File[];

    const images = imageFiles?.filter((image) => image?.fieldname === "images");
    console.log("images ==> ", images);

    console.log("req.files =====> ", req.files);

    const data: Partial<IProduct> = req?.body?.data; //parse the data from the form
    console.log("data ==> ", data);

    const productId = req?.params?.id;

    if (!productId) {
      logger.error(
        "ProductController - updateProduct: Product ID not provided"
      );
      res.status(400).json({
        success: false,
        data: null,
        message: "Product ID not provided",
      });
      return;
    }

    try {
      let uniqueImageUrls: IProductImage[] = [];

      if (images?.length >= 1) {
        const imageUrls: IProductImage[] = [];

        const uploadPromises = images?.map(async (image) => {
          const url = await bunnyService.uploadFile(
            image?.buffer,
            `/product/${image?.originalname}`
          );

          if (url) {
            imageUrls.push({ url: url, fileName: image?.originalname });
          }
        });

        // Wait for all promises to resolve
        await Promise.all(uploadPromises);

        //filter out the duplicate images
        uniqueImageUrls = imageUrls?.filter(
          (image, index, self) =>
            index === self?.findIndex((t) => t?.url === image?.url)
        );
      }

      if (data?.imageUrl && data?.imageUrl?.length > 0) {
        data?.imageUrl?.forEach((image: string) => {
          const parts = image?.split("/");
          const filename = parts[parts.length - 1];
          uniqueImageUrls.push({ url: image, fileName: filename });
        });
      }

      console.log("imageurls ==> ", uniqueImageUrls);

      const product: any | null =
        data?.sellModeType === "online"
          ? await productRepository.getProductById(productId)
          : await offlineProductRepository.getOfflineProductById(productId);

      if (!product) {
        logger.error(
          `ProductController - updateProduct: Product not found for product id ${productId}`
        );
        res
          .status(400)
          .json({ success: false, data: null, message: "Product not found" });
        return;
      }

      if (data?.sellModeType && data?.sellModeType?.toString() === "offline") {
        if (product?.shopifyId) {
          //archive the product
          const archivedProduct: boolean = await shopifyService.archiveProduct(
            product?.shopifyId
          );
          console.log("archivedProduct ==> ", archivedProduct);
        }

        const updateProduct: Partial<IProduct> | any = {
          // shopifyStatus: "ARCHIVED",
          ...data,
          // shopifyId: product?.shopifyId ?? null,
          // variants: product?.variants ?? null,
          // category: product?.category ?? null,
        };

        const image: string[] = uniqueImageUrls?.map(
          (image: IProductImage) => `${image?.url}`
        );

        //save the product in our db
        const updatedProduct: Partial<IProduct> | null =
          await offlineProductRepository.updateOfflineProduct(
            product?._id?.toString(),
            { ...updateProduct, image }
          );

        if (!updatedProduct) {
          console.log(
            "ProductController - updateProduct: Product not updated for product id",
            productId
          );
          logger.error(
            `ProductController - updateProduct: Product not updated for product id ${productId}`
          );
          res.status(400).json({
            success: false,
            data: null,
            message: "Product not updated",
            error: null,
          });
          return;
        }

        // if (data?.raisedSalesAmount) {
        //   try {
        //     // find the existing offline sales record
        //     const existingSale = await OfflineSalesModel.findOne({
        //       productId: new Types.ObjectId(productId),
        //     });
        //     if (existingSale) {
        //       const sale = await OfflineSalesModel.updateOne(
        //         { productId: updatedProduct._id },
        //         { amount: data.raisedSalesAmount }
        //       );

        //       if (sale) {
        //         logger.info(
        //           `ProductController - createProduct: Offline sales record created for product ${updateProduct._id} with amount ${data.raisedSalesAmount}`
        //         );
        //       } else {
        //         logger.warn(
        //           `ProductController - createProduct: Failed to create offline sales record for product ${updateProduct._id}`
        //         );
        //       }
        //     } else {
        //       const sale = await OfflineSalesModel.create({
        //         productId: updatedProduct._id,
        //         amount: data.raisedSalesAmount,
        //       });

        //       if (sale) {
        //         logger.info(
        //           `ProductController - createProduct: Offline sales record created for product ${updateProduct._id} with amount ${data.raisedSalesAmount}`
        //         );
        //       } else {
        //         logger.warn(
        //           `ProductController - createProduct: Failed to create offline sales record for product ${updateProduct._id}`
        //         );
        //       }
        //     }
        //   } catch (saleErr: any) {
        //     logger.error(
        //       `ProductController - createProduct: Error creating offline sales record: ${saleErr?.message}`
        //     );
        //   }
        // }

        // get all the champion products for this product
        const championProducts = await ProductsModel.find({
          parentProduct: product?._id,
        });

        if (championProducts) {
          await Promise.all(
            championProducts.map(async (championProduct: any) => {
              if (championProduct?.shopifyId) {
                //archive the product
                const archivedChampionProduct: boolean =
                  await shopifyService.archiveProduct(
                    championProduct?.shopifyId
                  );
                console.log(
                  "archivedChampionProduct ==> ",
                  archivedChampionProduct
                );
              }

              // First convert the Mongoose document to a plain object
              const championProductData = championProduct.toObject
                ? championProduct.toObject()
                : JSON.parse(JSON.stringify(championProduct));

              const updateChampionProduct: Partial<IProduct> = {
                shopifyStatus: "ARCHIVED",
                ...championProductData,
                shopifyId: championProduct?.shopifyId ?? null,
              };

              //save the product in our db
              const updatedChampionProduct: Partial<IProduct> | null =
                await productRepository.updateProduct(
                  championProduct?._id?.toString(),
                  updateChampionProduct
                );

              if (!updatedChampionProduct) {
                console.log(
                  "ProductController - updateProduct: Champion Product not updated for product id",
                  championProduct?._id?.toString()
                );
                logger.error(
                  `ProductController - updateProduct: Champion Product not updated for product id ${championProduct?._id?.toString()}`
                );
              }
            })
          );
        }

        res.status(200).json({
          success: true,
          data: updatedProduct,
          message: "Product updated successfully",
          error: null,
        });
        return;
      } else {
        const { isChampionProduct, championProducts, ...parentProductData } =
          data;

        const updateProduct: Partial<IProduct> = {
          shopifyStatus: "ACTIVE",
          ...parentProductData,
          shopifyId: product?.shopifyId ?? null,
          variants: product?.variants ?? null,
          soldQuantity: product?.soldQuantity ?? 0,
        };

        const shopifyProduct = await shopifyService.updateProduct(
          updateProduct?.shopifyId as string,
          data,
          uniqueImageUrls
        );
        console.log("shopifyProduct ==> ", shopifyProduct);

        if (!shopifyProduct) {
          console.error(
            "ProductController - updateProduct: Shopify product not updated"
          );
          logger.error(
            "ProductController - updateProduct: Shopify product not updated"
          );
          res.status(400).json({
            success: false,
            data: null,
            message: "shopify product not updated",
            error: null,
          });
          return;
        }

        //save the product in our db
        const updatedProduct: Partial<IProduct> | null =
          await productRepository.updateProduct(
            product?._id?.toString(),
            updateProduct,
            uniqueImageUrls
          );

        if (!updatedProduct) {
          console.log(
            "ProductController - updateProduct: Product not updated for product id",
            productId
          );
          logger.error(
            `ProductController - updateProduct: Product not updated for product id ${productId}`
          );
          res.status(400).json({
            success: false,
            data: null,
            message: "Product not updated",
            error: null,
          });
          return;
        }
        let previousCategory:any
        let championCollection: string;
        if (data?.category) {
          if (
            data?.category &&
            product?.category &&
            data?.category !== product?.category
          ) {
            // remove product from previous collection
            previousCategory = await categoryRepository.getCategoryByKey(
              "_id",
              product?.category
            );
            console.log("previousCategory ==> ", previousCategory);

            if (previousCategory) {
              const removeProductFromCollection: boolean | null | undefined =
                await shopifyService.removeFromCollection(
                  previousCategory.shopifyId,
                  updatedProduct.shopifyId
                );
              console.log(
                "removeProductFromCollection ==> ",
                removeProductFromCollection
              );
              if (!removeProductFromCollection) {
                console.log(
                  "ProductController - updateProduct: Product not removed from collection"
                );
                logger.error(
                  "ProductController - updateProduct: Product not removed from collection"
                );
              }
            }
          }
          // add product to collection,
          const category = await categoryRepository.getCategoryByKey(
            "_id",
            data.category
          );
          console.log("category ==> ", category);

          if (category) {
            const collection = await shopifyService.assignToCollection(
              category.shopifyId,
              updatedProduct.shopifyId
            );
            console.log("collection ==> ", collection);
            championCollection = category.shopifyId;
          } else {
            console.log(
              "ProductController - updateProduct: Category not found"
            );
            logger.error(
              "ProductController - updateProduct: Category not found"
            );
          }
        }

        const publishedProduct: boolean | null | undefined =
          await shopifyService.pubishToSalesChannel(updatedProduct.shopifyId);
        console.log("publishedProduct ==> ", publishedProduct);

        if (!publishedProduct) {
          console.log(
            "ProductController - updateProduct: Product not published"
          );
          logger.error(
            "ProductController - updateProduct: Product not published"
          );
        }

        if (data?.championProducts && data.championProducts.length > 0) {
          // Fetch the current product (with its championProducts) from the DB
          const existingProduct = await productRepository.getProductById(
            productId
          );
          const existingChampions = existingProduct?.championProducts || [];

          // Separate incoming champion products based on presence of an existing id field
          const incomingExistingChampions = data.championProducts.filter(
            (cp: any) => cp.id
          ).map((cp: any, idx) => ({ ...cp, assignedPosition: idx + 1 }));

          // Calculate the starting position for new champions
          const nextPosition = incomingExistingChampions.length + 1;

          const incomingNewChampions = data.championProducts.filter(
            (cp: any) => !cp.id
          ).map((cp: any, idx) => ({ ...cp, assignedPosition: nextPosition + idx }));

          // Update existing champion products (match by the provided id)
          let championIndex = 0;

          await Promise.all(
            incomingExistingChampions.map(async (championProduct: any, index) => {
              let { id, championName, championQuantity,championSku, image, assignedPosition } =
                championProduct;
              console.log(`Processing Champion ID: ${id}`);

              const existingChampion = existingChampions.find(
                (champ: any) => champ._id.toString() === id
              );
              if (!existingChampion) return;

              const championPrice =
                championQuantity * (existingProduct?.price || 0);
              const championDescription = `Champion product for "${existingProduct?.name}" with quantity ${championQuantity}.`;

              let championImages: { url: string | null; fileName: string } = {
                url: null,
                fileName: "",
              };

              const championFiles = Array.isArray(req.files) ? req.files : [];
              const uploadedImage = championFiles.find(
                (file: Express.Multer.File) => file.fieldname === id
              );

              if (uploadedImage) {
                console.log(`New Image Found for Champion ID: ${id}`);
                const champImageUrl = await bunnyService.uploadFile(
                  uploadedImage.buffer,
                  `/product/${uploadedImage.originalname}`
                );
                championImages = {
                  url: champImageUrl,
                  fileName: uploadedImage.originalname,
                };
              }

              if (!championImages.url && existingChampion.image?.length > 0) {
                console.log(`No New Image for ${id}, Retaining Existing Image`);
                championImages = {
                  url: image,
                  fileName: image ? image.split("/").pop() : "",
                };
              }

              console.log("Final Image for Champion:", championImages);
              await shopifyService.removeFromCollection(previousCategory.shopifyId,existingChampion.shopifyId)
              let championProductUpdated: {
                product: any;
                variant: any;
              } | null = null;
              if (existingChampion.shopifyId) {
                championProductUpdated =
                  await shopifyService.updateChampionProduct(
                    existingChampion.shopifyId,
                    championName,
                    championPrice,
                    championSku,
                    championQuantity,
                    championDescription,
                    championImages,
                    existingProduct?.inventory || 0,
                    championCollection
                  );
              }

              const updatePayload: Partial<ICreateChampionProduct> = {
                name: championName,
                description: championDescription,
                championQuantity,
                sku: championSku,
                isChampionProduct: true,
                shopifyStatus: championProductUpdated?.product?.status as
                  | "DRAFT"
                  | "ACTIVE"
                  | "ARCHIVED",
                shopifyId: championProductUpdated?.product?.id,
                variants: championProductUpdated?.variant,
                parentProduct: existingProduct?._id,
                position: assignedPosition,
              };

              logger.info("Updating Champion Product in DB:", updatePayload);

              const updatedChampion = await productRepository.updateProduct(
                id,
                updatePayload as Partial<IChampionProduct>,
                [championImages]
              );
              if (!updatedChampion) {
                logger.error(
                  `ProductController - updateProduct: Champion product ${championName} not updated in DB`
                );
              }

              // publish
              const publishedChampionProduct =
                await shopifyService.pubishToSalesChannel(
                  championProductUpdated?.product?.id
                );
              console.log(
                "publishedChampionProduct ==> ",
                publishedChampionProduct
              );

              const activatedChampionProduct =
                await shopifyService.activeProduct(
                  championProductUpdated?.product?.id
                );
              console.log(
                "activatedChampionProduct ==> ",
                activatedChampionProduct
              );
            })
          );

          await Promise.all(
            incomingNewChampions.map(
              async (championProduct: any, index: number) => {
                const { championName, championQuantity, championSku, assignedPosition } = championProduct;
                const championPrice =
                  championQuantity * (existingProduct?.price || 0);
                const championDescription = `Champion product for "${existingProduct?.name}". This product is designated as the champion version with a multiplier quantity of ${championQuantity}.`;

                const championFiles = req.files as Express.Multer.File[];

                let championImages: { url: string | null; fileName: string } = {
                  url: null,
                  fileName: "",
                };
                const imageAtIndex = championFiles.filter(
                  (file) => file.fieldname === "championImages"
                )[index];
                if (championFiles?.length > 0 && imageAtIndex) {
                  const championImage = imageAtIndex;
                  const champImageUrl = await bunnyService.uploadFile(
                    championImage?.buffer,
                    `/product/${championImage?.originalname}`
                  );
                  championImages = {
                    url: champImageUrl,
                    fileName: championImage?.originalname,
                  };
                }

                // Create champion product in Shopify
                const shopifyChampionProduct =
                  await shopifyService.createChampionProduct(
                    championName,
                    championPrice,
                    championSku,
                    championQuantity,
                    championDescription,
                    championImages,
                    existingProduct?.inventory || 0,
                    existingProduct?.category
                      ? (
                          await categoryRepository.getCategoryByKey(
                            "_id",
                            existingProduct.category
                          )
                        )?.shopifyId
                      : undefined
                  );

                if (!shopifyChampionProduct) {
                  logger.error(
                    "ProductController - updateProduct: New champion product not created in Shopify"
                  );
                  return;
                }

                const championProductData: ICreateChampionProduct = {
                  name: championName,
                  description: championDescription,
                  parentProduct: existingProduct?._id,
                  shopifyId: shopifyChampionProduct?.product?.id,
                  shopifyStatus: shopifyChampionProduct?.product?.status as
                    | "DRAFT"
                    | "ACTIVE"
                    | "ARCHIVED",
                  championQuantity: championQuantity,
                  sku: championSku,
                  isChampionProduct: true,
                  variants: shopifyChampionProduct?.variant,
                  image: championImages?.url ? [championImages?.url] : [], // leave image empty for now
                  position: assignedPosition
                };

                // Save the new champion product in the DB
                const createdChampionProduct =
                  await productRepository.createProduct(championProductData);
                if (!createdChampionProduct) {
                  logger.error(
                    "ProductController - updateProduct: New champion product not created in DB"
                  );
                }

                // publish
                const publishedChampionProduct =
                  await shopifyService.pubishToSalesChannel(
                    createdChampionProduct?.shopifyId
                  );
                console.log(
                  "publishedChampionProduct ==> ",
                  publishedChampionProduct
                );

                championIndex = index;
              }
            )
          );

          // Remove champion products (from DB and Shopify) that are not in the incoming data.
          // Gather all incoming existing champion IDs.
          const incomingChampionIds = incomingExistingChampions.map(
            (cp: any) => cp.id
          );
          const championsToRemove = existingChampions.filter(
            (champ: any) => !incomingChampionIds.includes(champ._id.toString())
          );

          console.log("championsToRemove ==> ", championsToRemove);

          for (const champ of championsToRemove) {
            if (champ.shopifyId) {
              // Archive from Shopify
              await shopifyService.deleteShopifyChampionProduct(
                champ.shopifyId
              );
            }
            // Delete from our database
            await productRepository.deleteChampionProduct(champ._id);
          }
        } else {
          // Remove all existing champion products
          const championsToRemove = product?.championProducts || [];
          for (const champ of championsToRemove) {
            if (champ.shopifyId) {
              // Archive from Shopify
              await shopifyService.deleteShopifyChampionProduct(
                champ.shopifyId
              );
              logger.info(
                "ProductController - updateProduct: Champion product archived in Shopify"
              );
            }
            // Delete from our database
            await productRepository.deleteChampionProduct(champ._id);
            logger.info(
              "ProductController - updateProduct: Champion product deleted from DB"
            );
          }
        }
        res.status(200).json({
          success: true,
          data: updatedProduct,
          message: "Product updated successfully",
          error: null,
        });
        return;
      }
    } catch (err: any) {
      console.log(
        "ProductController - updateProduct: Internal server error :-",
        err?.message
      );
      logger.error(
        "ProductController - updateProduct: Internal server error :-",
        err?.message
      );
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message,
      });
      return;
    }
  }

  public async getAllProducts(req: Request, res: Response): Promise<void> {
    const pageNo = req?.query?.pageNo
      ? parseInt(req?.query?.pageNo as string, 10)
      : 1; // Default to 1 if not provided
    const pageSize = req?.query?.pageSize
      ? parseInt(req?.query?.pageSize as string, 10)
      : 10; // Default to 10 if not provided

    if (pageNo && (isNaN(pageNo) || pageNo <= 0)) {
      logger.error("ProductController - getAllProducts: Invalid page number");
      res
        .status(400)
        .json({ success: false, data: null, message: "Invalid page number" });
      return;
    }

    if ((pageSize && isNaN(pageSize)) || pageSize <= 0) {
      logger.error("ProductController - getAllProducts: Invalid page size");
      res
        .status(400)
        .json({ success: false, data: null, message: "Invalid page size" });
      return;
    }

    // Search & filter parameters
    const title = (req?.query?.title as string) || null;
    const vendor = (req?.query?.vendor as string) || null;
    const category = (req?.query?.category as string) || null;
    const minPrice = parseFloat(req?.query?.minPrice as string) || null;
    const maxPrice = parseFloat(req?.query?.maxPrice as string) || null;
    const sellModeType = (req?.query?.sellModeType as string) || null;

    console.log("title===>", title);
    try {
      const products: IProductList = await productRepository.getProducts({
        pageNo,
        pageSize,
        title,
        vendor,
        category,
        minPrice,
        maxPrice,
        sellModeType
      });
      console.log("products===>", products);

      if (products?.products?.length === 0) {
        console.log("ProductController - getAllProducts: No products found");
        logger.info("ProductController - getAllProducts: No products found");
        res
          .status(200)
          .json({ success: false, data: null, message: "No products found" });
        return;
      }

      logger.info(
        "ProductController - getAllProducts: products found :-",
        products
      );
      res.status(200).json({
        success: true,
        data: { products },
        message: "Products fetched successfully",
      });
      return;
    } catch (err: any) {
      console.log(
        "ProductController - getAllProducts: Internal server error :-",
        err?.message
      );
      logger.error(
        "ProductController - getAllProducts: Internal server error :-",
        err?.message
      );
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message,
      });
      return;
    }
  }

  public async getOfflineProducts(req: Request, res: Response): Promise<void> {
    try {
      const pageNo = req?.query?.pageNo
        ? parseInt(req?.query?.pageNo as string, 10)
        : 1; // Default to 1 if not provided
      const pageSize = req?.query?.pageSize
        ? parseInt(req?.query?.pageSize as string, 10)
        : 10; // Default to 10 if not provided

      if (pageNo && (isNaN(pageNo) || pageNo <= 0)) {
        logger.error("ProductController - getOfflineProducts: Invalid page number");
        res
          .status(400)
          .json({ success: false, data: null, message: "Invalid page number" });
        return;
      }

      if ((pageSize && isNaN(pageSize)) || pageSize <= 0) {
        logger.error("ProductController - getOfflineProducts: Invalid page size");
        res
          .status(400)
          .json({ success: false, data: null, message: "Invalid page size" });
        return;
      }

      // Search & filter parameters
      const title = (req?.query?.title as string) || null;

      //get offline products as well
      const offlineProducts =
        await offlineProductRepository.getAllOfflineProducts({
          pageNo,
          pageSize,
          name: title,
        });

      console.log("offlineProducts===>", offlineProducts);

      logger.info(
        "ProductController - getOfflineProducts: products found :-",
        offlineProducts
      );
      res.status(200).json({
        success: true,
        data: { offlineProducts },
        message: "Products fetched successfully",
      });
      return;
    } catch (err: any) {
      console.log(
        "ProductController - getOfflineProducts: Internal server error :-",
        err?.message
      );
      logger.error(
        "ProductController - getOfflineProducts: Internal server error :-",
        err?.message
      );
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message,
      });
      return;
    }
  }

  public async getProductById(req: Request, res: Response): Promise<void> {
    const productId: string = req?.params?.id;

    if (!productId) {
      logger.error(
        "ProductController - getProductById: Product ID not provided"
      );
      res.status(400).json({
        success: false,
        data: null,
        message: "Product ID not provided",
      });
      return;
    }
    console.log("product id ==>", productId);

    try {
      const product: IProduct | null =
        (await productRepository.getProductById(productId)) ||
        (await offlineProductRepository.getOfflineProductById(productId));
        console.log("getProduct ==>", product);

      if (!product) {
        logger.error(
          `ProductController - getProductById: Product not found for product id ${productId}`
        );
        res
          .status(400)
          .json({ success: false, data: null, message: "Product not found" });
        return;
      }
      // let raisedSalesAmount = 0;
      // if (product?.sellModeType === "offline") {
      //   const salesData = await OfflineSalesModel.findOne({
      //     productId: product._id,
      //   });
      //   if (salesData) {
      //     raisedSalesAmount = salesData.amount;
      //   }
      // }

      console.log("product ==>", product);

      res.status(200).json({
        success: true,
        data: product,
        message: "Product fetched successfully",
      });
    } catch (err: any) {
      console.log(
        "ProductController - getProductById: Internal server error :-",
        err?.message
      );
      logger.error(
        "ProductController - getProductById: Internal server error :-",
        err?.message
      );
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message,
      });
    }
  }

  public async deleteProduct(req: Request, res: Response): Promise<void> {
    const productId: string = req?.params?.id;

    if (!productId) {
      logger.error(
        "ProductController - deleteProduct: Product ID not provided"
      );
      res.status(400).json({
        success: false,
        data: null,
        message: "Product ID is required",
      });
      return;
    }

    console.log("Delete Product : productId===>", productId);

    try {
      const product: IProduct | any = await productRepository.getProductById(
        productId 
      ) || await offlineProductRepository.getOfflineProductById(productId);

      console.log("Delete Product : product===>", product);
      if (!product) {
        logger.error(
          `Delete Product : Product not found for product id ${productId}`
        );
        res
          .status(400)
          .json({ success: false, data: null, message: "Product not found" });
        return;
      }

      if (product?.sellModeType === "online") {
        // Soft delete from Shopify by updating product status
        const deleteShopifyProduct: boolean =
          await shopifyService.archiveProduct(product?.shopifyId);
        console.log(
          "Delete Product : deleteShopifyProduct===>",
          deleteShopifyProduct
        );

        if (!deleteShopifyProduct) {
          logger.error(
            `ProductController - deleteProduct: Error while deleting product in shopify for product id ${productId}`
          );
          res.status(400).json({
            success: false,
            data: null,
            message: "shopify product not archived",
          });
          return;
        }

        // remove champion products and delete them and archive them
        if (
          product?.championProducts &&
          product?.championProducts?.length > 0
        ) {
          const championsToRemove = product?.championProducts || [];
          for (const champ of championsToRemove) {
            if (champ.shopifyId) {
              // Archive from Shopify
              await shopifyService.deleteShopifyChampionProduct(
                champ.shopifyId
              );
              logger.info(
                `ProductController - deleteProduct: Champion product archived for product id ${productId}`
              );
              // await shopifyService.unpublishFromSalesChannel(champ.shopifyId);
              logger.info(
                "ProductController - updateProduct: Champion product unpublished in Shopify"
              );
            }
            // Delete from our database
            await productRepository.deleteChampionProduct(champ._id);
            logger.info(
              `ProductController - deleteProduct: Champion product deleted for product id ${productId}`
            );
          }
        }
      } else {
        const deleteOfflineProduct: IOfflineProduct | null | any =
          await offlineProductRepository.deleteOfflineProduct(product?._id);
        console.log(
          "Delete Product : deleteOfflineProduct===>",
          deleteOfflineProduct
        );

        if (!deleteOfflineProduct) {
          logger.error(
            `ProductController - deleteProduct: Error while deleting offline product for product id ${productId}`
          );
          res
            .status(400)
            .json({
              success: false,
              data: null,
              message: "Offline Product not deleted",
            });
          return;
        }

        // need to perform the sales disconnection.
        await offlineProductRepository.removeGroupOfflineProductSaleByProduct(product?._id);

        // return
        res.status(200).json({
          success: true,
          data: deleteOfflineProduct,
          message: "Offline Product deleted successfully",
          error: null,
        });
        return;
      }

      const deleteProduct: IProduct | null | any =
        await productRepository.deleteProduct(product?._id);
      console.log("Delete Product : deleteProduct===>", deleteProduct);

      if (!deleteProduct) {
        logger.error(
          `ProductController - deleteProduct: Error while deleting product for product id ${productId}`
        );
        res
          .status(400)
          .json({ success: false, data: null, message: "Product not deleted" });
        return;
      }

      // unpublish product and remove from collection
      const unpublishProduct: boolean | null | undefined =
        await shopifyService.unpublishFromSalesChannel(product?.shopifyId);
      if (unpublishProduct) {
        console.log(
          "ProductController - deleteProduct: Product not unpublished for product id",
          productId
        );
        logger.error(
          `ProductController - deleteProduct: Product not unpublished for product id ${productId}`
        );
      }

      const category = await categoryRepository.getCategoryByKey(
        "_id",
        new Types.ObjectId(deleteProduct?.category)
      );
      console.log("category=> ", category);
      if (category) {
        const removeProductFromCollection: boolean | null | undefined =
          await shopifyService.removeFromCollection(
            category?.shopifyId,
            product?.shopifyId
          );
        console.log(
          "removeProductFromCollection ==> ",
          removeProductFromCollection
        );
        if (!removeProductFromCollection) {
          console.log(
            "ProductController - deleteProduct: Product not removed from collection"
          );
          logger.error(
            "ProductController - deleteProduct: Product not removed from collection"
          );
        }
      }

      // remopve from group
      // await groupRepository.removeProduct(product?._id); // remove product from group

      logger.info(
        `ProductController - deleteProduct: Product deleted successfully for product id ${productId}`
      );
      res.status(200).json({
        success: true,
        data: deleteProduct,
        message: "Product deleted successfully",
        error: null,
      });
      return;
    } catch (err: any) {
      console.error(
        "ProductController - deleteProduct: Internal server error",
        err?.message
      );
      logger.error(
        "ProductController - deleteProduct: Internal server error",
        err?.message
      );
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message,
      });
    }
  }

  public async testShopfyWebhook(req: Request, res: Response): Promise<void> {
    console.log("Request:>>>>>>", req.body);

    const data = req?.body;

    try {
      const donationData = {
        orderId: data?.id,
        donorFirstName: data?.customer?.first_name,
        donorLastName: data?.customer?.last_name,
        donorEmail: data?.customer?.email,
        donorPhone: data?.customer?.phone,
        donationAmount: data?.line_items?.find(
          (item: any) => item?.product_id === "7292735946850" // product id for donation
        )?.price,
        groupId: data?.note_attributes?.find(
          (attr: any) => attr?.name === "Group-Id" // group id in note_attributes
        )?.value,
        donationDate: data?.created_at,
        currencyCode: data?.currency,
      };

      console.log("donationData:>>>>>>", donationData);
    } catch (err: any) {
      logger.error(
        "ProductController - testShopfyWebhook: Internal server error",
        err?.message
      );
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message,
      });
    }

    res.status(200).json({
      success: true,
      data: req.body,
      message: "TEST API Called successfully",
    });
  }

  public async getShopifyProductsWebhook(
    req: Request,
    res: Response
  ): Promise<void> {
    const categoryId = req?.query?.categoryId as string;
    const slug = req?.query?.slug as string;

    try {
      const products = await productRepository.getShopifyProductsWB(
        categoryId,
        slug
      );

      if (!products || products?.length === 0) {
        logger.error(
          `ProductController - getShopifyProductsWebhook: Products not found for category id ${categoryId}`
        );
        res
          .status(400)
          .json({ success: false, data: null, message: "Products not found" });
        return;
      }

      logger.info(
        `ProductController - getShopifyProductsWebhook: Products found for category id ${categoryId}`
      );

      res.status(200).json({
        success: true,
        data: products,
        message: "Products fetched successfully",
      });
      return;
    } catch (err: any) {
      console.error(
        "ProductController - getShopifyProductsWebhook: Internal server error",
        err?.message
      );
      logger.error(
        "ProductController - getShopifyProductsWebhook: Internal server error",
        err?.message
      );
      res.status(500).json({
        success: false,
        data: null,
        message: "Internal server error",
        error: err?.message,
      });
    }
  }
}
