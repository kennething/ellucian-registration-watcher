/** Deserializes a `snake_case` object to `camelCase`.
 */
export function toCamelCase(obj: object): object {
  if (Array.isArray(obj)) return obj.map((item) => (typeof item === "object" && item !== null ? toCamelCase(item) : item));

  const camelCaseData: object = {};

  for (const key in obj) {
    const value = obj[key as keyof typeof obj];
    const camelCaseKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

    // @ts-expect-error
    camelCaseData[camelCaseKey] = typeof value === "object" && value !== null && !Array.isArray(value) ? toCamelCase(value) : value;
  }
  return camelCaseData;
}
