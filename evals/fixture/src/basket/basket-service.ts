import { Basket } from "./basket.js";
import { BasketRepository } from "./basket-repository.js";
import { ProductUnavailableError } from "./errors.js";
import { Product } from "../catalog/product.js";
import { Price } from "../pricing/price.js";

export class BasketService {
  constructor(private repo: BasketRepository) {}

  async addProduct(ownerId: string, product: Product, qty: number, unitPrice: Price) {
    if (!product.available) throw new ProductUnavailableError();
    const basket = (await this.repo.find(ownerId)) ?? new Basket(ownerId);
    basket.add(product.id, qty, unitPrice);
    await this.repo.save(basket);
  }
}
