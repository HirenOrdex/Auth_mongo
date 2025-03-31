export interface IShopifyProduct { 
    product: {
        id: string;
        title: string;
        productType: string;
        status: string;
        vendor: string;
        variants: {
        edges: {
            node: {
            id: string;
            price: string;
            };
        }[];
        };
        media: {
        edges: {
            node: {
            id: string;
            alt: string;
            image?: {
                url: string;
            };
            };
        }[];
        };
    };
    variant: {
        id: string;
        title: string;
        price: string;
    }[];
}

export interface IProductList {
    products: {
      id: string;
      name: string;
      description: string;
      productType: string;
      vendor: string;
      price: number;
      image: string[];
    }[];
    pageInfo: {
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      totalCount: number;
    };
  }