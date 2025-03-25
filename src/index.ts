import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { createAdminApiClient } from '@shopify/admin-api-client';
import { registerProductTools } from './shopify-products.js';
import { registerOrdersTools } from './shopify-orders.js';
import { registerExplorerTools } from './shopify-explorer.js';
import { registerQueryTool } from './shopify-query.js';
import { introspectEndpoint } from './helpers/introspection.js';

// Load environment variables
dotenv.config();

// Validate environment variables
const shopifyStoreName = process.env.SHOPIFY_STORE_NAME;
const shopifyAccessToken = process.env.SHOPIFY_API_ACCESS_TOKEN;
const apiVersion = '2025-01'; // Use a specific API version

if (!shopifyStoreName || !shopifyAccessToken) {
  console.error('Missing required environment variables:');
  console.error(`- SHOPIFY_STORE_NAME: ${shopifyStoreName ? 'Set' : 'Not set'}`);
  console.error(`- SHOPIFY_API_ACCESS_TOKEN: ${shopifyAccessToken ? 'Set' : 'Not set'}`);
}

// Initialize the admin API client
const adminClient = createAdminApiClient({
  storeDomain: `${shopifyStoreName}.myshopify.com`,
  apiVersion,
  accessToken: shopifyAccessToken || '',
});

// Create a simple MCP server for Shopify
const server = new McpServer({
  name: 'Simple Shopify Server',
  version: '1.0.0',
  description: 'A simplified MCP server for Shopify'
});

// Attach the admin client to the server object so it's accessible in the tools
(server as any).shopify = {
  clients: {
    Graphql: () => ({
      request: async (query: string, options: any) => {
        try {
          // Simple pass-through to the Shopify API
          console.error('GraphQL request variables:', options?.variables || {});
          const resp = await adminClient.request(query, {variables: options?.variables || {}});
          console.error('GraphQL response:', JSON.stringify(resp, null, 2));
          return resp;
        } catch (error) {
          console.error('GraphQL request error:', error);
          throw error; // Let the caller handle errors
        }
      }
    })
  },
  config: {
    apiVersion,
    hostName: `${shopifyStoreName}.myshopify.com`
  }
};

// Define just one simple resource - the home page
server.resource('root', 'shopify://', async (uri) => {
  console.error('Root resource handler called');
  
  return {
    contents: [{
      uri: uri.href,
      text: `# Simple Shopify Server\n\nThis is a simplified version of the Shopify server.\n\n## Available Tools\n\n### 1. Browse Products\nUse the "Browse Products" tool to view your products and inventory.\n\nParameters:\n- limit: Number of products to retrieve (default: 10)\n- include_inventory: Set to true to include inventory details\n- product_id: View a specific product by ID\n\n### 2. Browse Orders\nUse the "Browse Orders" tool to view and search your orders.\n\nParameters:\n- limit: Number of orders to retrieve (default: 10)\n- status: Filter by order status (any, open, closed, cancelled)\n- order_id: View a specific order by ID\n- customer_email: Filter orders by customer email\n- created_at_min: Minimum creation date in ISO format (e.g., 2023-01-01)\n- created_at_max: Maximum creation date in ISO format (e.g., 2023-12-31)`
    }]
  };
});

// Register all product and inventory related tools from the separate file
registerProductTools(server);

// Register orders related tools from the separate file
registerOrdersTools(server);

// Register explorer tools from the separate file
registerExplorerTools(server);

// Register the GraphQL query tool
registerQueryTool(server);

// Add a simple resource for browsing the GraphQL schema
server.resource('graphql-schema', 'shopify://graphql-schema', async (uri) => {
  console.error('GraphQL schema resource handler called');
  
  try {
    const storeDomain = `${shopifyStoreName}.myshopify.com`;
    const adminApiUrl = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;
    
    // Get the schema by introspection
    const schema = await introspectEndpoint(adminApiUrl, {
      'X-Shopify-Access-Token': shopifyAccessToken || ''
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

// Simple entry point
async function main() {
  try {
    console.error("Starting Simple Shopify Server...");
    
    const transport = new StdioServerTransport();
    console.error("Created transport");
    
    await server.connect(transport);
    console.error("Connected to transport");
    
    console.error("Server ready");
    
    // Add handlers for uncaught errors
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
    });
    
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
    });
    
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
