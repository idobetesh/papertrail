import { Request, Response } from 'express';
import { StorageService } from '../services/storage.service';

export class StorageController {
  constructor(private storageService: StorageService) {}

  /**
   * List all buckets
   */
  listBuckets = async (req: Request, res: Response): Promise<void> => {
    try {
      const buckets = await this.storageService.listBuckets();
      res.json({ buckets });
    } catch (error) {
      console.error('Error listing buckets:', error);
      res.status(500).json({ error: 'Failed to list buckets' });
    }
  };

  /**
   * List objects in a bucket
   */
  listObjects = async (req: Request, res: Response): Promise<void> => {
    try {
      const { bucketName } = req.params;
      const prefix = (req.query.prefix as string) || '';
      const maxResults = parseInt(req.query.maxResults as string) || 100;
      const pageToken = req.query.pageToken as string | undefined;

      const result = await this.storageService.listObjects(bucketName, {
        prefix,
        maxResults,
        pageToken,
      });

      res.json(result);
    } catch (error) {
      console.error(`Error listing objects in ${req.params.bucketName}:`, error);
      res.status(500).json({ error: 'Failed to list objects' });
    }
  };

  /**
   * Get object metadata
   */
  getObject = async (req: Request, res: Response): Promise<void> => {
    try {
      const bucketName = req.params.bucketName;
      // Extract object path from the wildcard (everything after /objects/)
      const fullPath = req.path;
      const objectsPrefix = `/api/storage/buckets/${bucketName}/objects/`;
      const objectPath = fullPath.replace(objectsPrefix, '');

      if (!objectPath) {
        res.status(400).json({ error: 'Object path is required' });
        return;
      }

      const object = await this.storageService.getObject(bucketName, objectPath);

      if (!object) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }

      res.json(object);
    } catch (error) {
      console.error('Error getting object:', error);
      res.status(500).json({ error: 'Failed to get object' });
    }
  };

  /**
   * Delete an object
   */
  deleteObject = async (req: Request, res: Response): Promise<void> => {
    try {
      const bucketName = req.params.bucketName;
      // Extract object path from the wildcard (everything after /objects/)
      const fullPath = req.path;
      const objectsPrefix = `/api/storage/buckets/${bucketName}/objects/`;
      const objectPath = fullPath.replace(objectsPrefix, '');

      if (!objectPath) {
        res.status(400).json({ error: 'Object path is required' });
        return;
      }

      const { confirm } = req.body;

      if (confirm !== true) {
        res.status(400).json({ error: 'Deletion requires confirm: true' });
        return;
      }

      await this.storageService.deleteObject(bucketName, objectPath);
      res.json({ success: true, message: 'Object deleted successfully' });
    } catch (error) {
      console.error('Error deleting object:', error);
      res.status(500).json({ error: 'Failed to delete object' });
    }
  };

  /**
   * Delete multiple objects
   */
  deleteMultipleObjects = async (req: Request, res: Response): Promise<void> => {
    try {
      const { bucketName } = req.params;
      const { objectPaths, confirm } = req.body;

      if (confirm !== true) {
        res.status(400).json({ error: 'Deletion requires confirm: true' });
        return;
      }

      if (!Array.isArray(objectPaths) || objectPaths.length === 0) {
        res.status(400).json({ error: 'objectPaths must be a non-empty array' });
        return;
      }

      await this.storageService.deleteObjects(bucketName, objectPaths);
      res.json({ success: true, deleted: objectPaths.length });
    } catch (error) {
      console.error('Error deleting objects:', error);
      res.status(500).json({ error: 'Failed to delete objects' });
    }
  };
}
