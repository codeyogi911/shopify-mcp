import { z } from 'zod';

// Define the tool handler for Shopify customers
export function registerCustomerTools(server: any) {
  // Create a tool for browsing customers and their spend
  server.tool(
    'browse_customers',
    {
      limit: z.number().optional().describe('Number of customers to retrieve (default: 10)'),
      customer_id: z.string().optional().describe('ID of a specific customer to view (overrides limit)'),
      min_spend: z.number().optional().describe('Minimum total spend to filter customers (in store currency)'),
      max_spend: z.number().optional().describe('Maximum total spend to filter customers (in store currency)'),
      sort_by: z.enum(['CREATED_AT', 'ID', 'LOCATION', 'NAME', 'RELEVANCE', 'UPDATED_AT'])
        .optional()
        .default('CREATED_AT')
        .describe('Sort customers by: CREATED_AT (creation date), ID, LOCATION, NAME, RELEVANCE (for search), or UPDATED_AT (last update)'),
      sort_order: z.enum(['asc', 'desc']).optional().default('desc')
        .describe('Sort order: asc (ascending) or desc (descending)')
    },
    async ({ 
      limit = 10, 
      customer_id,
      min_spend,
      max_spend,
      sort_by = 'CREATED_AT',
      sort_order = 'desc'
    }: { 
      limit?: number, 
      customer_id?: string,
      min_spend?: number,
      max_spend?: number,
      sort_by?: 'CREATED_AT' | 'ID' | 'LOCATION' | 'NAME' | 'RELEVANCE' | 'UPDATED_AT',
      sort_order?: 'asc' | 'desc'
    }) => {
      try {
        // If a customer ID is provided, get specific customer details
        if (customer_id) {
          return await getCustomerDetails(server, customer_id);
        }

        console.error('Browse customers tool called');
        console.error(`Requesting ${limit} customers with spend filters: min=${min_spend}, max=${max_spend}`);
        
        // Check if limit is valid
        if (limit <= 0 || limit > 50) {
          console.error(`Invalid limit: ${limit}`);
          return {
            content: [{ 
              type: 'text', 
              text: `# Invalid Request\n\nPlease specify a limit between 1 and 50 customers.`
            }]
          };
        }

        // Create a client for the Admin GraphQL API
        const client = server.shopify.clients.Graphql();
        
        // Execute the GraphQL query
        const response = await client.request(
          `
          query GetCustomers($first: Int!, $sortKey: CustomerSortKeys!, $reverse: Boolean!) {
            customers(first: $first, sortKey: $sortKey, reverse: $reverse) {
              edges {
                node {
                  id
                  firstName
                  lastName
                  email
                  phone
                  amountSpent {
                    amount
                    currencyCode
                  }
                  numberOfOrders
                  lastOrder {
                    id
                    createdAt
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
                  createdAt
                  updatedAt
                }
              }
            }
          }
          `,
          { 
            variables: { 
              first: limit,
              sortKey: sort_by,
              reverse: sort_order === 'desc'
            }
          }
        );

        // Process and format the response
        let responseText = '# Customer Information\n\n';
        
        const customers = response.data.customers.edges.map((edge: any) => edge.node);
        
        // Filter by spend if specified
        let filteredCustomers = customers;
        if (min_spend !== undefined) {
          filteredCustomers = filteredCustomers.filter((c: any) => 
            parseFloat(c.amountSpent.amount) >= min_spend
          );
        }
        if (max_spend !== undefined) {
          filteredCustomers = filteredCustomers.filter((c: any) => 
            parseFloat(c.amountSpent.amount) <= max_spend
          );
        }

        if (filteredCustomers.length === 0) {
          responseText += 'No customers found matching the specified criteria.\n';
        } else {
          filteredCustomers.forEach((customer: any) => {
            responseText += `## ${customer.firstName} ${customer.lastName}\n`;
            responseText += `**ID:** ${customer.id.split('/').pop()}\n`;
            responseText += `**Email:** ${customer.email || 'N/A'}\n`;
            responseText += `**Phone:** ${customer.phone || 'N/A'}\n`;
            responseText += `**Total Spent:** ${customer.amountSpent.amount} ${customer.amountSpent.currencyCode}\n`;
            responseText += `**Orders:** ${customer.numberOfOrders}\n`;
            
            if (customer.lastOrder) {
              responseText += `**Last Order:** ${new Date(customer.lastOrder.createdAt).toLocaleDateString()}\n`;
            }
            
            if (customer.defaultAddress) {
              responseText += '\n### Default Address\n';
              const addressParts = [
                customer.defaultAddress.address1,
                customer.defaultAddress.address2,
                customer.defaultAddress.city,
                customer.defaultAddress.province,
                customer.defaultAddress.country,
                customer.defaultAddress.zip
              ].filter(Boolean);
              
              responseText += `**Address:** ${addressParts.join(', ')}\n`;
              if (customer.defaultAddress.phone) {
                responseText += `**Phone:** ${customer.defaultAddress.phone}\n`;
              }
            }
            
            responseText += `\n**Customer Since:** ${new Date(customer.createdAt).toLocaleDateString()}\n\n`;
          });
        }

        return {
          content: [{ 
            type: 'text', 
            text: responseText
          }]
        };
      } catch (error: any) {
        console.error('Error fetching customer information:', error);
        return {
          content: [{ 
            type: 'text', 
            text: `# Error Fetching Customer Information\n\n${error.message || String(error)}`
          }]
        };
      }
    }
  );
}

