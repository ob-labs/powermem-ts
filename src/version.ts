export const VERSION = '0.4.0';
export const VERSION_INFO = VERSION.split('.').map(Number) as [number, number, number];

export function getVersion(): string {
  return VERSION;
}
