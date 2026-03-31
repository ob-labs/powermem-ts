/** camelCase -> snake_case（单个 key） */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** snake_case -> camelCase（单个 key） */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** 深度转换对象所有 key：camelCase -> snake_case */
export function toSnakeCase(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        camelToSnake(k),
        toSnakeCase(v),
      ])
    );
  }
  return obj;
}

/** 深度转换对象所有 key：snake_case -> camelCase */
export function toCamelCase(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        snakeToCamel(k),
        toCamelCase(v),
      ])
    );
  }
  return obj;
}
