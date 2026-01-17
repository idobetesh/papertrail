import { Storage } from '@google-cloud/storage';

export interface StorageBucket {
  name: string;
  location?: string;
  created?: string;
}

export interface StorageObject {
  name: string;
  size: string | number | undefined;
  contentType?: string;
  timeCreated?: string;
  updated?: string;
  publicUrl: string;
}

export interface StorageObjectMetadata extends StorageObject {
  metadata: Record<string, unknown>;
}

export interface ListObjectsResult {
  objects: StorageObject[];
  nextPageToken: string | null;
  hasMore: boolean;
}

export class StorageService {
  constructor(private storage: Storage) {}

  /**
   * List all buckets
   */
  async listBuckets(): Promise<StorageBucket[]> {
    const [buckets] = await this.storage.getBuckets();
    return buckets.map((bucket) => ({
      name: bucket.name,
      location: bucket.metadata.location,
      created: bucket.metadata.timeCreated,
    }));
  }

  /**
   * List objects in a bucket
   */
  async listObjects(
    bucketName: string,
    options: {
      prefix?: string;
      maxResults?: number;
      pageToken?: string;
    } = {}
  ): Promise<ListObjectsResult> {
    const { prefix = '', maxResults = 100, pageToken } = options;

    const bucket = this.storage.bucket(bucketName);
    const [files, response] = await bucket.getFiles({
      prefix,
      maxResults,
      pageToken,
    });

    const objects = await Promise.all(
      files.map(async (file) => {
        const [metadata] = await file.getMetadata();
        return {
          name: file.name,
          size: metadata.size,
          contentType: metadata.contentType,
          timeCreated: metadata.timeCreated,
          updated: metadata.updated,
          publicUrl: file.publicUrl(),
        };
      })
    );

    const nextPageTokenValue = (response?.pageToken as string | undefined) || null;

    return {
      objects,
      nextPageToken: nextPageTokenValue,
      hasMore: !!nextPageTokenValue,
    };
  }

  /**
   * Get object metadata
   */
  async getObject(bucketName: string, objectPath: string): Promise<StorageObjectMetadata | null> {
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();

    if (!exists) {
      return null;
    }

    const [metadata] = await file.getMetadata();
    return {
      name: file.name,
      size: metadata.size,
      contentType: metadata.contentType,
      timeCreated: metadata.timeCreated,
      updated: metadata.updated,
      publicUrl: file.publicUrl(),
      metadata,
    };
  }

  /**
   * Delete an object
   */
  async deleteObject(bucketName: string, objectPath: string): Promise<void> {
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(objectPath);
    await file.delete();
  }

  /**
   * Delete multiple objects
   */
  async deleteObjects(bucketName: string, objectPaths: string[]): Promise<void> {
    const bucket = this.storage.bucket(bucketName);
    await Promise.all(objectPaths.map((path: string) => bucket.file(path).delete()));
  }

  /**
   * Get storage statistics for all buckets
   */
  async getStorageStatistics(): Promise<{
    totalSize: number;
    totalObjects: number;
    buckets: Array<{
      name: string;
      size: number;
      objectCount: number;
    }>;
  }> {
    try {
      const buckets = await this.listBuckets();
      let totalSize = 0;
      let totalObjects = 0;
      const bucketStats: Array<{ name: string; size: number; objectCount: number }> = [];

      // Get stats for each bucket (with pagination)
      for (const bucket of buckets) {
        let bucketSize = 0;
        let bucketObjectCount = 0;
        let pageToken: string | undefined = undefined;

        do {
          const result = await this.listObjects(bucket.name, {
            maxResults: 1000,
            pageToken,
          });

          result.objects.forEach((obj) => {
            const size = typeof obj.size === 'string' ? parseInt(obj.size, 10) : (obj.size || 0);
            bucketSize += size;
            bucketObjectCount++;
          });

          pageToken = result.nextPageToken || undefined;
        } while (pageToken);

        totalSize += bucketSize;
        totalObjects += bucketObjectCount;
        bucketStats.push({
          name: bucket.name,
          size: bucketSize,
          objectCount: bucketObjectCount,
        });
      }

      return {
        totalSize,
        totalObjects,
        buckets: bucketStats,
      };
    } catch (error) {
      console.error('Error getting storage statistics:', error);
      return {
        totalSize: 0,
        totalObjects: 0,
        buckets: [],
      };
    }
  }
}
