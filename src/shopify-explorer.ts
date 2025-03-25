import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Session } from '@shopify/shopify-api';
import { ShopifySchema } from './shopify-schema.js';
import { introspectEndpoint } from './helpers/introspection.js';

// Type definitions to match the schema structure
interface SchemaType {
  kind: string;
  name: string;
  fields?: Record<string, SchemaField>;
}

interface SchemaField {
  name: string;
  type: string;
  description?: string;
  isDeprecated?: boolean;
  deprecationReason?: string;
}

type ActionHandlerParams = {
  schema: ShopifySchema;
  params: Record<string, any>;
};

// Define a custom interface for our server to access shopify properties
interface ExtendedServer {
  shopify: any;
  shopifySchema: any;
  [key: string]: any;
}

// Register explorer tools for the Shopify GraphQL schema
export function registerExplorerTools(server: any, session: Session) {
  // Add an introspect-schema tool that returns the full schema
  server.tool(
    'introspect_schema',
    {
      format: z.enum(['sdl', 'json']).optional().default('sdl')
        .describe('Format to return the schema in: "sdl" for GraphQL SDL format, "json" for raw introspection JSON')
    },
    async ({ format = 'sdl' }: { format?: 'sdl' | 'json' }) => {
      try {
        // Get the API access details from server
        const shopifyStoreName = process.env.SHOPIFY_STORE_NAME;
        const shopifyAccessToken = process.env.SHOPIFY_API_ACCESS_TOKEN || '';
        
        if (!shopifyStoreName) {
          throw new Error('SHOPIFY_STORE_NAME environment variable is not set');
        }
        
        const serverWithShopify = server as ExtendedServer;
        const storeDomain = `${shopifyStoreName}.myshopify.com`;
        const adminApiUrl = `https://${storeDomain}/admin/api/${serverWithShopify.shopify.config.apiVersion}/graphql.json`;
        
        // Fetch the schema
        const schema = await introspectEndpoint(adminApiUrl, {
          'X-Shopify-Access-Token': shopifyAccessToken
        });
        
        // Return in requested format
        if (format === 'json') {
          return {
            content: [{ 
              type: 'text', 
              text: `# Shopify GraphQL Schema (JSON)\n\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\`` 
            }]
          };
        } else {
          return {
            content: [{ 
              type: 'text', 
              text: `# Shopify GraphQL Schema (SDL)\n\n\`\`\`graphql\n${schema}\n\`\`\`` 
            }]
          };
        }
      } catch (error: any) {
        console.error('Error in introspect_schema tool:', error);
        return {
          content: [{ 
            type: 'text', 
            text: `# Error Introspecting Schema\n\n${error.message || String(error)}` 
          }]
        };
      }
    }
  );
  
  // Add an explore_schema tool for exploring specific parts of the schema
  server.tool(
    'explore_schema',
    {
      action: z.enum(['list_types', 'get_type_fields', 'check_field']),
      type_name: z.string().optional().describe('Required for get_type_fields and check_field actions'),
      field_name: z.string().optional().describe('Required for check_field action')
    },
    async ({ action, type_name, field_name }: { 
      action: 'list_types' | 'get_type_fields' | 'check_field',
      type_name?: string,
      field_name?: string
    }) => {
      try {
        // Access the schema utility from the server
        const serverWithShopify = server as ExtendedServer;
        const shopifySchema = serverWithShopify.shopifySchema;
        
        // Make sure the schema is loaded
        await shopifySchema.loadSchema();
        
        switch (action) {
          case 'list_types': {
            const types = await shopifySchema.getTypes();
            
            // Group types by category
            const objectTypes = types.filter((t: string) => !t.includes('Connection') && !t.includes('Edge') && !t.startsWith('__')).sort();
            const connectionTypes = types.filter((t: string) => t.includes('Connection')).sort();
            const edgeTypes = types.filter((t: string) => t.includes('Edge')).sort();
            const enumTypes = types.filter((t: string) => t.includes('Enum')).sort();
            const inputTypes = types.filter((t: string) => t.includes('Input')).sort();
            
            let responseText = `# Shopify GraphQL Types\n\n`;
            
            if (objectTypes.length > 0) {
              responseText += `## Object Types\n\n${objectTypes.join('\n')}\n\n`;
            }
            
            if (connectionTypes.length > 0) {
              responseText += `## Connection Types\n\n${connectionTypes.join('\n')}\n\n`;
            }
            
            if (edgeTypes.length > 0) {
              responseText += `## Edge Types\n\n${edgeTypes.join('\n')}\n\n`;
            }
            
            if (enumTypes.length > 0) {
              responseText += `## Enum Types\n\n${enumTypes.join('\n')}\n\n`;
            }
            
            if (inputTypes.length > 0) {
              responseText += `## Input Types\n\n${inputTypes.join('\n')}\n\n`;
            }
            
            return {
              content: [{ type: 'text', text: responseText }]
            };
          }
          
          case 'get_type_fields': {
            if (!type_name) {
              return {
                content: [{ 
                  type: 'text', 
                  text: `# Error\n\ntype_name parameter is required for get_type_fields action` 
                }]
              };
            }
            
            const fields = await shopifySchema.getTypeFields(type_name);
            
            let responseText = `# Fields for ${type_name}\n\n`;
            
            if (fields.length === 0) {
              responseText += `No fields found for type ${type_name}`;
            } else {
              fields.forEach((field: any) => {
                responseText += `## ${field.name}\n\n`;
                responseText += `Type: \`${field.type.toString()}\`\n\n`;
                
                if (field.description) {
                  responseText += `Description: ${field.description}\n\n`;
                }
                
                if (field.args && field.args.length > 0) {
                  responseText += `Arguments:\n\n`;
                  
                  field.args.forEach((arg: any) => {
                    responseText += `- \`${arg.name}: ${arg.type.toString()}\``;
                    
                    if (arg.description) {
                      responseText += ` - ${arg.description}`;
                    }
                    
                    responseText += `\n`;
                  });
                  
                  responseText += `\n`;
                }
                
                responseText += `---\n\n`;
              });
            }
            
            return {
              content: [{ type: 'text', text: responseText }]
            };
          }
          
          case 'check_field': {
            if (!type_name) {
              return {
                content: [{ 
                  type: 'text', 
                  text: `# Error\n\ntype_name parameter is required for check_field action` 
                }]
              };
            }
            
            if (!field_name) {
              return {
                content: [{ 
                  type: 'text', 
                  text: `# Error\n\nfield_name parameter is required for check_field action` 
                }]
              };
            }
            
            const exists = await shopifySchema.fieldExists(type_name, field_name);
            
            if (exists) {
              // Get the field details
              const fields = await shopifySchema.getTypeFields(type_name);
              const field = fields.find((f: any) => f.name === field_name);
              
              let responseText = `# Field Check Result\n\n`;
              responseText += `✅ The field \`${field_name}\` exists on type \`${type_name}\`.\n\n`;
              
              if (field) {
                responseText += `## Details\n\n`;
                responseText += `Type: \`${field.type.toString()}\`\n\n`;
                
                if (field.description) {
                  responseText += `Description: ${field.description}\n\n`;
                }
                
                if (field.args && field.args.length > 0) {
                  responseText += `Arguments:\n\n`;
                  
                  field.args.forEach((arg: any) => {
                    responseText += `- \`${arg.name}: ${arg.type.toString()}\``;
                    
                    if (arg.description) {
                      responseText += ` - ${arg.description}`;
                    }
                    
                    responseText += `\n`;
                  });
                }
              }
              
              return {
                content: [{ type: 'text', text: responseText }]
              };
            } else {
              // Field doesn't exist, try to find similar fields as suggestions
              const fields = await shopifySchema.getTypeFields(type_name);
              const fieldNames = fields.map((f: any) => f.name);
              
              // Simple similarity check (starts with same letter, has similar length)
              const similarFields = fieldNames.filter((name: string) => {
                return name.charAt(0).toLowerCase() === field_name.charAt(0).toLowerCase() ||
                      Math.abs(name.length - field_name.length) <= 3 ||
                      name.toLowerCase().includes(field_name.toLowerCase()) ||
                      field_name.toLowerCase().includes(name.toLowerCase());
              });
              
              let responseText = `# Field Check Result\n\n`;
              responseText += `❌ The field \`${field_name}\` does not exist on type \`${type_name}\`.\n\n`;
              
              if (similarFields.length > 0) {
                responseText += `## Suggestions\n\n`;
                responseText += `Did you mean one of these fields?\n\n`;
                
                similarFields.forEach((name: string) => {
                  responseText += `- \`${name}\`\n`;
                });
              } else {
                responseText += `## Available Fields\n\n`;
                responseText += fieldNames.map((name: string) => `- \`${name}\``).join('\n');
              }
              
              return {
                content: [{ type: 'text', text: responseText }]
              };
            }
          }
          
          default:
            return {
              content: [{ 
                type: 'text', 
                text: `# Error\n\nInvalid action: ${action}. Must be one of: list_types, get_type_fields, check_field` 
              }]
            };
        }
      } catch (error: any) {
        console.error('Error in explore_schema tool:', error);
        return {
          content: [{ 
            type: 'text', 
            text: `# Error Exploring Schema\n\n${error.message || String(error)}` 
          }]
        };
      }
    }
  );
}

