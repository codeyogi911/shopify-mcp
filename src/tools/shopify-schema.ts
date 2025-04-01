import fs from 'fs';
import path from 'path';
import { 
  buildClientSchema, 
  getIntrospectionQuery,
  GraphQLSchema, 
  GraphQLObjectType,
  printSchema,
  IntrospectionQuery
} from 'graphql';
import { introspectEndpoint } from '../helpers/introspection.js';

// Class to handle the Shopify GraphQL schema
export class ShopifySchema {
  private schema: GraphQLSchema | null = null;
  private rawSchema: IntrospectionQuery | null = null;
  private schemaCache: string;
  private shopify: any;
  private static instance: ShopifySchema | null = null;
  private static schemaCache: Map<string, IntrospectionQuery> = new Map();

  constructor(shopify: any) {
    this.shopify = shopify;
    this.schemaCache = path.join(process.cwd(), 'shopify-schema-cache.json');
  }

  // Get singleton instance
  public static getInstance(shopify: any): ShopifySchema {
    if (!ShopifySchema.instance) {
      ShopifySchema.instance = new ShopifySchema(shopify);
    }
    return ShopifySchema.instance;
  }

  // Load the schema from cache or fetch it from Shopify
  async loadSchema(forceFetch = false): Promise<IntrospectionQuery> {
    // Check memory cache first
    const storeDomain = this.shopify.config.hostName;
    if (!storeDomain) {
        throw new Error('Shopify host name (storeDomain) is not configured on the server object.');
    }
    const memoryCachedSchema = ShopifySchema.schemaCache.get(storeDomain);
    if (!forceFetch && memoryCachedSchema) {
      console.error('Loading Shopify schema from memory cache');
      if (!this.schema) { 
          this.schema = buildClientSchema(memoryCachedSchema);
      }
      this.rawSchema = memoryCachedSchema;
      return memoryCachedSchema;
    }

    // Keep the file cache logic
    if (!forceFetch && fs.existsSync(this.schemaCache)) {
      console.error('Loading Shopify schema from file cache:', this.schemaCache);
      try {
          const cacheData = fs.readFileSync(this.schemaCache, 'utf8');
          const schemaData = JSON.parse(cacheData) as IntrospectionQuery;
          
          if (!schemaData || !schemaData.__schema) {
              throw new Error('Invalid schema data found in file cache.');
          }

          this.schema = buildClientSchema(schemaData);
          this.rawSchema = schemaData;
          ShopifySchema.schemaCache.set(storeDomain, schemaData);
          return schemaData;
      } catch (err: any) {
          console.error(`Error reading or parsing schema cache file ${this.schemaCache}: ${err.message}. Fetching fresh schema.`);
          try {
            fs.unlinkSync(this.schemaCache);
          } catch (unlinkErr) {
            console.error(`Failed to delete corrupted cache file ${this.schemaCache}: ${unlinkErr}`);
          }
      }
    }

    // If no cache or forcing fetch, get from Shopify API
    console.error('Fetching Shopify schema via introspection...');
    
    const adminApiUrl = `https://${storeDomain}/admin/api/${this.shopify.config.apiVersion}/graphql.json`;
    
    const accessToken = process.env.SHOPIFY_API_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error('SHOPIFY_API_ACCESS_TOKEN environment variable is not set');
    }
    
