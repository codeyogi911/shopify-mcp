import { z } from 'zod';
import { ShopifyServer } from '../types.js';

// Define the tool handler for Shopify orders
export function registerOrdersTools(server: ShopifyServer) {
  // Create a tool for browsing orders
  server.tool(
    'browse_orders',
    'This tool retrieves Shopify orders with powerful filtering options. It supports filtering by status, date range, customer email, financial status, fulfillment status, and allows searching by order number or customer details. When provided with a specific order_id, it returns detailed information for that single order.',
    {
      limit: z.number().optional().describe('Number of orders to retrieve (default: 10)'),
      status: z.enum(['any', 'open', 'closed', 'cancelled']).optional().describe('Filter orders by status (default: any)'),
      order_id: z.string().optional().describe('ID of a specific order to view (overrides other parameters)'),
      customer_email: z.string().optional().describe('Filter orders by customer email'),
      created_at_min: z.string().optional().describe('Minimum creation date (ISO format, e.g., 2023-01-01)'),
      created_at_max: z.string().optional().describe('Maximum creation date (ISO format, e.g., 2023-12-31)'),
      reverse: z.boolean().optional().describe('Reverse the order of results (newest first if true)'),
      sort_key: z.enum(['created_at', 'updated_at', 'processed_at', 'total_price', 'customer_name']).optional().describe('Sort orders by this key'),
      financial_status: z.enum(['any', 'paid', 'unpaid', 'partially_paid', 'refunded', 'partially_refunded', 'voided']).optional().describe('Filter by financial status'),
      fulfillment_status: z.enum(['any', 'fulfilled', 'partial', 'unfulfilled']).optional().describe('Filter by fulfillment status'),
      search: z.string().optional().describe('Search orders by order number, customer name, or email'),
    },
    async ({ 
      limit = 10, 
      status = 'any', 
      order_id,
      customer_email,
      created_at_min,
      created_at_max,
      reverse = false,
      sort_key = 'created_at',
      financial_status = 'any',
      fulfillment_status = 'any',
      search
    }: { 
      limit?: number, 
      status?: 'any' | 'open' | 'closed' | 'cancelled',
      order_id?: string,
      customer_email?: string,
      created_at_min?: string,
      created_at_max?: string,
      reverse?: boolean,
      sort_key?: 'created_at' | 'updated_at' | 'processed_at' | 'total_price' | 'customer_name',
      financial_status?: 'any' | 'paid' | 'unpaid' | 'partially_paid' | 'refunded' | 'partially_refunded' | 'voided',
      fulfillment_status?: 'any' | 'fulfilled' | 'partial' | 'unfulfilled',
      search?: string
    }) => {
      try {
        // Build query filters
        const queryFilters = [];
        if (status !== 'any') queryFilters.push(`status:${status}`);
        if (financial_status !== 'any') queryFilters.push(`financial_status:${financial_status}`);
        if (fulfillment_status !== 'any') queryFilters.push(`fulfillment_status:${fulfillment_status}`);
        if (search) queryFilters.push(search);
        if (created_at_min) queryFilters.push(`created_at:>='${created_at_min}'`);
        if (created_at_max) queryFilters.push(`created_at:<='${created_at_max}'`);
        
        // Build variables for the GraphQL query
        const variables: any = {
          first: Number(limit) || 10,
          query: queryFilters.length > 0 ? queryFilters.join(' ') : undefined,
          sortKey: sort_key.toUpperCase(),
          reverse: reverse
        };
        
        // Use a hardcoded query instead of the schema utility
        const query = `
          query GetOrders(
            $first: Int!, 
            $query: String,
            $sortKey: OrderSortKeys,
            $reverse: Boolean
          ) {
            orders(
              first: $first,
              query: $query,
              sortKey: $sortKey,
              reverse: $reverse
            ) {
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
          // Execute the GraphQL query with parameters
          const response = await server.shopify.clients.Graphql().request(
            query,
            { variables }
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
            
            if (queryFilters.length > 0) {
              responseText += `**Filters applied:** ${queryFilters.join(', ')}\n\n`;
            }
            
            responseText += `**Sort:** ${sort_key} (${reverse ? 'descending' : 'ascending'})\n\n`;
            
            orders.forEach((order: any) => {
              responseText += `## Order ${order.name}\n\n`;
              responseText += `**Status:** ${order.displayFinancialStatus} / ${order.displayFulfillmentStatus}\n\n`;
              responseText += `**Created:** ${new Date(order.createdAt).toLocaleString()}\n\n`;
              
              if (order.customer) {
                responseText += `**Customer:** ${order.customer.firstName} ${order.customer.lastName} (${order.customer.email})\n\n`;
              }
              
              responseText += `**Total:** ${order.totalPriceSet.shopMoney.amount} ${order.totalPriceSet.shopMoney.currencyCode}\n\n`;
              
              if (order.lineItems && order.lineItems.edges && order.lineItems.edges.length > 0) {
                responseText += `**Items:**\n\n`;
                order.lineItems.edges.forEach((item: any) => {
                  responseText += `- ${item.node.title} (${item.node.quantity}x) - ${item.node.originalTotalSet.shopMoney.amount} ${item.node.originalTotalSet.shopMoney.currencyCode}\n`;
                });
                responseText += `\n`;
              }
              
              if (order.shippingAddress) {
                responseText += `**Shipping Address:**\n`;
                responseText += `${order.shippingAddress.name}\n`;
                responseText += `${order.shippingAddress.address1}\n`;
                if (order.shippingAddress.address2) {
                  responseText += `${order.shippingAddress.address2}\n`;
                }
                responseText += `${order.shippingAddress.city}, ${order.shippingAddress.province} ${order.shippingAddress.zip}\n`;
                responseText += `${order.shippingAddress.country}\n\n`;
              }
              
              responseText += `---\n\n`;
            });
            
            return {
              content: [{ type: 'text', text: responseText }]
            };
            
          } catch (error: any) {
            console.error('Error processing orders response:', error);
            return {
              content: [{ 
                type: 'text', 
                text: `# Error Processing Orders\n\nThere was an error processing the orders response: ${error.message}` 
              }]
            };
          }
        } catch (error: any) {
          console.error('Error executing orders query:', error);
          return {
            content: [{ 
              type: 'text', 
              text: `# Error Executing Orders Query\n\n${error.message}` 
            }]
          };
        }
      } catch (error: any) {
        console.error('Error in browse_orders tool:', error);
        return {
          content: [{ 
            type: 'text', 
            text: `# Error in Browse Orders Tool\n\n${error.message}` 
          }]
        };
      }
    }
  );

  // Create a tool for getting customer contact information
  server.tool(
    'get_customer_contacts',
    {
      limit: z.number().optional().describe('Number of orders to retrieve (default: 10)'),
      created_at_min: z.string().optional().describe('Minimum creation date (ISO format, e.g., 2023-01-01)'),
      created_at_max: z.string().optional().describe('Maximum creation date (ISO format, e.g., 2023-12-31)'),
      search: z.string().optional().describe('Search by customer name or email'),
    },
    async ({ 
      limit = 10, 
      created_at_min,
      created_at_max,
      search
    }: { 
      limit?: number,
      created_at_min?: string,
      created_at_max?: string,
      search?: string
    }) => {
      try {
        // Build query filters
        const queryFilters = [];
        if (search) queryFilters.push(search);
        if (created_at_min) queryFilters.push(`created_at:>='${created_at_min}'`);
        if (created_at_max) queryFilters.push(`created_at:<='${created_at_max}'`);
        
        // Build variables for the GraphQL query
        const variables: any = {
          first: Number(limit) || 10,
          query: queryFilters.length > 0 ? queryFilters.join(' ') : undefined
        };
        
        // Use a simplified query focused on customer contact information
        const query = `
          query GetCustomerContacts(
            $first: Int!, 
            $query: String
          ) {
            orders(
              first: $first,
              query: $query
            ) {
              edges {
                node {
                  customer {
                    id
                    email
                    phone
                    firstName
                    lastName
                  }
                  shippingAddress {
                    phone
                  }
                  billingAddress {
                    phone
                  }
                }
              }
            }
          }
        `;
        
        try {
          // Execute the GraphQL query with parameters
          const response = await server.shopify.clients.Graphql().request(
            query,
            { variables }
          );
          
          // Handle different response formats
          let orders;
          try {
            if (response.data && response.data.orders && response.data.orders.edges) {
              orders = response.data.orders.edges.map((edge: any) => edge.node);
            } else if (response.orders && response.orders.edges) {
              orders = response.orders.edges.map((edge: any) => edge.node);
            } else {
              throw new Error('Unexpected response format');
            }
            
            if (orders.length === 0) {
              return {
                content: [{ 
                  type: 'text', 
                  text: `# No Customer Contacts Found\n\nNo customer contacts were found matching your criteria.`
                }]
              };
            }
            
            // Format customer contact information for display
            let responseText = `# Customer Contact Information\n\n`;
            
            if (queryFilters.length > 0) {
              responseText += `**Filters applied:** ${queryFilters.join(', ')}\n\n`;
            }
            
            // Create a map to store unique customers
            const uniqueCustomers = new Map();
            
            orders.forEach((order: any) => {
              if (order.customer) {
                const customerId = order.customer.id;
                if (!uniqueCustomers.has(customerId)) {
                  const customer = order.customer;
                  const phone = order.shippingAddress?.phone || order.billingAddress?.phone || customer.phone || 'N/A';
                  
                  uniqueCustomers.set(customerId, {
                    name: `${customer.firstName} ${customer.lastName}`.trim(),
                    email: customer.email,
                    phone: phone
                  });
                }
              }
            });
            
            // Display unique customers
            uniqueCustomers.forEach((customer: any) => {
              responseText += `## ${customer.name}\n\n`;
              responseText += `**Email:** ${customer.email}\n`;
              responseText += `**Phone:** ${customer.phone}\n\n`;
              responseText += `---\n\n`;
            });
            
            responseText += `\nTotal unique customers: ${uniqueCustomers.size}`;
            
            return {
              content: [{ type: 'text', text: responseText }]
            };
            
          } catch (error: any) {
            console.error('Error processing customer contacts response:', error);
            return {
              content: [{ 
                type: 'text', 
                text: `# Error Processing Customer Contacts\n\nThere was an error processing the response: ${error.message}` 
              }]
            };
          }
        } catch (error: any) {
          console.error('Error executing customer contacts query:', error);
          return {
            content: [{ 
              type: 'text', 
              text: `# Error Executing Customer Contacts Query\n\n${error.message}` 
            }]
          };
        }
      } catch (error: any) {
        console.error('Error in get_customer_contacts tool:', error);
        return {
          content: [{ 
            type: 'text', 
            text: `# Error in Get Customer Contacts Tool\n\n${error.message}` 
          }]
        };
      }
    }
  );

  // Create a tool for getting customer phone number
  server.tool(
    'get_customer_phone',
    {
      order_id: z.string().optional().describe('ID of a specific order to get customer phone from'),
      customer_email: z.string().optional().describe('Email address of the customer to get phone from'),
    },
    async ({ order_id, customer_email }: { 
      order_id?: string,
      customer_email?: string
    }) => {
      try {
        if (!order_id && !customer_email) {
          return {
            content: [{ 
              type: 'text', 
              text: `# Error\n\nPlease provide either an order ID or customer email address.`
            }]
          };
        }

        // Build query filters
        const queryFilters = [];
        if (order_id) {
          // If order_id doesn't contain a slash, assume it's the ID part after the slash
          const fullId = order_id.includes('/') ? order_id : `gid://shopify/Order/${order_id}`;
          queryFilters.push(`id:${fullId}`);
        }
        if (customer_email) {
          queryFilters.push(`email:${customer_email}`);
        }

        // Build variables for the GraphQL query
        const variables: any = {
          first: 1,
          query: queryFilters.join(' ')
        };

        // Use a simplified query focused on customer phone information
        const query = `
          query GetCustomerPhone(
            $first: Int!, 
            $query: String
          ) {
            orders(
              first: $first,
              query: $query
            ) {
              edges {
                node {
                  customer {
                    id
                    email
                    phone
                    firstName
                    lastName
                  }
                  shippingAddress {
                    phone
                  }
                  billingAddress {
                    phone
                  }
                }
              }
            }
          }
        `;

        try {
          // Execute the GraphQL query with parameters
          const response = await server.shopify.clients.Graphql().request(
            query,
            { variables }
          );

          // Handle different response formats
          let orders;
          try {
            if (response.data && response.data.orders && response.data.orders.edges) {
              orders = response.data.orders.edges.map((edge: any) => edge.node);
            } else if (response.orders && response.orders.edges) {
              orders = response.orders.edges.map((edge: any) => edge.node);
            } else {
              throw new Error('Unexpected response format');
            }

            if (orders.length === 0) {
              return {
                content: [{ 
                  type: 'text', 
                  text: `# No Customer Found\n\nNo customer was found matching your criteria.`
                }]
              };
            }

            const order = orders[0];
            const customer = order.customer;
            
            // Get phone number from various possible locations
            const phone = order.shippingAddress?.phone || 
                         order.billingAddress?.phone || 
                         customer?.phone || 
                         'N/A';

            let responseText = `# Customer Phone Information\n\n`;
            
            if (customer) {
              responseText += `**Customer:** ${customer.firstName || ''} ${customer.lastName || ''}\n`;
              responseText += `**Email:** ${customer.email || 'N/A'}\n`;
            }
            
            responseText += `**Phone Number:** ${phone}\n\n`;
            
            // Add source of phone number
            if (phone !== 'N/A') {
              responseText += `*Phone number retrieved from: `;
              if (order.shippingAddress?.phone === phone) {
                responseText += `shipping address`;
              } else if (order.billingAddress?.phone === phone) {
                responseText += `billing address`;
              } else if (customer?.phone === phone) {
                responseText += `customer profile`;
              }
              responseText += `*`;
            }

            return {
              content: [{ type: 'text', text: responseText }]
            };

          } catch (error: any) {
            console.error('Error processing customer phone response:', error);
            return {
              content: [{ 
                type: 'text', 
                text: `# Error Processing Customer Phone\n\nThere was an error processing the response: ${error.message}` 
              }]
            };
          }
        } catch (error: any) {
          console.error('Error executing customer phone query:', error);
          return {
            content: [{ 
              type: 'text', 
              text: `# Error Executing Customer Phone Query\n\n${error.message}` 
            }]
          };
        }
      } catch (error: any) {
        console.error('Error in get_customer_phone tool:', error);
        return {
          content: [{ 
            type: 'text', 
            text: `# Error in Get Customer Phone Tool\n\n${error.message}` 
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