async function listTypes({ schema }: ActionHandlerParams): Promise<any> {
  const types = await schema.getTypes() as unknown as SchemaType[];
  const objectTypes = types.filter(t => 
    typeof t === 'object' && t.kind === 'OBJECT' && !t.name.startsWith('__')
  );
  
  const queryType = types.find(t => 
    typeof t === 'object' && t.name === 'QueryRoot'
  ) as SchemaType | undefined;
  
  const queryFields = queryType && queryType.fields 
    ? Object.keys(queryType.fields).sort() 
    : [];
  
  const inputTypes = types.filter(t => 
    typeof t === 'object' && t.kind === 'INPUT_OBJECT' && !t.name.startsWith('__')
  );
  
  return {
    object_types: objectTypes.slice(0, 50).map(t => t.name),
    query_fields: queryFields.slice(0, 30),
    input_types: inputTypes.slice(0, 20).map(t => t.name),
    total_types: types.length,
    total_object_types: objectTypes.length,
    total_input_types: inputTypes.length
  };
}

async function getTypeFields({ schema, params }: ActionHandlerParams): Promise<any> {
  const typeName = params.type_name;
  const includeDeprecated = params.include_deprecated || false;
  
  if (!typeName) {
    return { error: "type_name is required" };
  }
  
  const fields = await schema.getTypeFields(typeName);
  
  if (!fields) {
    return { error: `Type '${typeName}' not found` };
  }
  
  const fieldList = Object.entries(fields)
    .filter(([_, field]) => includeDeprecated || !field.isDeprecated)
    .map(([name, field]) => ({
      name,
      type: field.type,
      description: field.description || '',
      deprecated: field.isDeprecated ? field.deprecationReason : null
    }));
  
  return {
    type_name: typeName,
    fields: fieldList,
    count: fieldList.length
  };
}

