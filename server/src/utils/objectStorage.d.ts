export declare function objectStorageConfigured(): boolean;
export declare function objectStorageErrorMessage(error: unknown): string;
export declare function saveUpload(key: string, buffer: Buffer, contentType: string): Promise<string>;
export declare function deleteUpload(url?: string | null): Promise<void>;
export declare function getUpload(key: string): Promise<{
    body: Buffer<ArrayBuffer>;
    contentType: string;
    etag: string | undefined;
}>;
export declare function migrateLocalUploadsToObjectStorage(): Promise<void>;
//# sourceMappingURL=objectStorage.d.ts.map