    try { 
      const schemaJsonString = await introspectEndpoint(adminApiUrl, {
        'X-Shopify-Access-Token': accessToken
      });
      
      const schemaData = JSON.parse(schemaJsonString) as IntrospectionQuery;

      if (!schemaData || !schemaData.__schema) {
          throw new Error('Invalid schema data received from introspection endpoint.');
      }
      
      this.schema = buildClientSchema(schemaData);
      this.rawSchema = schemaData;
      
      try {
        fs.writeFileSync(this.schemaCache, JSON.stringify(this.rawSchema, null, 2));
        console.error('Shopify schema saved to file cache:', this.schemaCache);
      } catch (writeErr: any) {
          console.error(`Error writing schema to file cache ${this.schemaCache}: ${writeErr.message}`);
      }
      
      ShopifySchema.schemaCache.set(storeDomain, schemaData);
      
      return schemaData;
    } catch (error) {
      console.error('Error fetching or processing Shopify schema:', error);
      throw error;
    }
  }

  // Clear schema cache
  public static clearCache(): void {
    console.error("Clearing Shopify schema cache (memory and file)...");
    ShopifySchema.schemaCache.clear();
    const cacheFilePath = path.join(process.cwd(), 'shopify-schema-cache.json');
    if (fs.existsSync(cacheFilePath)) {
       try {
        fs.unlinkSync(cacheFilePath);
        console.error("Removed schema file cache:", cacheFilePath);
       } catch (err) {
           console.error(`Failed to remove schema file cache ${cacheFilePath}: ${err}`);
       }
    }
  }

  // Get fields of a specific type
  async getTypeFields(typeName: string): Promise<any[]> {
    if (!this.rawSchema) {
       await this.loadSchema(); 
    }
    if (!this.schema) {
      throw new Error('Schema could not be loaded or built.');
    }
    
    const type = this.schema.getType(typeName);
    
    if (!type) {
      const availableTypes = Object.keys(this.schema.getTypeMap() || {}).filter(t => !t.startsWith('__')).join(', ');
      throw new Error(`Type "${typeName}" not found in schema. Available types: ${availableTypes.substring(0, 500)}...`);
    }
    
    if (type instanceof GraphQLObjectType) {
      const fields = type.getFields();
      return Object.values(fields).map(field => ({
          name: field.name,
          description: field.description,
          type: field.type.toString(),
          args: field.args.map(arg => ({
              name: arg.name,
              description: arg.description,
              type: arg.type.toString(),
              defaultValue: arg.defaultValue,
          }))
      }));
    }
    
    return []; 
  }

  // Helper to check if a field exists on a type
  async fieldExists(typeName: string, fieldName: string): Promise<boolean> {
    try {
      const fields = await this.getTypeFields(typeName);
      return fields.some((field: any) => field.name === fieldName);
    } catch (error) {
      console.error(`Error checking field existence for ${typeName}.${fieldName}:`, error);
      return false;
    }
  }

  // Get a list of all available types
  async getTypes(): Promise<string[]> {
     if (!this.rawSchema) {
       await this.loadSchema();
     }
     if (!this.schema) {
       throw new Error('Schema could not be loaded or built.');
     }
    
    const typeMap = this.schema.getTypeMap();
    return Object.keys(typeMap).filter(name => !name.startsWith('__'));
  }

  // Helper to build a validated field list string for a query
  async buildQueryFields(typeName: string, requestedFields: string[]): Promise<string> {
    if (!this.rawSchema) {
        await this.loadSchema();
    }
     if (!this.schema) {
        throw new Error('Schema could not be loaded or built.');
    }

    const type = this.schema.getType(typeName);
    if (!type || !(type instanceof GraphQLObjectType)) {
      throw new Error(`Cannot build query fields for non-object type "${typeName}"`);
    }

    const availableFields = type.getFields();
    const validFields: string[] = [];
    const invalidFields: string[] = [];

    for (const fieldName of requestedFields) {
      const baseFieldName = fieldName.split('{')[0].trim(); 
      if (availableFields[baseFieldName]) {
        validFields.push(fieldName);
      } else {
        invalidFields.push(fieldName);
      }
    }

    if (invalidFields.length > 0) {
      console.warn(`Warning: Fields not directly validated on type "${typeName}": ${invalidFields.join(', ')}. They might be nested or invalid.`);
    }
    
    return validFields.join('\n          '); 
  }

  // Generate a complete GraphQL query string with variables and filters
  async generateQuery(
    queryName: string, 
    rootType: 'Query' | 'Mutation',
    rootField: string, 
    fieldsList: string[], 
    variables: Record<string, any> = {},
    args: Record<string, any> = {}
  ): Promise<{query: string, variables: Record<string, any>}> {

    if (!this.rawSchema) {
        await this.loadSchema();
    }
     if (!this.schema) {
        throw new Error('Schema could not be loaded or built.');
    }

    const rootSchemaType = rootType === 'Query' ? this.schema.getQueryType() : this.schema.getMutationType();
    if (!rootSchemaType) {
        throw new Error(`${rootType} type not found in the schema.`);
    }
    const rootFieldDefinition = rootSchemaType.getFields()[rootField];
     if (!rootFieldDefinition) {
         throw new Error(`Root field "${rootField}" not found on type "${rootType}".`);
     }

    const variableDefinitions = Object.entries(variables)
        .map(([name, value]) => `$${name}: ${this.determineGraphQLType(value)}!`)
        .join(', ');
        
    const argumentString = Object.keys(variables)
        .map(name => `${name}: $${name}`)
        .join(', ');

    let returnTypeName = rootFieldDefinition.type.toString();
    returnTypeName = returnTypeName.replace(/!/g, '');
    if (returnTypeName.startsWith('[') && returnTypeName.endsWith(']')) {
        returnTypeName = returnTypeName.slice(1, -1);
    }

    const fieldsString = await this.buildQueryFields(returnTypeName, fieldsList);

    const query = `
      ${rootType === 'Mutation' ? 'mutation' : 'query'} ${queryName}${variableDefinitions ? `(${variableDefinitions})` : ''} {
        ${rootField}${argumentString ? `(${argumentString})` : ''} {
          ${fieldsString}
        }
      }
    `;

    return { query, variables };
  }

  private determineGraphQLType(value: any): string {
      if (typeof value === 'string') return 'String';
      if (typeof value === 'number') {
          return Number.isInteger(value) ? 'Int' : 'Float';
      }
      if (typeof value === 'boolean') return 'Boolean';
      if (Array.isArray(value)) return 'JSON';
      if (typeof value === 'object' && value !== null) return 'JSON';
      return 'String';
  }
}

// Example usage:
// 
// const schema = new ShopifySchema(shopify);
// 
// // Check if a field exists
// const exists = await schema.fieldExists('Order', 'cancelledAt');
// console.log('Field exists:', exists);  // true
// 
// // Get all fields of Order type
// const orderFields = await schema.getTypeFields('Order');
// console.log('Order fields:', orderFields.map(f => f.name));
// 
// // Build a valid query with only existing fields
// const queryFields = await schema.buildQuery('Order', ['id', 'name', 'cancelledAt', 'nonExistentField']);
// // This would warn about nonExistentField and return only valid fields 