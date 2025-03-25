import { z } from 'zod';

// Define the tool handler for Shopify orders
export function registerOrdersTools(server: any) {
  // Create a tool for browsing orders
  server.tool(
    'browse_orders',
    {
      limit: z.number().optional().describe('Number of orders to retrieve (default: 10)'),
      status: z.enum(['any', 'open', 'closed', 'cancelled']).optional().describe('Filter orders by status (default: any)'),
      order_id: z.string().optional().describe('ID of a specific order to view (overrides other parameters)'),
      customer_email: z.string().optional().describe('Filter orders by customer email'),
      created_at_min: z.string().optional().describe('Minimum creation date (ISO format, e.g., 2023-01-01)'),
      created_at_max: z.string().optional().describe('Maximum creation date (ISO format, e.g., 2023-12-31)'),
    },
    async ({ 
      limit = 10, 
      status = 'any', 
      order_id,
      customer_email,
      created_at_min,
      created_at_max
    }: { 
      limit?: number, 
      status?: 'any' | 'open' | 'closed' | 'cancelled',
      order_id?: string,
      customer_email?: string,
      created_at_min?: string,
      created_at_max?: string
    }) => {
      try {
        // If a specific order ID is provided, call the order detail logic
        if (order_id) {
          console.error(`View order details called for ID: ${order_id}`);
          return await getOrderDetails(server, order_id);
        }
        
        console.error('Browse orders tool called');
        console.error(`Requesting ${limit} orders with status=${status}`);
        
        // Check if limit is valid
        if (limit <= 0 || limit > 50) {
          console.error(`Invalid limit: ${limit}`);
          return {
            content: [{ 
              type: 'text', 
              text: `# Invalid Request\n\nPlease specify a limit between 1 and 50 orders.`
            }]
          };
        }
        
        // Build query variables
        const variables: any = { first: limit };
        
        // Build query filters
        let queryFilters = '';
        
        if (status !== 'any') {
          queryFilters += `status:${status.toUpperCase()} `;
        }
        
        if (customer_email) {
          queryFilters += `query:"email:${customer_email}" `;
        }
        
        if (created_at_min) {
          queryFilters += `created_at:>=${created_at_min} `;
        }
        
        if (created_at_max) {
          queryFilters += `created_at:<=${created_at_max} `;
        }
        
        if (queryFilters) {
          variables.query = queryFilters.trim();
        }
        
        // Use a hardcoded query instead of the schema utility
        const query = `
          query GetOrders($first: Int!, $query: String) {
            orders(first: $first, query: $query) {
              edges {
                node {
                  id
                  name
                  createdAt
                  displayFinancialStatus
                  displayFulfillmentStatus
                  cancelledAt
                  closedAt
                  processedAt
                  totalPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  subtotalPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  totalShippingPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  totalTaxSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  customer {
                    id
                    email
                    firstName
                    lastName
                    amountSpent {
                      amount
                      currencyCode
                    }
                  }
                  lineItems(first: 5) {
                    edges {
                      node {
                        title
                        quantity
                        originalTotalSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                        variant {
                          id
                          title
                          sku
                        }
                      }
                    }
                  }
                  shippingAddress {
                    name
                    address1
                    address2
                    city
                    province
                    country
                    zip
                  }
                }
              }
            }
          }
        `;
        
        try {
          // Execute the GraphQL query with simple parameters
          const response = await server.shopify.clients.Graphql().request(
            query,
            {
              variables: { 
                first: Number(limit) || 10,
                query: variables.query 
              } 
            }
          );
          
          console.error('Orders API response received, type:', typeof response);
          
          // Handle different response formats
          let orders;
          try {
            // Try different possible response structures
            if (response.data && response.data.orders && response.data.orders.edges) {
              orders = response.data.orders.edges.map((edge: any) => edge.node);
            } else if (response.orders && response.orders.edges) {
              orders = response.orders.edges.map((edge: any) => edge.node);
            } else {
              throw new Error('Unexpected response format');
            }
            
            console.error(`Retrieved ${orders.length} orders`);
            
            if (orders.length === 0) {
              return {
                content: [{ 
                  type: 'text', 
                  text: `# No Orders Found\n\nNo orders were found matching your criteria.`
                }]
              };
            }
            
            // Format orders information for display
            let responseText = `# Shopify Orders\n\n`;
            
            if (queryFilters) {
              responseText += `**Filters applied:** ${queryFilters}\n\n`;
            }
            
            orders.forEach((order: any) => {
              try {
                const totalPrice = order.totalPriceSet?.shopMoney?.amount || 'N/A';
                const currency = order.totalPriceSet?.shopMoney?.currencyCode || '';
                
                responseText += `## ${order.name}\n`;
                responseText += `**ID:** ${order.id.split('/').pop()}\n`;
                responseText += `**Date:** ${new Date(order.createdAt).toLocaleDateString()}\n`;
                responseText += `**Status:** Payment - ${order.displayFinancialStatus || 'N/A'}, Fulfillment - ${order.displayFulfillmentStatus || 'N/A'}\n`;
                responseText += `**Total:** ${totalPrice} ${currency}\n`;
                
                // Add customer information if available
                if (order.customer) {
                  responseText += `\n### Customer\n`;
                  responseText += `**Name:** ${order.customer.firstName || ''} ${order.customer.lastName || ''}\n`;
                  responseText += `**Email:** ${order.customer.email || 'N/A'}\n`;
                }
                
                // Add shipping address if available
                if (order.shippingAddress) {
                  responseText += `\n### Shipping Address\n`;
                  responseText += `**Name:** ${order.shippingAddress.name || 'N/A'}\n`;
                  
                  const addressParts = [
                    order.shippingAddress.address1,
                    order.shippingAddress.address2,
                    order.shippingAddress.city,
                    order.shippingAddress.province,
                    order.shippingAddress.country,
                    order.shippingAddress.zip
                  ].filter(Boolean);
                  
                  responseText += `**Address:** ${addressParts.join(', ')}\n`;
                }
                
                // Add line items
                if (order.lineItems && order.lineItems.edges && order.lineItems.edges.length > 0) {
                  responseText += `\n### Items\n`;
                  
                  order.lineItems.edges.forEach((lineItemEdge: any) => {
                    const item = lineItemEdge.node;
                    const price = item.originalTotalSet?.shopMoney?.amount || 'N/A';
                    const itemCurrency = item.originalTotalSet?.shopMoney?.currencyCode || '';
                    
                    responseText += `- ${item.quantity}x **${item.title}**`;
                    
                    if (item.variant && item.variant.sku) {
                      responseText += ` (SKU: ${item.variant.sku})`;
                    }
                    
                    responseText += `: ${price} ${itemCurrency}\n`;
                  });
                }
                
                responseText += `\n---\n\n`;
              } catch (formatError) {
                console.error(`Error formatting order ${order.id}:`, formatError);
                responseText += `## Order (Error displaying)\n\n`;
                responseText += `---\n\n`;
              }
            });
            
            return {
              content: [{ type: 'text', text: responseText }]
            };
          } catch (apiError: any) {
            console.error('API Error in browse_orders tool:', apiError);
            
            return {
              content: [{ 
                type: 'text', 
                text: `# API Error\n\nFailed to retrieve orders: ${apiError.message}\n\nPlease verify your API permissions and try again.`
              }]
            };
          }
        } catch (error: any) {
          console.error('Error in browse_orders tool:', error);
          
          return {
            content: [{ 
              type: 'text', 
              text: `# Error\n\nFailed to retrieve orders: ${error.message}\n\nPlease verify your API permissions and try again. This tool requires the 'read_orders' scope.`
            }]
          };
        }
      } catch (error: any) {
        console.error('Error in browse_orders tool:', error);
        
        return {
          content: [{ 
            type: 'text', 
            text: `# Error\n\nFailed to retrieve orders: ${error.message}\n\nPlease verify your API permissions and try again. This tool requires the 'read_orders' scope.`
          }]
        };
      }
    }
  );
}

