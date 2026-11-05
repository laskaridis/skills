import { BasketService } from "../basket/basket-service.js";
import { DomainError } from "../basket/errors.js";

/** Thin adapter: no business rules here. DomainError -> 422. */
export const statusFor = (e: unknown): number => (e instanceof DomainError ? 422 : 500);
export const routes = (_service: BasketService) => ({ "POST /basket/lines": "addProduct" });