// Helper function to get detailed information about a specific customer
async function getCustomerDetails(server: any, id: string): Promise<any> {
  try {
    if (!id || id.trim() === '') {
      console.error('Empty customer ID provided');
      return {
        content: [{ 
          type: 'text', 
          text: `# Error\n\nPlease provide a valid customer ID.`
        }]
      };
    }
    
    // If the ID doesn't contain a slash, assume it's the ID part after the slash
    let fullId = id;
    if (!id.includes('/')) {
      fullId = `gid://shopify/Customer/${id}`;
      console.error(`Converted ID to: ${fullId}`);
    }
    
    // Get the GraphQL client
    const client = server.shopify.clients.Graphql();
    
    // Execute the GraphQL query for customer details
    const response = await client.request(
      `
      query GetCustomer($id: ID!) {
        customer(id: $id) {
          id
          firstName
          lastName
          email
          phone
          amountSpent {
            amount
            currencyCode
          }
          numberOfOrders
          lastOrder {
            id
            createdAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
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
          addresses {
            address1
            address2
            city
            province
            country
            zip
            phone
          }
          createdAt
          updatedAt
          orders(first: 5) {
            edges {
              node {
                id
                name
                createdAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                displayFinancialStatus
                displayFulfillmentStatus
              }
            }
          }
        }
      }
      `,
      { variables: { id: fullId } }
    );

    const customer = response.data.customer;
    if (!customer) {
      return {
        content: [{ 
          type: 'text', 
          text: `# Error\n\nCustomer not found.`
        }]
      };
    }

    let responseText = `# Customer Details: ${customer.firstName} ${customer.lastName}\n\n`;
    responseText += `**ID:** ${customer.id.split('/').pop()}\n`;
    responseText += `**Email:** ${customer.email || 'N/A'}\n`;
    responseText += `**Phone:** ${customer.phone || 'N/A'}\n`;
    responseText += `**Total Spent:** ${customer.amountSpent.amount} ${customer.amountSpent.currencyCode}\n`;
    responseText += `**Orders:** ${customer.numberOfOrders}\n`;
    
    if (customer.lastOrder) {
      responseText += `**Last Order:** ${new Date(customer.lastOrder.createdAt).toLocaleDateString()}\n`;
      responseText += `**Last Order Amount:** ${customer.lastOrder.totalPriceSet.shopMoney.amount} ${customer.lastOrder.totalPriceSet.shopMoney.currencyCode}\n`;
    }
    
    if (customer.defaultAddress) {
      responseText += '\n## Default Address\n\n';
      const addressParts = [
        customer.defaultAddress.address1,
        customer.defaultAddress.address2,
        customer.defaultAddress.city,
        customer.defaultAddress.province,
        customer.defaultAddress.country,
        customer.defaultAddress.zip
      ].filter(Boolean);
      
      responseText += `**Address:** ${addressParts.join(', ')}\n`;
      if (customer.defaultAddress.phone) {
        responseText += `**Phone:** ${customer.defaultAddress.phone}\n`;
      }
    }
    
    if (customer.addresses && customer.addresses.length > 0) {
      responseText += '\n## All Addresses\n\n';
      customer.addresses.forEach((address: any, index: number) => {
        responseText += `### Address ${index + 1}\n\n`;
        const addressParts = [
          address.address1,
          address.address2,
          address.city,
          address.province,
          address.country,
          address.zip
        ].filter(Boolean);
        
        responseText += `**Address:** ${addressParts.join(', ')}\n`;
        if (address.phone) {
          responseText += `**Phone:** ${address.phone}\n`;
        }
        responseText += '\n';
      });
    }
    
    if (customer.orders && customer.orders.edges.length > 0) {
      responseText += '\n## Recent Orders\n\n';
      customer.orders.edges.forEach((edge: any) => {
        const order = edge.node;
        responseText += `### Order ${order.name}\n\n`;
        responseText += `**Date:** ${new Date(order.createdAt).toLocaleDateString()}\n`;
        responseText += `**Amount:** ${order.totalPriceSet.shopMoney.amount} ${order.totalPriceSet.shopMoney.currencyCode}\n`;
        responseText += `**Status:** Payment - ${order.displayFinancialStatus}, Fulfillment - ${order.displayFulfillmentStatus}\n\n`;
      });
    }
    
    responseText += `\n**Customer Since:** ${new Date(customer.createdAt).toLocaleDateString()}\n`;
    responseText += `**Last Updated:** ${new Date(customer.updatedAt).toLocaleDateString()}\n`;

    return {
      content: [{ 
        type: 'text', 
        text: responseText
      }]
    };
  } catch (error: any) {
    console.error('Error fetching customer details:', error);
    return {
      content: [{ 
        type: 'text', 
        text: `# Error Fetching Customer Details\n\n${error.message || String(error)}`
      }]
    };
  }
} 