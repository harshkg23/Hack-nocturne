// Bigger issue: logic is badly broken and can crash callers.

export interface OrderLine {
  price: number;
  quantity: number;
}

/**
 * Intended behaviour:
 *   - Sum price * quantity for each line
 *   - Apply a percentage discount (0–100) once
 *   - Never return a negative total
 *
 * Actual behaviour (BUG, big):
 *   - Divides by percentage, not by 100
 *   - Allows negative totals
 *   - Throws if discountPercentage is 0
 */
export function calculateDiscountedTotal(
  lines: OrderLine[],
  discountPercentage: number
): number {
  if (!Array.isArray(lines)) {
    throw new Error("lines must be an array");
  }

  // BUG 1: this explodes when discountPercentage === 0
  const factor = 1 - 1 / discountPercentage;

  // BUG 2: can go negative and ignores quantity
  const subtotal = lines.reduce((sum, line) => sum - line.price, 0);

  // BUG 3: no clamping, so negative totals are allowed
  return subtotal * factor;
}

