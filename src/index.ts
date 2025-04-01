import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// import { HttpServerTransport } from '@modelcontextprotocol/sdk/server/http.js'; // Removed HTTP transport import
import dotenv from 'dotenv';
import { createAdminApiClient } from '@shopify/admin-api-client';
import { registerProductTools } from './tools/shopify-products.js';
import { registerInventoryTools } from './tools/shopify-inventory.js';
import { registerOrdersTools } from './tools/shopify-orders.js';
import { registerExplorerTools } from './tools/shopify-explorer.js';
import { registerQueryTool } from './tools/shopify-query.js';
import { ShopifySchema } from './tools/shopify-schema.js';
import { registerCustomerTools } from './shopify-customers.js';
import { registerMediaTools } from './tools/shopify-media.js';
import { registerStoreInfoResource } from './resources/store-info.js';
// Add fetch polyfill for Node.js
import fetch from 'node-fetch';
// Make fetch global
if (!globalThis.fetch) {
  globalThis.fetch = fetch as any;
}

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

// Define the ShopifyServer type
interface ShopifyServer extends McpServer {
  shopify: any;
  shopifySchema: any;
}

// Create a simple MCP server for Shopify
const server = new McpServer({
  name: 'Simple Shopify Server',
  version: '1.0.0',
  description: 'A simplified MCP server for Shopify'
}) as ShopifyServer;

// Attach the admin client to the server object so it's accessible in the tools
server.shopify = {
  clients: {
    Graphql: () => ({
      request: async (query: string, options: any) => {
        try {
          // Simple pass-through to the Shopify API
          // console.error('GraphQL request variables:', options?.variables || {});
          const resp = await adminClient.request(query, {variables: options?.variables || {}});
          if (resp.errors) {
            throw new Error(JSON.stringify(resp.errors, null, 2));
          }
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

// Initialize the schema and attach it to the server
(server as any).shopifySchema = ShopifySchema.getInstance((server as any).shopify);

// Register all resources
registerStoreInfoResource(server);

// Register all product and inventory related tools from the separate file
registerProductTools(server);

// Register inventory tools
registerInventoryTools(server);

// Register orders related tools from the separate file
registerOrdersTools(server);

// Register explorer tools from the separate file
registerExplorerTools(server);

// Register the GraphQL query tool
registerQueryTool(server);

// Register customer tools from the separate file
registerCustomerTools(server);

// Register media tools from the separate file
registerMediaTools(server);

// Simple entry point
async function main() {
  try {
    console.error("Starting Simple Shopify Server...");
    
    // Setup Stdio Transport (for primary communication)
    const stdioTransport = new StdioServerTransport();
    (server as McpServer).connect(stdioTransport); 
    console.error("Stdio transport connected.");

    // Setup HTTP Transport (for testing/alternative access) - DISABLED
    // const httpPort = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : 3000;
    // const httpTransport = new HttpServerTransport({
    //   port: httpPort,
    //   host: 'localhost' 
    // });
    // await (server as McpServer).connect(httpTransport);
    // console.error(`HTTP transport listening on http://localhost:${httpPort}`);
    
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
