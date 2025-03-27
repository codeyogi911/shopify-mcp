import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { introspectEndpoint } from './helpers/introspection.js';

export function registerResources(server: McpServer, shopifyStoreName: string, shopifyAccessToken: string, apiVersion: string) {
  // Define root resource
  server.resource('root', 'shopify://', async (uri) => {
    console.error('Root resource handler called');
    
    return {
      contents: [{
        uri: uri.href,
        text: `# Simple Shopify Server\n\nThis is a simplified version of the Shopify server.\n\n## Available Tools\n\n### 1. Browse Products\nUse the "Browse Products" tool to view your products and inventory.\n\nParameters:\n- limit: Number of products to retrieve (default: 10)\n- include_inventory: Set to true to include inventory details\n- product_id: View a specific product by ID\n\n### 2. Browse Orders\nUse the "Browse Orders" tool to view and search your orders.\n\nParameters:\n- limit: Number of orders to retrieve (default: 10)\n- status: Filter by order status (any, open, closed, cancelled)\n- order_id: View a specific order by ID\n- customer_email: Filter orders by customer email\n- created_at_min: Minimum creation date in ISO format (e.g., 2023-01-01)\n- created_at_max: Maximum creation date in ISO format (e.g., 2023-12-31)`
      }]
    };
  });

  // Add GraphQL schema resource
  server.resource('graphql-schema', 'shopify://graphql-schema', async (uri) => {
    console.error('GraphQL schema resource handler called');
    
    try {
      const storeDomain = `${shopifyStoreName}.myshopify.com`;
      const adminApiUrl = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;
      
      // Get the schema by introspection
      const schema = await introspectEndpoint(adminApiUrl, {
        'X-Shopify-Access-Token': shopifyAccessToken
      });
      
      return {
        contents: [{
          uri: uri.href,
          text: `# Shopify GraphQL Schema

\`\`\`graphql
${schema}
\`\`\`
`
        }]
      };
    } catch (error) {
      console.error('Error generating GraphQL schema resource:', error);
      return {
        contents: [{
          uri: uri.href,
          text: `# Error Loading GraphQL Schema

There was an error loading the GraphQL schema: ${(error as Error).message}

Please try again later or contact the administrator.`
        }]
      };
    }
  });
} 