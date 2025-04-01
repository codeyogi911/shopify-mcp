import { z } from 'zod';
import { ShopifyServer } from '../types.js';

// Define the tool handlers for Shopify inventory
export function registerInventoryTools(server: ShopifyServer) {

  // Tool for retrieving inventory items with optional filtering
  server.tool(
    'list_inventory_items',
    'List inventory items with optional filtering by SKU',
    {
      limit: z.number().optional().describe('Number of inventory items to retrieve (default: 10, max: 50)'),
      sku_filter: z.string().optional().describe('Filter inventory items by SKU or partial SKU (e.g., "XYZ-12345")'),
      cursor: z.string().optional().describe('Pagination cursor for retrieving next set of results'),
    },
    async ({ limit = 10, sku_filter, cursor }) => {
      try {
        // Validate limit
        const validLimit = Math.min(Math.max(1, limit), 50); // Ensure between 1 and 50
        
        // Create a client for the Admin GraphQL API
        const client = server.shopify.clients.Graphql();
        
        // Construct query parameters
        let queryParams = '';
        if (sku_filter) {
          queryParams += ` query:"sku:${sku_filter}"`;
        }
        
        // Add pagination parameters
        let paginationParams = `first: ${validLimit}`;
        if (cursor) {
          paginationParams = `after: "${cursor}", ${paginationParams}`;
        }
        
        // Define GraphQL query
        const query = `
          query GetInventoryItems {
            inventoryItems(${paginationParams}${queryParams}) {
              edges {
                cursor
                node {
                  id
                  tracked
                  sku
                  createdAt
                  updatedAt
                  variant {
                    id
                    title
                    product {
                      id
                      title
                    }
                  }
                  inventoryLevels(first: 10) {
                    edges {
                      node {
                        id
                        quantities(names: ["available"]) {
                          name
                          quantity
                        }
                        location {
                          id
                          name
                          isActive
                        }
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `;
        
        // Execute the GraphQL query
        const response = await client.request(query, { variables: {} });
        
        // Extract inventory items from response
        const inventoryItems = response.data?.inventoryItems?.edges?.map((edge: any) => edge.node) || [];
        const pageInfo = response.data?.inventoryItems?.pageInfo || { hasNextPage: false, endCursor: null };
        
        if (inventoryItems.length === 0) {
          return {
            content: [{ 
              type: 'text', 
              text: `# No Inventory Items Found\n\n${sku_filter ? `No inventory items matching SKU filter "${sku_filter}" were found.` : 'No inventory items were found in your Shopify store.'}`
            }]
          };
        }
        
        // Format inventory information for display
        let responseText = `# Shopify Inventory Items\n\n`;
        
        if (sku_filter) {
          responseText += `**Filter:** SKU contains "${sku_filter}"\n\n`;
        }
        
        inventoryItems.forEach((item: any) => {
          try {
            responseText += `## ${item.variant?.product?.title || 'Unknown Product'} - ${item.variant?.title || 'Unknown Variant'}\n`;
            responseText += `**Inventory Item ID:** ${item.id.split('/').pop()}\n`;
            responseText += `**SKU:** ${item.sku || 'N/A'}\n`;
            responseText += `**Tracking Enabled:** ${item.tracked ? 'Yes' : 'No'}\n`;
            
            // Add variant and product information if available
            if (item.variant) {
              responseText += `**Variant ID:** ${item.variant.id.split('/').pop()}\n`;
              if (item.variant.product) {
                responseText += `**Product ID:** ${item.variant.product.id.split('/').pop()}\n`;
              }
            }
            
            // Add inventory levels information
            if (item.inventoryLevels && item.inventoryLevels.edges.length > 0) {
              responseText += `\n**Inventory Levels:**\n`;
              
              item.inventoryLevels.edges.forEach((levelEdge: any) => {
                const level = levelEdge.node;
                const quantityObj = level.quantities?.find((q: any) => q.name === "available");
                const quantity = quantityObj ? quantityObj.quantity : 0;
                responseText += `- ${level.location.name}: ${quantity} available${level.location.isActive ? '' : ' (Inactive Location)'}\n`;
              });
            } else {
              responseText += `\n**Inventory Levels:** None available\n`;
            }
            
            responseText += `\n---\n\n`;
          } catch (formatError) {
            console.error(`Error formatting inventory item ${item.id}:`, formatError);
            responseText += `## Inventory Item (Error displaying)\n\n---\n\n`;
          }
        });
        
        // Add pagination information
        if (pageInfo.hasNextPage) {
          responseText += `\n*There are more inventory items available. Use cursor \`${pageInfo.endCursor}\` to retrieve the next page.*\n`;
        }
        
        return {
          content: [{ type: 'text', text: responseText }]
        };
      } catch (error: any) {
        console.error('Error in list_inventory_items tool:', error);
        
        return {
          content: [{ 
            type: 'text', 
            text: `# Error\n\nFailed to retrieve inventory items: ${error.message}`
          }]
        };
      }
    }
  );
  
  // Tool for retrieving a specific inventory item by ID or SKU with detailed information
  server.tool(
    'get_inventory_item',
    'Get detailed information about a specific inventory item by ID or SKU',
    {
      id: z.string().optional().describe('The ID of the inventory item (e.g., "gid://shopify/InventoryItem/12345")'),
      sku: z.string().optional().describe('The SKU of the inventory item (e.g., "XYZ-12345")'),
    },
    async ({ id, sku }) => {
      try {
        // Validate input - either ID or SKU must be provided
        if (!id && !sku) {
          return {
            content: [{ 
              type: 'text', 
              text: `# Error\n\nPlease provide either an inventory item ID or SKU.`
            }]
          };
        }
        
        // Create a client for the Admin GraphQL API
        const client = server.shopify.clients.Graphql();
        
        let inventoryItem;
        
        // If ID is provided, fetch directly by ID
        if (id) {
          // If the ID doesn't contain a slash, assume it's the ID part after the slash
          let fullId = id;
          if (!id.includes('/')) {
            fullId = `gid://shopify/InventoryItem/${id}`;
          }
          
          const queryById = `
            query GetInventoryItemById($id: ID!) {
              inventoryItem(id: $id) {
                id
                tracked
                sku
                createdAt
                updatedAt
                variant {
                  id
                  title
                  price
                  sku
                  product {
                    id
                    title
                    status
                    vendor
                  }
                }
                inventoryLevels(first: 20) {
                  edges {
                    node {
                      id
                      quantities(names: ["available", "incoming", "committed"]) {
                        name
                        quantity
                      }
                      location {
                        id
                        name
                        isActive
                        address {
                          formatted
                        }
                      }
                    }
                  }
                }
              }
            }
          `;
          
          const response = await client.request(queryById, { variables: { id: fullId } });
          inventoryItem = response.data?.inventoryItem;
        } 
        // If SKU is provided, search by SKU
        else if (sku) {
          const queryBySku = `
            query GetInventoryItemBySku($query: String!) {
              inventoryItems(first: 1, query: $query) {
                edges {
                  node {
                    id
                    tracked
                    sku
                    createdAt
                    updatedAt
                    variant {
                      id
                      title
                      price
                      sku
                      product {
                        id
                        title
                        status
                        vendor
                      }
                    }
                    inventoryLevels(first: 20) {
                      edges {
                        node {
                          id
                          quantities(names: ["available", "incoming", "committed"]) {
                            name
                            quantity
                          }
                          location {
                            id
                            name
                            isActive
                            address {
                              formatted
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          `;
          
          const response = await client.request(queryBySku, { variables: { query: `sku:${sku}` } });
          inventoryItem = response.data?.inventoryItems?.edges?.[0]?.node;
        }
        
        // Check if inventory item was found
        if (!inventoryItem) {
          return {
            content: [{ 
              type: 'text', 
              text: `# Inventory Item Not Found\n\n${id ? `No inventory item with ID ${id}` : `No inventory item with SKU ${sku}`} was found in your Shopify store.`
            }]
          };
        }
        
        // Format inventory item information for display
        let responseText = `# Inventory Item Details\n\n`;
        responseText += `**Inventory Item ID:** ${inventoryItem.id.split('/').pop()}\n`;
        responseText += `**SKU:** ${inventoryItem.sku || 'N/A'}\n`;
        responseText += `**Tracking Enabled:** ${inventoryItem.tracked ? 'Yes' : 'No'}\n`;
        responseText += `**Created:** ${new Date(inventoryItem.createdAt).toLocaleDateString()}\n`;
        responseText += `**Updated:** ${new Date(inventoryItem.updatedAt).toLocaleDateString()}\n\n`;
        
        // Add variant and product information if available
        if (inventoryItem.variant) {
          responseText += `## Associated Product and Variant\n\n`;
          responseText += `**Variant ID:** ${inventoryItem.variant.id.split('/').pop()}\n`;
          responseText += `**Variant Title:** ${inventoryItem.variant.title}\n`;
          responseText += `**Variant Price:** $${inventoryItem.variant.price}\n`;
          
          if (inventoryItem.variant.product) {
            responseText += `**Product ID:** ${inventoryItem.variant.product.id.split('/').pop()}\n`;
            responseText += `**Product Title:** ${inventoryItem.variant.product.title}\n`;
            responseText += `**Product Status:** ${inventoryItem.variant.product.status}\n`;
            responseText += `**Vendor:** ${inventoryItem.variant.product.vendor || 'N/A'}\n`;
          }
        }
        
        // Add inventory levels information
        if (inventoryItem.inventoryLevels && inventoryItem.inventoryLevels.edges.length > 0) {
          responseText += `\n## Inventory Levels\n\n`;
          
          inventoryItem.inventoryLevels.edges.forEach((levelEdge: any) => {
            const level = levelEdge.node;
            responseText += `### ${level.location.name}${level.location.isActive ? '' : ' (Inactive)'}\n`;
            responseText += `**Location ID:** ${level.location.id.split('/').pop()}\n`;
            
            if (level.location.address?.formatted) {
              responseText += `**Address:** ${level.location.address.formatted}\n`;
            }
            
            // Display quantities with more detail
            responseText += `\n**Quantities:**\n`;
            if (level.quantities && level.quantities.length > 0) {
              level.quantities.forEach((q: any) => {
                responseText += `- ${q.name.charAt(0).toUpperCase() + q.name.slice(1)}: ${q.quantity}\n`;
              });
            } else {
              responseText += `- Available: 0\n`;
            }
            
            responseText += `\n`;
          });
        } else {
          responseText += `\n## Inventory Levels\n\nNo inventory levels found for this item.\n`;
        }
        
        return {
          content: [{ type: 'text', text: responseText }]
        };
      } catch (error: any) {
        console.error('Error in get_inventory_item tool:', error);
        
        return {
          content: [{ 
            type: 'text', 
            text: `# Error\n\nFailed to retrieve inventory item details: ${error.message}`
          }]
        };
      }
    }
  );
  
  // Tool for updating inventory quantities at specific locations
  server.tool(
    'update_inventory_quantity',
    'Update the available quantity of an inventory item at a specific location',
    {
      inventory_item_id: z.string().describe('The ID of the inventory item (e.g., "gid://shopify/InventoryItem/12345")'),
      location_id: z.string().describe('The ID of the location (e.g., "gid://shopify/Location/12345")'),
      available: z.number().describe('The new available quantity for the inventory item at this location'),
    },
    async ({ inventory_item_id, location_id, available }) => {
      try {
        // Format IDs if needed
        let fullInventoryItemId = inventory_item_id;
        if (!inventory_item_id.includes('/')) {
          fullInventoryItemId = `gid://shopify/InventoryItem/${inventory_item_id}`;
        }
        
        let fullLocationId = location_id;
        if (!location_id.includes('/')) {
          fullLocationId = `gid://shopify/Location/${location_id}`;
        }
        
        // Create a client for the Admin GraphQL API
        const client = server.shopify.clients.Graphql();
        
        // Define GraphQL mutation for updating inventory level
        const mutation = `
          mutation UpdateInventoryLevel($inventoryLevelInput: InventoryAdjustQuantityInput!) {
            inventoryAdjustQuantity(input: $inventoryLevelInput) {
              inventoryLevel {
                id
                quantities(names: ["available"]) {
                  name
                  quantity
                }
                location {
                  name
                }
                item {
                  id
                  sku
                  variant {
                    title
                    product {
                      title
                    }
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        
        // Execute the GraphQL mutation
        const response = await client.request(mutation, {
          variables: {
            inventoryLevelInput: {
              inventoryItemId: fullInventoryItemId,
              locationId: fullLocationId,
              availableDelta: 0, // Special value to set absolute quantity instead of adjust
              available: available
            }
          }
        });
        
        // Check for errors
        const userErrors = response.data?.inventoryAdjustQuantity?.userErrors || [];
        if (userErrors.length > 0) {
          const errors = userErrors.map((error: any) => `${error.field ? error.field.join(', ') : 'General'}: ${error.message}`).join('\n');
          return {
            content: [{ 
              type: 'text', 
              text: `# Error Updating Inventory\n\n${errors}`
            }]
          };
        }
        
        // Extract updated inventory level information
        const updatedLevel = response.data?.inventoryAdjustQuantity?.inventoryLevel;
        if (!updatedLevel) {
          throw new Error('Inventory update failed - no data returned');
        }

        // Get the available quantity from the quantities array
        const availableQuantity = updatedLevel.quantities?.find((q: any) => q.name === "available")?.quantity || 0;
        
        // Format response
        let responseText = `# Inventory Updated Successfully\n\n`;
        responseText += `**Product:** ${updatedLevel.item?.variant?.product?.title || 'Unknown'}\n`;
        responseText += `**Variant:** ${updatedLevel.item?.variant?.title || 'Unknown'}\n`;
        responseText += `**SKU:** ${updatedLevel.item?.sku || 'N/A'}\n`;
        responseText += `**Location:** ${updatedLevel.location?.name || 'Unknown'}\n`;
        responseText += `**New Available Quantity:** ${availableQuantity}\n`;
        
        return {
          content: [{ type: 'text', text: responseText }]
        };
      } catch (error: any) {
        console.error('Error in update_inventory_quantity tool:', error);
        
        // Extract GraphQL errors if available
        let errorMessage = error.message;
        if (error.graphQLErrors && error.graphQLErrors.length > 0) {
          errorMessage = error.graphQLErrors.map((err: any) => err.message).join(', ');
        } else if (error.response?.errors) {
          errorMessage = error.response.errors.map((err: any) => err.message).join(', ');
        }
        
        return {
          content: [{ 
            type: 'text', 
            text: `# Error\n\nFailed to update inventory quantity: ${errorMessage}`
          }]
        };
      }
    }
  );
} 