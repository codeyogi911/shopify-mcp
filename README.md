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

This server provides access to the following Shopify functionality through MCP tools:

### Product Tools
- `create_product`: Create a product structure with options in DRAFT status
- `browse_products`: Browse products with inventory information
- `update_variant_price`: Update price and/or compare-at price of a product variant

### Inventory Tools
- `list_inventory_items`: List inventory items with optional filtering by SKU
- `get_inventory_item`: Get detailed information about a specific inventory item by ID or SKU
- `update_inventory_quantity`: Update the available quantity of an inventory item at a location

### Order Tools
- `browse_orders`: Browse Shopify orders with filtering options (status, date range, customer, etc.)

### Customer Tools
- `browse_customers`: Browse customers and their spend with filtering and sorting options

### Media Tools
- `upload_image_from_url`: Upload an image from a public URL to Shopify CDN Files

### Abandonment Tools
- `get_abandonment`: Retrieve details of cart/checkout abandonment by ID

### GraphQL Tools
- `query_shopify`: Execute custom GraphQL queries or mutations against the Shopify Admin API
- `introspect_admin_schema`: Introspect and explore the Shopify Admin API GraphQL schema

## License

MIT 