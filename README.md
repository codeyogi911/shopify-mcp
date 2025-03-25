# Shopify MCP Server for Claude Desktop

This is a simple Model Context Protocol (MCP) server that connects your Shopify store data to Claude Desktop, allowing Claude to access your store information.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file with your Shopify credentials:
   ```
   SHOPIFY_STORE_NAME=your-store-name
   SHOPIFY_API_ACCESS_TOKEN=your-access-token
   ```

3. Build the TypeScript code:
   ```
   npm run build
   ```

4. Run the MCP server:
   ```
   npm start
   ```

5. In Claude Desktop, set the MCP server to point to this server. You should now be able to access your Shopify data.

## Features

- Browse products with `shopify://products`
- View product details with `shopify://product/{id}`  
- Search for products using the `search_shopify` tool

## License

MIT 