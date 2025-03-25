import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import '@shopify/shopify-api/adapters/node';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import { registerProductTools } from './shopify-products.js';
import { registerOrdersTools } from './shopify-orders.js';
import { ShopifySchema } from './shopify-schema.js';
import { registerExplorerTools } from './shopify-explorer.js';
import { registerQueryTool } from './shopify-query.js';
import { introspectEndpoint } from './helpers/introspection.js';
import { printSchema } from 'graphql';

dotenv.config();

// Validate environment variables
const shopifyStoreName = process.env.SHOPIFY_STORE_NAME;
const shopifyAccessToken = process.env.SHOPIFY_API_ACCESS_TOKEN;

if (!shopifyStoreName || !shopifyAccessToken) {
  console.error('Missing required environment variables:');
  console.error(`- SHOPIFY_STORE_NAME: ${shopifyStoreName ? 'Set' : 'Not set'}`);
  console.error(`- SHOPIFY_API_ACCESS_TOKEN: ${shopifyAccessToken ? 'Set' : 'Not set'}`);
}

// Initialize Shopify API client
const shopify = shopifyApi({
  apiKey: 'not-used-with-admin-api-access-token',
  apiSecretKey: 'not-used-with-admin-api-access-token',
  scopes: ['read_products', 'read_orders', 'read_customers'],
  hostName: `${shopifyStoreName}.myshopify.com`,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
  logger: {
    log: async (severity, message) => {
      console.error(`[Shopify API] [${severity}] ${message}`);
    }
  }
});

// Create a custom offline session
const session = shopify.session.customAppSession(`${shopifyStoreName}.myshopify.com`);
session.accessToken = shopifyAccessToken;

// Create a simple MCP server for Shopify
const server = new McpServer({
  name: 'Simple Shopify Server',
  version: '1.0.0',
  description: 'A simplified MCP server for Shopify'
});

// Attach the Shopify client to the server object so it's accessible in the product tools
(server as any).shopify = shopify;

// Initialize the schema utility and attach it to the server
const shopifySchema = new ShopifySchema(shopify, session);
(server as any).shopifySchema = shopifySchema;

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
registerProductTools(server, session);

// Register orders related tools from the separate file
registerOrdersTools(server, session);

// Register explorer tools from the separate file
registerExplorerTools(server, session);

// Register the GraphQL query tool
registerQueryTool(server, session);

// Add a simple resource for browsing the GraphQL schema
server.resource('graphql-schema', 'shopify://graphql-schema', async (uri) => {
  console.error('GraphQL schema resource handler called');
  
  try {
    const storeDomain = `${shopifyStoreName}.myshopify.com`;
    const adminApiUrl = `https://${storeDomain}/admin/api/${LATEST_API_VERSION}/graphql.json`;
    
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