// Helper function to get detailed information about a specific order
async function getOrderDetails(server: any, id: string): Promise<any> {
  try {
    if (!id || id.trim() === '') {
      console.error('Empty order ID provided');
      return {
        content: [{ 
          type: 'text', 
          text: `# Error\n\nPlease provide a valid order ID.`
        }]
      };
    }
    
    // If the ID doesn't contain a slash, assume it's the ID part after the slash
    let fullId = id;
    if (!id.includes('/')) {
      fullId = `gid://shopify/Order/${id}`;
      console.error(`Converted ID to: ${fullId}`);
    }
    
    // Use a hardcoded query for order details
    const query = `
      query GetOrderDetails($id: ID!) {
        order(id: $id) {
          id
          name
          note
          createdAt
          processedAt
          closedAt
          cancelledAt
          displayFinancialStatus
          displayFulfillmentStatus
          fullyPaid
          refundable
          confirmed
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalTaxSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalRefundedSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          customer {
            id
            email
            firstName
            lastName
            phone
            amountSpent {
              amount
              currencyCode
            }
            defaultAddress {
              address1
              address2
              city
              province
              country
              zip
              phone
            }
          }
          shippingAddress {
            name
            address1
            address2
            city
            province
            country
            zip
            phone
          }
          billingAddress {
            name
            address1
            address2
            city
            province
            country
            zip
            phone
          }
          lineItems(first: 20) {
            edges {
              node {
                title
                quantity
                originalTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                variant {
                  id
                  title
                  sku
                  inventoryQuantity
                  price
                }
              }
            }
          }
          fulfillments {
            status
            createdAt
            trackingInfo {
              company
              number
              url
            }
          }
          transactions(first: 10) {
            edges {
              node {
                id
                kind
                status
                processedAt
                amountSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                paymentDetails {
                  creditCardNumber
                  creditCardCompany
                }
              }
            }
          }
        }
      }
    `;
    
    try {
      // Execute the GraphQL query with simple parameters
      const response = await server.shopify.clients.Graphql().request(
        query,
        { variables: { id: fullId } }
      );
      
      console.error('Order details API response received, type:', typeof response);
      
      // Handle different response formats
      let order;
      if (response.data && response.data.order) {
        order = response.data.order;
      } else if (response.order) {
        order = response.order;
      } else {
        console.error('Order not found in response data');
        return {
          content: [{ 
            type: 'text', 
            text: `# Order Not Found\n\nNo order with ID '${id}' was found in your Shopify store.`
          }]
        };
      }
      
      // Format order information for display with detailed information
      let responseText = `# Order ${order.name}\n\n`;
      
      // Basic order information
      responseText += `**Order ID:** ${order.id.split('/').pop()}\n`;
      responseText += `**Created:** ${new Date(order.createdAt).toLocaleString()}\n`;
      
      if (order.processedAt) {
        responseText += `**Processed:** ${new Date(order.processedAt).toLocaleString()}\n`;
      }
      
      if (order.cancelledAt) {
        responseText += `**Canceled:** ${new Date(order.cancelledAt).toLocaleString()}\n`;
      } else if (order.closedAt) {
        responseText += `**Closed:** ${new Date(order.closedAt).toLocaleString()}\n`;
      }
      
      responseText += `**Financial Status:** ${order.displayFinancialStatus || 'N/A'}\n`;
      responseText += `**Fulfillment Status:** ${order.displayFulfillmentStatus || 'N/A'}\n`;
      
      // Order notes
      if (order.note) {
        responseText += `**Order Note:** ${order.note}\n`;
      }
      
      // Financial details
      responseText += `\n## Financial Details\n\n`;
      
      const currency = order.totalPriceSet?.shopMoney?.currencyCode || '';
      
      responseText += `**Subtotal:** ${order.subtotalPriceSet?.shopMoney?.amount || 'N/A'} ${currency}\n`;
      responseText += `**Shipping:** ${order.totalShippingPriceSet?.shopMoney?.amount || 'N/A'} ${currency}\n`;
      responseText += `**Tax:** ${order.totalTaxSet?.shopMoney?.amount || 'N/A'} ${currency}\n`;
      responseText += `**Total:** ${order.totalPriceSet?.shopMoney?.amount || 'N/A'} ${currency}\n`;
      
      if (order.totalRefundedSet?.shopMoney?.amount) {
        responseText += `**Refunded:** ${order.totalRefundedSet.shopMoney.amount} ${currency}\n`;
      }
      
      responseText += `**Fully Paid:** ${order.fullyPaid ? 'Yes' : 'No'}\n`;
      responseText += `**Refundable:** ${order.refundable ? 'Yes' : 'No'}\n`;
      
      // Customer information
      if (order.customer) {
        responseText += `\n## Customer\n\n`;
        responseText += `**Name:** ${order.customer.firstName || ''} ${order.customer.lastName || ''}\n`;
        responseText += `**Email:** ${order.customer.email || 'N/A'}\n`;
        
        if (order.customer.phone) {
          responseText += `**Phone:** ${order.customer.phone}\n`;
        }
        
        responseText += `**Total Spent:** ${order.customer.amountSpent?.amount || '0'} ${order.customer.amountSpent?.currencyCode || ''}\n`;
      }
      
      // Shipping address
      if (order.shippingAddress) {
        responseText += `\n## Shipping Address\n\n`;
        responseText += `**Name:** ${order.shippingAddress.name || 'N/A'}\n`;
        
        const shippingAddressParts = [
          order.shippingAddress.address1,
          order.shippingAddress.address2,
          order.shippingAddress.city,
          order.shippingAddress.province,
          order.shippingAddress.country,
          order.shippingAddress.zip
        ].filter(Boolean);
        
        responseText += `**Address:** ${shippingAddressParts.join(', ')}\n`;
        
        if (order.shippingAddress.phone) {
          responseText += `**Phone:** ${order.shippingAddress.phone}\n`;
        }
      }
      
      // Billing address
      if (order.billingAddress) {
        responseText += `\n## Billing Address\n\n`;
        responseText += `**Name:** ${order.billingAddress.name || 'N/A'}\n`;
        
        const billingAddressParts = [
          order.billingAddress.address1,
          order.billingAddress.address2,
          order.billingAddress.city,
          order.billingAddress.province,
          order.billingAddress.country,
          order.billingAddress.zip
        ].filter(Boolean);
        
        responseText += `**Address:** ${billingAddressParts.join(', ')}\n`;
        
        if (order.billingAddress.phone) {
          responseText += `**Phone:** ${order.billingAddress.phone}\n`;
        }
      }
      
      // Line items (products)
      if (order.lineItems && order.lineItems.edges && order.lineItems.edges.length > 0) {
        responseText += `\n## Items\n\n`;
        
        order.lineItems.edges.forEach((lineItemEdge: any) => {
          const item = lineItemEdge.node;
          const price = item.originalTotalSet?.shopMoney?.amount || 'N/A';
          const itemCurrency = item.originalTotalSet?.shopMoney?.currencyCode || '';
          
          responseText += `### ${item.title}\n`;
          responseText += `**Quantity:** ${item.quantity}\n`;
          responseText += `**Price:** ${price} ${itemCurrency}\n`;
          
          if (item.variant) {
            if (item.variant.title && item.variant.title !== 'Default Title') {
              responseText += `**Variant:** ${item.variant.title}\n`;
            }
            
            if (item.variant.sku) {
              responseText += `**SKU:** ${item.variant.sku}\n`;
            }
            
            if (item.variant.inventoryQuantity !== null && item.variant.inventoryQuantity !== undefined) {
              responseText += `**Current Inventory:** ${item.variant.inventoryQuantity}\n`;
            }
          }
          
          responseText += `\n`;
        });
      }
      
      // Fulfillments
      if (order.fulfillments && order.fulfillments.length > 0) {
        responseText += `\n## Fulfillments\n\n`;
        
        order.fulfillments.forEach((fulfillment: any, index: number) => {
          responseText += `### Fulfillment ${index + 1}\n`;
          responseText += `**Status:** ${fulfillment.status}\n`;
          responseText += `**Created:** ${new Date(fulfillment.createdAt).toLocaleString()}\n`;
          
          if (fulfillment.trackingInfo && fulfillment.trackingInfo.length > 0) {
            const tracking = fulfillment.trackingInfo[0];
            
            responseText += `**Tracking Company:** ${tracking.company || 'N/A'}\n`;
            responseText += `**Tracking Number:** ${tracking.number || 'N/A'}\n`;
            
            if (tracking.url) {
              responseText += `**Tracking URL:** ${tracking.url}\n`;
            }
          }
          
          responseText += `\n`;
        });
      }
      
      // Transactions
      if (order.transactions && order.transactions.edges && order.transactions.edges.length > 0) {
        responseText += `\n## Transactions\n\n`;
        
        order.transactions.edges.forEach((transactionEdge: any) => {
          const transaction = transactionEdge.node;
          const amount = transaction.amountSet?.shopMoney?.amount || 'N/A';
          const transactionCurrency = transaction.amountSet?.shopMoney?.currencyCode || '';
          
          responseText += `### ${transaction.kind} (${transaction.status})\n`;
          responseText += `**Date:** ${new Date(transaction.processedAt).toLocaleString()}\n`;
          responseText += `**Amount:** ${amount} ${transactionCurrency}\n`;
          
          if (transaction.paymentDetails) {
            if (transaction.paymentDetails.creditCardCompany) {
              responseText += `**Card Type:** ${transaction.paymentDetails.creditCardCompany}\n`;
            }
            
            if (transaction.paymentDetails.creditCardNumber) {
              responseText += `**Card Number:** ${transaction.paymentDetails.creditCardNumber}\n`;
            }
          }
          
          responseText += `\n`;
        });
      }
      
      return {
        content: [{ type: 'text', text: responseText }]
      };
    } catch (apiError: any) {
      console.error('API Error in view_order tool:', apiError);
      
      return {
        content: [{ 
          type: 'text', 
          text: `# API Error\n\nFailed to retrieve order details: ${apiError.message}\n\nPlease verify the order ID and try again.`
        }]
      };
    }
  } catch (error: any) {
    console.error('Error in view_order tool:', error);
    
    return {
      content: [{ 
        type: 'text', 
        text: `# Error\n\nFailed to retrieve order details: ${error.message}\n\nPlease verify the order ID and try again. This tool requires the 'read_orders' scope.`
      }]
    };
  }
} 