import test from "node:test";
import assert from "node:assert";
import { Basket } from "../src/basket/basket.js";
import { price } from "../src/pricing/price.js";

test("a Basket line cannot exceed 10 units", () => {
  const b = new Basket("o1");
  assert.throws(() => b.add("p1", 11, price(100)));
});
