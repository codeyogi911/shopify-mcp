import { z } from 'zod';
import { Session } from '@shopify/shopify-api';

// Define the tool handlers for Shopify products and inventory
export function registerProductTools(server: any, session: Session) {
  // Create a combined tool for browsing products with inventory information
  server.tool(
    'browse_products',
    {
      limit: z.number().optional().describe('Number of products to retrieve (default: 10)'),
      include_inventory: z.boolean().optional().describe('Whether to include detailed inventory information (default: false)'),
      product_id: z.string().optional().describe('ID of a specific product to view (overrides limit)'),
    },
    async ({ limit = 10, include_inventory = false, product_id }: { limit?: number, include_inventory?: boolean, product_id?: string }) => {
      try {
        // If a product ID is provided, call the product detail logic
        if (product_id) {
          console.error(`View product tool called for ID: ${product_id}`);
          return await getProductDetails(server, session, product_id);
        }
        
        console.error('Browse products tool called');
        console.error(`Requesting ${limit} products with include_inventory=${include_inventory}`);
        
        // Check if limit is valid
        if (limit <= 0 || limit > 50) {
          console.error(`Invalid limit: ${limit}`);
          return {
            content: [{ 
              type: 'text', 
              text: `# Invalid Request\n\nPlease specify a limit between 1 and 50 products.`
            }]
          };
        }
        
        // Create a client for the Admin GraphQL API
        const client = new server.shopify.clients.Graphql({
          session
        });
        
        // Define query based on whether to include inventory information
        const query = include_inventory 
          ? `
            query GetProductsWithInventory($first: Int!) {
              products(first: $first) {
                edges {
                  node {
                    id
                    title
                    description
                    productType
                    vendor
                    createdAt
                    totalInventory
                    variants(first: 10) {
                      edges {
                        node {
                          id
                          title
                          price
                          sku
                          inventoryQuantity
                          inventoryItem {
                            id
                            tracked
                            inventoryLevels(first: 5) {
                              edges {
                                node {
                                  id
                                  quantities(names: ["available"]) {
                                    name
                                    quantity
                                  }
                                  location {
                                    name
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          `
          : `
            query GetProducts($first: Int!) {
              products(first: $first) {
                edges {
                  node {
                    id
                    title
                    description
                    productType
                    vendor
                    createdAt
                    variants(first: 3) {
                      edges {
                        node {
                          id
                          title
                          price
                          sku
                          inventoryQuantity
                        }
                      }
                    }
                  }
                }
              }
            }
          `;
        
        // Execute the GraphQL query
        const response = await client.query({
          data: {
            query: query,
            variables: { first: limit }
          }
        });
        
        console.error('Products data received from API');
        
        // Extract the products data from the response
        const data = response.body as any;
        
        // Validate response format
        if (!data || !data.data || !data.data.products || !data.data.products.edges) {
          console.error('Invalid products data format:', JSON.stringify(data));
          return {
            content: [{ 
              type: 'text', 
              text: `# Data Format Error\n\nThe response from Shopify API was not in the expected format.`
            }]
          };
        }
        
        // Extract the products from the response
        const products = data.data.products.edges.map((edge: any) => edge.node);
        console.error(`Retrieved ${products.length} products`);
        
        if (products.length === 0) {
          return {
            content: [{ 
              type: 'text', 
              text: `# No Products Found\n\nNo products were found in your Shopify store.`
            }]
          };
        }
        
        // Format product information for display
        let responseText = `# Shopify Products${include_inventory ? ' with Inventory' : ''}\n\n`;
        
        products.forEach((product: any) => {
          try {
            responseText += `## ${product.title}\n`;
            responseText += `**ID:** ${product.id.split('/').pop()}\n`;
            responseText += `**Type:** ${product.productType || 'N/A'}\n`;
            responseText += `**Vendor:** ${product.vendor || 'N/A'}\n`;
            
            if (include_inventory) {
              responseText += `**Total Inventory:** ${product.totalInventory !== null ? product.totalInventory : 'Not tracked'}\n`;
            }
            
            responseText += `**Created:** ${new Date(product.createdAt).toLocaleDateString()}\n\n`;
            responseText += `${product.description || 'No description available.'}\n\n`;
            
            if (include_inventory && product.variants.edges.length > 0) {
              responseText += `### Variants\n\n`;
              
              product.variants.edges.forEach((variantEdge: any) => {
                const variant = variantEdge.node;
                responseText += `#### ${variant.title}\n`;
                responseText += `- **Variant ID:** ${variant.id.split('/').pop()}\n`;
                responseText += `- **SKU:** ${variant.sku || 'N/A'}\n`;
                responseText += `- **Price:** $${variant.price}\n`;
                responseText += `- **Inventory Quantity:** ${variant.inventoryQuantity !== null ? variant.inventoryQuantity : 'Not tracked'}\n`;
                
                // Add inventory location information if available
                if (variant.inventoryItem && variant.inventoryItem.inventoryLevels && variant.inventoryItem.inventoryLevels.edges.length > 0) {
                  responseText += `- **Inventory Tracking:** ${variant.inventoryItem.tracked ? 'Enabled' : 'Disabled'}\n`;
                  responseText += `\n**Inventory by Location:**\n\n`;
                  
                  variant.inventoryItem.inventoryLevels.edges.forEach((levelEdge: any) => {
                    const level = levelEdge.node;
                    responseText += `- ${level.location.name}: ${level.quantities[0]?.quantity || 'Not tracked'} available\n`;
                  });
                }
                
                responseText += `\n`;
              });
            } else if (!include_inventory) {
              // Show basic variant info if not including inventory
              const variant = product.variants.edges[0]?.node;
              if (variant) {
                responseText += `**Price:** $${variant.price || 'N/A'}\n\n`;
              }
            }
            
            responseText += `---\n\n`;
          } catch (formatError) {
            console.error(`Error formatting product ${product.id}:`, formatError);
            responseText += `## Product (Error displaying)\n\n`;
            responseText += `---\n\n`;
          }
        });
        
        return {
          content: [{ type: 'text', text: responseText }]
        };
      } catch (error: any) {
        console.error('Error in browse_products tool:', error);
        
        return {
          content: [{ 
            type: 'text', 
            text: `# Error\n\nFailed to retrieve products: ${error.message}\n\nPlease try again with a smaller number of products (e.g., 3 instead of 5).`
          }]
        };
      }
    }
  );
}

