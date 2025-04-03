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
- `create_product`: This tool creates a product structure with options (e.g., Color, Size) in DRAFT status. It handles product title, description, vendor, type, tags, and options configuration, but does not create variants with prices. Use this as the first step in product creation.

- `browse_products`: This tool retrieves a list of products with optional inventory information. It supports pagination and provides key product details like title, description, images, variants, and inventory levels. When provided with a specific product_id, it returns detailed information for that single product.

- `update_variant_price`: This tool updates the price and/or compare-at price of a specific product variant. It can set a new regular price, add/update a compare-at price, or remove a compare-at price by passing null or an empty string.

### Inventory Tools
- `list_inventory_items`: This tool retrieves a list of inventory items with optional filtering by SKU. It supports pagination and provides inventory details like available quantities, costs, and locations where items are stocked.

- `get_inventory_item`: This tool retrieves detailed information about a specific inventory item by ID or SKU. It returns comprehensive inventory data including tracked status, available quantities across all locations, and associated variant information.

- `update_inventory_quantity`: This tool updates the available quantity of an inventory item at a specific location. It accepts inventory item ID, location ID, and the new available quantity, returning the updated inventory level after adjustment.

### Order Tools
- `browse_orders`: This tool retrieves Shopify orders with powerful filtering options. It supports filtering by status, date range, customer email, financial status, fulfillment status, and allows searching by order number or customer details. When provided with a specific order_id, it returns detailed information for that single order.

### Customer Tools
- `browse_customers`: This tool retrieves customer information with spending data and advanced filtering options. It supports sorting by multiple fields, filtering by minimum/maximum spend, and returns detailed customer profiles. When provided with a specific customer_id, it returns comprehensive information for that single customer.

### Media Tools
- `upload_image_from_url`: This tool uploads an image from a public URL to the Shopify CDN Files section. It handles the transfer of image data to Shopify's servers, allowing you to specify alt text and optional filename for the uploaded image.

### Abandonment Tools
- `get_abandonment`: This tool retrieves detailed information about cart or checkout abandonments by ID. It returns data about abandoned carts including items, prices, customer information (if available), and abandonment timing. You can customize which fields are returned in the response.

### GraphQL Tools
- `query_shopify`: This tool executes custom GraphQL queries or mutations against the Shopify Admin API. It allows for complete flexibility to access any Shopify Admin API endpoint not covered by the specialized tools, with options to pass variables and enable mutation operations.

- `introspect_admin_schema`: This tool introspects and returns the portion of the Shopify Admin API GraphQL schema relevant to the user prompt. Only use this for the Shopify Admin API, and not any other APIs like the Shopify Storefront API or the Shopify Functions API. It accepts search terms to filter schema elements by name and provides options to focus on specific sections like types, queries, or mutations.

## License

MIT 