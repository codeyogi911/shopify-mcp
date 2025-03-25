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
- Browse orders with `shopify://orders`
- View order details with `shopify://order/{id}`  
- Search for products using the `search_shopify` tool
- Explore the Shopify GraphQL schema using the `shopify://graphql-schema` resource
- Introspect the schema directly using the `introspect_schema` tool
- Query the Shopify API using the `query_shopify` tool

## GraphQL Schema Explorer

You can view the complete Shopify GraphQL schema by accessing the `shopify://graphql-schema` resource. This displays the full schema in SDL format, which is useful for understanding the available types and fields when writing GraphQL queries.

## GraphQL Schema Introspection

The `introspect_schema` tool allows AI models to directly request the GraphQL schema before executing queries, which is useful when the schema information is needed programmatically.

### Using the `introspect_schema` Tool

The `introspect_schema` tool accepts the following parameters:

1. **format**: (Optional) Format to return the schema in
   ```
   introspect_schema()  // Returns the schema in SDL format by default
   ```

   ```
   introspect_schema(format: "json")  // Returns the raw introspection result as JSON
   ```

This tool is particularly useful for AI models to understand the schema structure before constructing GraphQL queries, especially when working with complex types or specific fields.

## GraphQL Exploration

The `explore_schema` tool allows for more targeted exploration of the GraphQL schema, with capabilities to list types, get fields for a specific type, or check if a field exists:

```
explore_schema(action: "list_types")
explore_schema(action: "get_type_fields", type_name: "Product")
explore_schema(action: "check_field", type_name: "Order", field_name: "id")
```

## GraphQL Query Tool

The GraphQL query tool allows you to execute custom GraphQL queries against the Shopify Admin API. This is useful for accessing data that is not directly exposed through the other tools.

### Using the `query_shopify` Tool

The `query_shopify` tool accepts the following parameters:

1. **query**: (Required) The GraphQL query to execute
   ```
   query_shopify(query: """
     query GetProductByTitle($title: String!) {
       products(first: 1, query: $title) {
         edges {
           node {
             id
             title
             description
           }
         }
       }
     }
   """, variables: { "title": "Snowboard" })
   ```

2. **variables**: (Optional) Variables for the GraphQL query
   ```
   query_shopify(
     query: "query GetProduct($id: ID!) { product(id: $id) { id title } }",
     variables: { "id": "gid://shopify/Product/123456789" }
   )
   ```

3. **allow_mutations**: (Optional) Set to true to allow mutations
   ```
   query_shopify(
     query: "mutation ProductUpdate($input: ProductInput!) { productUpdate(input: $input) { product { id title } } }",
     variables: { "input": { "id": "gid://shopify/Product/123456789", "title": "New Title" } },
     allow_mutations: true
   )
   ```

### Working with Connection Types

When querying lists in Shopify's GraphQL API, you need to use the connection pattern:

```graphql
query {
  products(first: 5) {
    edges {
      node {
        id
        title
        createdAt
      }
    }
  }
}
```

## License

MIT 