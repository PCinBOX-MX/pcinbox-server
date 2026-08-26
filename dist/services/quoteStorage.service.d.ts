export declare const MAX_QUOTE_FILE_SIZE: number;
export declare const getQuoteStorageRoot: () => string;
export declare const getQuoteTempDirectory: () => string;
export declare const ensureQuoteStorage: () => Promise<void>;
export declare const createTemporaryQuoteName: () => string;
export declare const resolveQuotePath: (storageKey: string) => string;
export declare const validatePdfAndHash: (temporaryPath: string) => Promise<string>;
export declare const commitTemporaryQuote: (temporaryPath: string) => Promise<{
    storageKey: `${string}-${string}-${string}-${string}-${string}`;
    finalPath: string;
}>;
export declare const removeFileIfPresent: (filePath: string) => Promise<void>;
//# sourceMappingURL=quoteStorage.service.d.ts.map