async function checkField({ schema, params }: ActionHandlerParams): Promise<any> {
  const typeName = params.type_name;
  const fieldName = params.field_name;
  
  if (!typeName) {
    return { error: "type_name is required" };
  }
  
  if (!fieldName) {
    return { error: "field_name is required" };
  }
  
  const exists = await schema.fieldExists(typeName, fieldName);
  
  if (exists) {
    const fields = await schema.getTypeFields(typeName);
    const field = fields[fieldName];
    
    return {
      exists: true,
      field_name: fieldName,
      type_name: typeName,
      field_type: field.type,
      description: field.description || ''
    };
  } else {
    // Try to find similar field names to help with typos
    const fields = await schema.getTypeFields(typeName);
    if (!fields) {
      return { 
        exists: false,
        error: `Type '${typeName}' not found` 
      };
    }
    
    const fieldNames = Object.keys(fields);
    const similarFields = fieldNames
      .map(name => ({
        name,
        distance: levenshteinDistance(name.toLowerCase(), fieldName.toLowerCase())
      }))
      .filter(f => f.distance <= 3)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
      .map(f => f.name);
    
    // Check for common spelling differences (US vs UK/CA)
    const commonReplacements: [string, string][] = [
      ['color', 'colour'],
      ['canceled', 'cancelled'],
      ['center', 'centre'],
      ['customize', 'customise'],
      ['favorite', 'favourite'],
      ['fulfill', 'fulfil'],
      ['program', 'programme'],
      ['license', 'licence']
    ];
    
    let suggestion = '';
    for (const [us, uk] of commonReplacements) {
      if (fieldName.includes(us) && fieldNames.includes(fieldName.replace(us, uk))) {
        suggestion = fieldName.replace(us, uk);
        break;
      } else if (fieldName.includes(uk) && fieldNames.includes(fieldName.replace(uk, us))) {
        suggestion = fieldName.replace(uk, us);
        break;
      }
    }
    
    return {
      exists: false,
      field_name: fieldName,
      type_name: typeName,
      similar_fields: similarFields,
      suggestion: suggestion || null
    };
  }
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a.charAt(j - 1) === b.charAt(i - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
} 