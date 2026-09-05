/**
 * File extensions the indexer can read and embed.
 *
 * Kept in its own file so both server (document-indexer) and client
 * (file-picker validation) can import it without pulling in server deps.
 */
export const SUPPORTED_TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.log'] as const;
export type SupportedTextExtension = (typeof SUPPORTED_TEXT_EXTENSIONS)[number];

export const SUPPORTED_EXTENSIONS_LABEL = SUPPORTED_TEXT_EXTENSIONS.join(', ');

/** Returns true when the file can be indexed for RAG. */
export function isSupportedTextFile(fileName: string): boolean {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return (SUPPORTED_TEXT_EXTENSIONS as readonly string[]).includes(ext);
}
