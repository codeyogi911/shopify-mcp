import fs from 'fs';
import path from 'path';
import { 
  buildClientSchema, 
  getIntrospectionQuery, 
  GraphQLSchema, 
  GraphQLObjectType,
  printSchema
} from 'graphql';

// Class to handle the Shopify GraphQL schema
export class ShopifySchema {
  private schema: GraphQLSchema | null = null;
  private rawSchema: any = null;
  private schemaCache: string;
  private shopify: any;

  constructor(shopify: any) {
    this.shopify = shopify;
    this.schemaCache = path.join(process.cwd(), 'shopify-schema-cache.json');
  }

  // Load the schema from cache or fetch it from Shopify
  async loadSchema(forceFetch = false): Promise<any> {
    if (this.schema && !forceFetch) {
      return this.rawSchema;
    }

    try {
      // Try to load from cache first if not forcing a fetch
      if (!forceFetch && fs.existsSync(this.schemaCache)) {
        console.error('Loading Shopify schema from cache');
        const cacheData = fs.readFileSync(this.schemaCache, 'utf8');
        const schemaData = JSON.parse(cacheData);
        this.schema = buildClientSchema(schemaData);
        this.rawSchema = schemaData;
        return this.rawSchema;
      }

      // If no cache or forcing fetch, get from Shopify API
      console.error('Fetching Shopify schema via introspection');
      
      const storeDomain = this.shopify.config.hostName;
      if (!storeDomain) {
        throw new Error('Shopify host name is not defined');
      }
      
      const adminApiUrl = `https://${storeDomain}/admin/api/${this.shopify.config.apiVersion}/graphql.json`;
      
      // Execute the introspection query using our config
      const accessToken = process.env.SHOPIFY_API_ACCESS_TOKEN;
      if (!accessToken) {
        throw new Error('SHOPIFY_API_ACCESS_TOKEN environment variable is not set');
      }
      
      // Use introspection helper to fetch the schema
      const introspectionResult = await fetch(adminApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({ query: getIntrospectionQuery() })
      }).then(res => res.json());
      
      // Build a schema from the introspection data
      this.rawSchema = introspectionResult.data;
      this.schema = buildClientSchema(this.rawSchema);
      
      // Save to cache
      fs.writeFileSync(this.schemaCache, JSON.stringify(this.rawSchema, null, 2));
      
      return this.rawSchema;
    } catch (error) {
      console.error('Error loading schema:', error);
      throw error;
    }
  }

  // Get fields of a specific type
  async getTypeFields(typeName: string): Promise<any[]> {
    await this.loadSchema();
    
    if (!this.schema) {
      throw new Error('Schema not loaded');
    }
    
    const type = this.schema.getType(typeName);
    
    if (!type) {
      throw new Error(`Type ${typeName} not found in schema`);
    }
    
    // Check if the type has fields (i.e., it's an object type)
    if (type instanceof GraphQLObjectType) {
      const fields = type.getFields();
      return Object.values(fields);
    }
    
    return [];
  }

  // Helper to check if a field exists on a type
  async fieldExists(typeName: string, fieldName: string): Promise<boolean> {
    try {
      const fields = await this.getTypeFields(typeName);
      return fields.some((field: any) => field.name === fieldName);
    } catch (error) {
      console.error(`Error checking if field ${fieldName} exists on ${typeName}:`, error);
      return false;
    }
  }

  // Get a list of all available types
  async getTypes(): Promise<string[]> {
    await this.loadSchema();
    
    if (!this.schema) {
      throw new Error('Schema not loaded');
    }
    
    const typeMap = this.schema.getTypeMap();
    
    return Object.keys(typeMap)
      .filter(name => !name.startsWith('__'));
  }

  // Helper to build a query with validated fields
  async buildQuery(typeName: string, fields: string[]): Promise<string> {
    const validFields = [];
    const invalidFields = [];
    
    const typeFields = await this.getTypeFields(typeName);
    const fieldMap = new Map(typeFields.map((f: any) => [f.name, f]));
    
    for (const field of fields) {
      // For nested fields like "customer { email }", we need to parse and validate separately
      if (field.includes('{')) {
        // Simple validation - we'll trust these for now since they're coming from our code
        validFields.push(field);
      } else {
        if (fieldMap.has(field)) {
          validFields.push(field);
        } else {
          invalidFields.push(field);
        }
      }
    }
    
    if (invalidFields.length > 0) {
      console.warn(`Warning: These fields don't exist on ${typeName}: ${invalidFields.join(', ')}`);
    }
    
    return validFields.join('\n');
  }

  // Generate a complete GraphQL query string with variables
  async generateQuery(
    queryName: string, 
    rootType: string, 
    rootField: string, 
    fieldsList: string[], 
    variables: Record<string, string> = {},
    filters: Record<string, any> = {}
  ): Promise<{query: string, variableDefinitions: Record<string, any>}> {
    await this.loadSchema();
    
    // Validate all fields against the schema
    const validatedFields = await this.buildQuery(rootType, fieldsList);
    
    // Build variable definitions string
    const varDefs = Object.entries(variables)
      .map(([name, type]) => `$${name}: ${type}`)
      .join(', ');
    
    // Build filter arguments string
    const args = Object.entries(filters)
      .map(([name, value]) => {
        if (typeof value === 'string' && value.startsWith('$')) {
          // Reference to a variable
          return `${name}: ${value}`;
        }
        return `${name}: ${JSON.stringify(value)}`;
      })
      .join(', ');
    
    // Check if this is likely a connection type (if it ends with 'Connection')
    const isConnectionType = rootType.endsWith('Connection');
    
    // Create the complete query string
    let queryFields = validatedFields;
    
    // For connection types, make sure fields are properly nested under edges.node
    if (isConnectionType && !validatedFields.includes('edges')) {
      queryFields = `edges {\n  node {\n    ${validatedFields.split('\n').join('\n    ')}\n  }\n}`;
    }
    
    const query = `
      query ${queryName}${varDefs ? `(${varDefs})` : ''} {
        ${rootField}${args ? `(${args})` : ''} {
          ${queryFields}
        }
      }
    `;
    
    return {
      query,
      variableDefinitions: variables
    };
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