export const POSTGRES_INTEGER_MAX = 2_147_483_647;

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum = POSTGRES_INTEGER_MAX,
): value is number {
  return (
    typeof value === "number"
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
