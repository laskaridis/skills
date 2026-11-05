/** Integer minor units (e.g. cents). */
export type Price = number & { readonly __brand: "Price" };
export const price = (minor: number): Price => {
  if (!Number.isInteger(minor) || minor < 0) throw new Error("invalid price");
  return minor as Price;
};