// Helper function to get detailed information about a specific product
async function getProductDetails(server: any, session: Session, id: string): Promise<any> {
  try {
    if (!id || id.trim() === '') {
      console.error('Empty product ID provided');
      return {
        content: [{ 
          type: 'text', 
          text: `# Error\n\nPlease provide a valid product ID.`
        }]
      };
    }
    
    // If the ID doesn't contain a slash, assume it's the ID part after the slash
    let fullId = id;
    if (!id.includes('/')) {
      fullId = `gid://shopify/Product/${id}`;
      console.error(`Converted ID to: ${fullId}`);
    }
    
    // Create a client for the Admin GraphQL API
    const client = new server.shopify.clients.Graphql({
      session
    });
    
    // Execute the GraphQL query for product details with inventory
    const response = await client.query({
      data: {
        query: `
          query GetProduct($id: ID!) {
            product(id: $id) {
              id
              title
              description
              productType
              vendor
              createdAt
              updatedAt
              totalInventory
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    sku
                    inventoryQuantity
                    inventoryItem {
                      id
                      tracked
                      inventoryLevels(first: 5) {
                        edges {
                          node {
                            id
                            quantities(names: ["available"]) {
                              name
                              quantity
                            }
                            location {
                              name
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { id: fullId }
      }
    });
    
    console.error('Product data received from API');
    
    // Extract the product data from the response
    const data = response.body as any;
    
    // Validate response format
    if (!data || !data.data || !data.data.product) {
      console.error('Invalid product data format or product not found:', JSON.stringify(data));
      return {
        content: [{ 
          type: 'text', 
          text: `# Product Not Found\n\nNo product with ID '${id}' was found in your Shopify store.`
        }]
      };
    }
    
    // Extract the product from the response
    const product = data.data.product;
    
    // Format product information for display with detailed inventory
    let responseText = `# ${product.title}\n\n`;
    responseText += `**ID:** ${product.id.split('/').pop()}\n`;
    responseText += `**Type:** ${product.productType || 'N/A'}\n`;
    responseText += `**Vendor:** ${product.vendor || 'N/A'}\n`;
    responseText += `**Total Inventory:** ${product.totalInventory !== null ? product.totalInventory : 'Not tracked'}\n`;
    responseText += `**Created:** ${new Date(product.createdAt).toLocaleDateString()}\n`;
    responseText += `**Updated:** ${new Date(product.updatedAt).toLocaleDateString()}\n\n`;
    responseText += `## Description\n\n${product.description || 'No description available.'}\n\n`;
    
    // Add variants with inventory information
    if (product.variants && product.variants.edges && product.variants.edges.length > 0) {
      responseText += `## Variants\n\n`;
      
      product.variants.edges.forEach((variantEdge: any) => {
        try {
          const variant = variantEdge.node;
          responseText += `### ${variant.title}\n`;
          responseText += `- **Variant ID:** ${variant.id.split('/').pop()}\n`;
          responseText += `- **SKU:** ${variant.sku || 'N/A'}\n`;
          responseText += `- **Price:** $${variant.price}\n`;
          responseText += `- **Inventory Quantity:** ${variant.inventoryQuantity !== null ? variant.inventoryQuantity : 'Not tracked'}\n`;
          
          // Add inventory location information if available
          if (variant.inventoryItem && variant.inventoryItem.inventoryLevels && variant.inventoryItem.inventoryLevels.edges.length > 0) {
            responseText += `- **Inventory Tracking:** ${variant.inventoryItem.tracked ? 'Enabled' : 'Disabled'}\n`;
            
            responseText += `\n**Inventory by Location:**\n\n`;
            variant.inventoryItem.inventoryLevels.edges.forEach((levelEdge: any) => {
              const level = levelEdge.node;
              responseText += `- ${level.location.name}: ${level.quantities[0]?.quantity || 'Not tracked'} available\n`;
            });
          }
          
          responseText += `\n`;
        } catch (variantError) {
          console.error('Error formatting variant:', variantError);
          responseText += `### Variant (Error displaying)\n\n`;
        }
      });
    } else {
      responseText += `## Variants\n\nNo variants available\n`;
    }
    
    return {
      content: [{ type: 'text', text: responseText }]
    };
  } catch (error: any) {
    console.error('Error in view_product tool:', error);
    
    return {
      content: [{ 
        type: 'text', 
        text: `# Error\n\nFailed to retrieve product details: ${error.message}\n\nPlease verify the product ID and try again.`
      }]
    };
  }
} 