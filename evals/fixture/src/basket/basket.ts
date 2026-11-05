import { BasketLine, MAX_QUANTITY_PER_LINE } from "./basket-line.js";
import { BasketFullError, QuantityLimitError } from "./errors.js";
import { Price } from "../pricing/price.js";

export const MAX_LINES = 50;
const EXPIRY_MS = 30 * 24 * 3600 * 1000;

export class Basket {
  constructor(
    readonly ownerId: string,
    private lines: BasketLine[] = [],
    private modifiedAt: Date = new Date(),
  ) {}

  add(productId: string, quantity: number, unitPrice: Price): void {
    const existing = this.lines.find((l) => l.productId === productId);
    if (existing) {
      if (existing.quantity + quantity > MAX_QUANTITY_PER_LINE) throw new QuantityLimitError();
      existing.quantity += quantity;
    } else {
      if (this.lines.length >= MAX_LINES) throw new BasketFullError();
      if (quantity > MAX_QUANTITY_PER_LINE) throw new QuantityLimitError();
      this.lines.push({ productId, quantity, unitPrice });
    }
    this.modifiedAt = new Date();
  }

  remove(productId: string): void {
    this.lines = this.lines.filter((l) => l.productId !== productId);
    this.modifiedAt = new Date();
  }

  contents(): readonly BasketLine[] { return this.lines; }
  isExpired(now = new Date()): boolean { return now.getTime() - this.modifiedAt.getTime() > EXPIRY_MS; }
}
