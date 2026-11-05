import { Price } from "../pricing/price.js";
export const MAX_QUANTITY_PER_LINE = 10;
export interface BasketLine { productId: string; quantity: number; unitPrice: Price; }
