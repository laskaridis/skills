import { Basket } from "./basket.js";
export interface BasketRepository {
  find(ownerId: string): Promise<Basket | undefined>;
  save(basket: Basket): Promise<void>;
  delete(ownerId: string): Promise<void>;
}
