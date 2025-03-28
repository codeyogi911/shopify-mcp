import fs from 'fs';
import path from 'path';

export class SchemaCache {
  private static instance: SchemaCache;
  private cacheDir: string;
  private cacheFile: string;
  private cache: any = null;

  private constructor() {
    // Create cache directory in the project root
    this.cacheDir = path.join(process.cwd(), '.cache');
    this.cacheFile = path.join(this.cacheDir, 'shopify-schema-cache.json');
    
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  public static getInstance(): SchemaCache {
    if (!SchemaCache.instance) {
      SchemaCache.instance = new SchemaCache();
    }
    return SchemaCache.instance;
  }

  public async getSchema(): Promise<any | null> {
    try {
      // If schema is already loaded in memory, return it
      if (this.cache) {
        return this.cache;
      }

      // Try to load from cache file
      if (fs.existsSync(this.cacheFile)) {
        const cachedSchema = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
        this.cache = cachedSchema;
        return cachedSchema;
      }

      return null;
    } catch (error) {
      console.error('Error reading schema cache:', error);
      return null;
    }
  }

  public async setSchema(schema: any): Promise<void> {
    try {
      // Update in-memory cache
      this.cache = schema;

      // Write to cache file
      fs.writeFileSync(this.cacheFile, JSON.stringify(schema, null, 2));
    } catch (error) {
      console.error('Error writing schema cache:', error);
    }
  }

  public clearCache(): void {
    try {
      // Clear in-memory cache
      this.cache = null;

      // Remove cache file if it exists
      if (fs.existsSync(this.cacheFile)) {
        fs.unlinkSync(this.cacheFile);
      }
    } catch (error) {
      console.error('Error clearing schema cache:', error);
    }
  }
} 