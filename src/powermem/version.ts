export const VERSION = '0.1.1';
export const VERSION_INFO = VERSION.split('.').map(Number) as [number, number, number];

export function getVersion(): string {
  return VERSION;
}
