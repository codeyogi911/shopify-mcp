import dotenv from 'dotenv';
import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import { ShopifySchema } from './shopify-schema.js';
import chalk from 'chalk';
import '@shopify/shopify-api/adapters/node';

// Load environment variables
dotenv.config();

// Validate required environment variables
const shopifyStoreName = process.env.SHOPIFY_STORE_NAME;
const shopifyAccessToken = process.env.SHOPIFY_API_ACCESS_TOKEN;

if (!shopifyStoreName || !shopifyAccessToken) {
  console.error('Missing required environment variables:');
  process.exit(1);
}

async function main() {
  try {
    console.log(chalk.blue('Initializing Shopify API client...'));
    
    // Initialize Shopify API client
    const shopify = shopifyApi({
      apiKey: 'not-used-with-admin-api-access-token',
      apiSecretKey: 'not-used-with-admin-api-access-token',
      scopes: ['read_products', 'read_orders', 'read_customers'],
      hostName: `${shopifyStoreName}.myshopify.com`,
      apiVersion: LATEST_API_VERSION,
      isEmbeddedApp: false
    });

    // Create a custom offline session
    const session = shopify.session.customAppSession(`${shopifyStoreName}.myshopify.com`);
    session.accessToken = shopifyAccessToken;

    // Initialize the schema utility
    console.log(chalk.blue('Initializing schema utility...'));
    const schema = new ShopifySchema(shopify, session);
    
    // Load the schema
    await schema.loadSchema();
    console.log(chalk.green('✓ Schema loaded successfully'));

    // Example 1: List available types
    console.log(chalk.yellow('\n1. Listing first 10 types from schema:'));
    const types = await schema.getTypes();
    types.slice(0, 10).forEach(type => console.log(`  - ${type}`));
    console.log(`  ...and ${types.length - 10} more types`);

    // Example 2: Check if a field exists
    console.log(chalk.yellow('\n2. Checking field existence:'));
    const orderFields = [
      ['Order', 'id'],
      ['Order', 'cancelledAt'], 
      ['Order', 'canceledAt'],  // Intentional US spelling to show error
      ['Product', 'title'],
      ['Product', 'nonExistentField']
    ];
    
    for (const [type, field] of orderFields) {
      const exists = await schema.fieldExists(type, field);
      console.log(`  - Field '${field}' on type '${type}': ${exists ? chalk.green('✓ exists') : chalk.red('✗ does not exist')}`);
    }

    // Example 3: Get fields of a type
    console.log(chalk.yellow('\n3. Getting fields of "Order" type:'));
    const fields = await schema.getTypeFields('Order');
    console.log(`  Found ${fields.length} fields, showing first 5:`);
    fields.slice(0, 5).forEach(field => {
      console.log(`  - ${field.name}: ${field.type}`);
    });

    // Example 4: Build a valid query
    console.log(chalk.yellow('\n4. Building a validated query:'));
    
    // Using our improved schema utility with connection type handling
    const { query } = await schema.generateQuery(
      'GetOrders',
      'Order',        // Specify the type of the items (not OrderConnection)
      'orders',       // Field name will be checked to see if it returns a connection
      ['id', 'name', 'createdAt', 'customer { email firstName }'],
      { first: 'Int!' },
      { first: '$first' }
    );
    
    console.log(chalk.gray('  Generated query:'));
    console.log(chalk.gray(query));

    // Example 5: Execute the query
    console.log(chalk.yellow('\n5. Executing the generated query:'));
    
    const client = new shopify.clients.Graphql({ session });
    
    // Use the new request method instead of query
    const response = await client.request(
      query,
      { variables: { first: 1 } }
    );
    
    console.log(chalk.green('  ✓ Query executed successfully'));
    
    // No need to use response.body anymore since data is directly accessible
    if (response.data && response.data.orders?.edges?.length > 0) {
      console.log(chalk.gray('  First order:'), response.data.orders.edges[0].node);
    } else {
      console.log(chalk.yellow('  No orders found or unexpected response format'));
    }

  } catch (error) {
    console.error(chalk.red('Error:'), error);
  }
}

main(); 