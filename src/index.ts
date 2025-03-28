import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { createAdminApiClient } from '@shopify/admin-api-client';
import { registerProductTools } from './tools/shopify-products.js';
import { registerOrdersTools } from './tools/shopify-orders.js';
import { registerExplorerTools } from './tools/shopify-explorer.js';
import { registerQueryTool } from './tools/shopify-query.js';
import { registerResources } from './resources.js';
import { ShopifySchema } from './tools/shopify-schema.js';
import { ShopifyServer } from './types.js';
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

// Create a simple MCP server for Shopify
const server = new McpServer({
  name: 'Simple Shopify Server',
  version: '1.0.0',
  description: 'A simplified MCP server for Shopify'
}) as ShopifyServer;

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

// Initialize the schema and attach it to the server
server.shopifySchema = new ShopifySchema((server as any).shopify);

// Register all resources
registerResources(server, shopifyStoreName || '', shopifyAccessToken || '', apiVersion);

// Register all product and inventory related tools from the separate file
registerProductTools(server);

// Register orders related tools from the separate file
registerOrdersTools(server);

// Register explorer tools from the separate file
registerExplorerTools(server);

// Register the GraphQL query tool
registerQueryTool(server);

// Simple entry point
async function main() {
  try {
    console.error("Starting Simple Shopify Server...");
    
    const transport = new StdioServerTransport();
    
    await server.connect(transport);
    
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
