import { FirestoreService } from './firestore.service';
import { StorageService } from './storage.service';
import * as child_process from 'child_process';
import * as util from 'util';

const exec = util.promisify(child_process.exec);

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  message?: string;
}

export interface StorageStatistics {
  totalSize: number;
  totalObjects: number;
  buckets: Array<{
    name: string;
    size: number;
    objectCount: number;
  }>;
}

export interface HealthStatus {
  overall: 'healthy' | 'unhealthy';
  services: ServiceHealth[];
  version: {
    sha: string;
    shortSha: string;
  };
  storage?: StorageStatistics;
  timestamp: string;
}

export class HealthService {
  constructor(
    private firestoreService: FirestoreService,
    private storageService: StorageService
  ) {}

  /**
   * Get git commit SHA
   */
  async getVersion(): Promise<{ sha: string; shortSha: string }> {
    try {
      const path = require('path');
      const fs = require('fs');
      
      // Try multiple strategies to find the git root
      let repoRoot: string | null = null;
      
      // Strategy 1: Walk up from current working directory
      let currentDir = process.cwd();
      for (let i = 0; i < 10; i++) {
        const gitDir = path.join(currentDir, '.git');
        if (fs.existsSync(gitDir)) {
          repoRoot = currentDir;
          break;
        }
        const parent = path.dirname(currentDir);
        if (parent === currentDir) {break;}
        currentDir = parent;
      }
      
      // Strategy 2: Try relative to __dirname (for compiled code)
      if (!repoRoot) {
        const pathFromDirname = path.resolve(__dirname, '../../../');
        if (fs.existsSync(path.join(pathFromDirname, '.git'))) {
          repoRoot = pathFromDirname;
        }
      }
      
      // Strategy 3: Try relative to server.ts location
      if (!repoRoot) {
        const pathFromServer = path.resolve(__dirname, '../../../../');
        if (fs.existsSync(path.join(pathFromServer, '.git'))) {
          repoRoot = pathFromServer;
        }
      }
      
      if (!repoRoot) {
        throw new Error('Could not find git repository root');
      }
      
      const { stdout, stderr } = await exec('git rev-parse HEAD', {
        cwd: repoRoot,
        timeout: 5000,
      });
      
      if (stderr && !stdout) {
        throw new Error(stderr);
      }
      
      const sha = stdout.trim();
      if (!sha || sha.length < 7) {
        throw new Error('Invalid git SHA');
      }
      
      return {
        sha,
        shortSha: sha.substring(0, 7),
      };
    } catch (error) {
      console.error('Error getting git version:', error instanceof Error ? error.message : error);
      // Fallback if git is not available or not in a git repo
      return {
        sha: 'unknown',
        shortSha: 'unknown',
      };
    }
  }

  /**
   * Check Firestore health
   */
  async checkFirestore(): Promise<ServiceHealth> {
    try {
      // Try to list collections (lightweight operation)
      const collections = this.firestoreService.getKnownCollections();
      return {
        name: 'Firestore',
        status: 'healthy',
        message: `${collections.length} known collections`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Firestore health check failed:', errorMessage);
      return {
        name: 'Firestore',
        status: 'unhealthy',
        message: errorMessage.length > 50 ? errorMessage.substring(0, 50) + '...' : errorMessage,
      };
    }
  }

  /**
   * Check Storage health
   */
  async checkStorage(): Promise<ServiceHealth> {
    try {
      // Try to list buckets (lightweight operation)
      const buckets = await this.storageService.listBuckets();
      return {
        name: 'Cloud Storage',
        status: 'healthy',
        message: `${buckets.length} bucket(s) available`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Storage health check failed:', errorMessage);
      return {
        name: 'Cloud Storage',
        status: 'unhealthy',
        message: errorMessage.length > 50 ? errorMessage.substring(0, 50) + '...' : errorMessage,
      };
    }
  }

  /**
   * Get overall health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    try {
      const [firestoreHealth, storageHealth, version, storageStats] = await Promise.allSettled([
        this.checkFirestore(),
        this.checkStorage(),
        this.getVersion(),
        this.storageService.getStorageStatistics(),
      ]);

      const services: ServiceHealth[] = [
        firestoreHealth.status === 'fulfilled' 
          ? firestoreHealth.value 
          : { name: 'Firestore', status: 'unhealthy', message: 'Health check failed' },
        storageHealth.status === 'fulfilled' 
          ? storageHealth.value 
          : { name: 'Cloud Storage', status: 'unhealthy', message: 'Health check failed' },
      ];

      const versionInfo = version.status === 'fulfilled' 
        ? version.value 
        : { sha: 'unknown', shortSha: 'unknown' };

      const storageStatistics = storageStats.status === 'fulfilled'
        ? storageStats.value
        : undefined;

      const overall =
        services.every((s) => s.status === 'healthy') ? 'healthy' : 'unhealthy';

      return {
        overall,
        services,
        version: versionInfo,
        storage: storageStatistics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Fallback if everything fails
      return {
        overall: 'unhealthy',
        services: [
          { name: 'Firestore', status: 'unknown', message: 'Health check error' },
          { name: 'Cloud Storage', status: 'unknown', message: 'Health check error' },
        ],
        version: { sha: 'unknown', shortSha: 'unknown' },
        timestamp: new Date().toISOString(),
      };
    }
  }
}
