// Type for Billing Address
export interface BillingAddress {
    first_name: string;
    last_name: string;
    address1: string;
    city: string;
    province_code: string;
    zip: string;
    country: string;
}

// Type for Tax Receipt Configuration
export interface TaxReceiptConfigForPDF {
    organizationName: string;
    englishAddress: string;
    englishCity: string;
    englishProvince: string;
    englishPostalCode: string;
    englishPhoneNumber: string;
    englishEmail: string;
    frenchAddress: string;
    frenchCity: string;
    frenchProvince: string;
    frenchPostalCode: string;
    // faxNumber: string;
    frenchEmail: string;
    craNum: string;
    logo: string;
    signatureImage: string;
    signatureName: string;
    signatureTitle: string;
    signatureText?: string; 
}

// Type for Product Data
export interface ProductData {
    id: string;
    name: string;
    quantity: number;
    price: number;
}

// Type for Order Details
export interface OrderDetails {
    groupId: string;
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    province_code: string;
    zip: string;
    country: string;
    orderDate: string;
    productData: ProductData[];
    donationAmount: number;
    totalTaxReceiptableAmount: number;
    totalAmount: number;
    donationFrom:string;
}

// Type for Tax Receipt Data (used for PDF generation & storage)
export interface TaxReceiptData {
    taxReceiptConfigs: TaxReceiptConfigForPDF;
    taxReceiptNo: string;
    orderDetails: OrderDetails;
}

// Input Type for the Service Method
export interface GenerateTaxReceiptInput {
    billing_address: BillingAddress;
    productData: ProductData[];
    donationAmount: number;
    totalTaxReceiptableAmount: number;
    orderDate: string;
    taxReceiptNo: string;
    email: string;
}
