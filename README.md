# Shopify MCP Server

A Model Context Protocol (MCP) server that connects your Shopify store data to AI assistants like Claude. This server allows AI assistants to directly browse your products, inventory details, and orders from your Shopify store.

## Features

- **Browse Products**: Retrieve and view product listings from your Shopify store
- **View Product Details**: Get comprehensive information about specific products
- **Inventory Management**: Check inventory levels across locations for products and variants
- **Order Management**: Browse and search orders with various filters
- **Combined Tool Interface**: Each feature uses a single versatile tool with flexible parameters

## Prerequisites

- Node.js (v16 or higher)
- A Shopify store
- Admin API access token with read permissions for products, inventory, etc.

## Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/shopify-mcp.git
   cd shopify-mcp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure your environment**:
   Create a `.env` file in the project root with:
   ```
   SHOPIFY_STORE_NAME=your-store-name
   SHOPIFY_API_ACCESS_TOKEN=your-admin-api-access-token
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

5. **Run the server**:
   ```bash
   npm start
   ```

## Using the MCP Server with Claude

1. Open Claude Desktop
2. Go to Settings > Developer > MCP Servers
3. Add a new MCP server with the URL of your running server
4. In a conversation, use the "Browse Products" tool to access your Shopify data

## Tool Usage

The server provides two main tools with multiple parameters:

### 1. browse_products

- **limit**: Number of products to retrieve (default: 10, max: 50)
- **include_inventory**: Set to `true` to include detailed inventory information (default: false)
- **product_id**: Specify a product ID to view detailed information about a specific product

#### Examples

1. **List 5 products**:
   Use the tool with `limit: 5`

2. **View product details with inventory**:
   Use the tool with `product_id: "123456789"`

3. **Browse products with inventory information**:
   Use the tool with `limit: 3, include_inventory: true`

### 2. browse_orders

- **limit**: Number of orders to retrieve (default: 10, max: 50)
- **status**: Filter orders by status (`any`, `open`, `closed`, `cancelled`)
- **order_id**: Specify an order ID to view detailed information about a specific order
- **customer_email**: Filter orders by customer email
- **created_at_min**: Filter orders created on or after this date (ISO format, e.g., "2023-01-01")
- **created_at_max**: Filter orders created on or before this date (ISO format, e.g., "2023-12-31")

#### Examples

1. **List recent orders**:
   Use the tool with `limit: 5`

2. **View specific order details**:
   Use the tool with `order_id: "123456789"`

3. **Search for customer orders**:
   Use the tool with `customer_email: "customer@example.com"`

4. **Filter orders by date range**:
   Use the tool with `created_at_min: "2023-01-01", created_at_max: "2023-12-31"`

5. **Browse open orders**:
   Use the tool with `status: "open", limit: 10`

## Development

### Project Structure

- `src/index.ts`: Main entry point for the MCP server
- `src/shopify-products.ts`: Implementation of Shopify product and inventory tools

### Building

```bash
npm run build
```

### Running in Development Mode

```bash
npm run dev
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request 