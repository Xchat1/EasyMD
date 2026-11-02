/** Keep browser import limits aligned with the local document service. */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
