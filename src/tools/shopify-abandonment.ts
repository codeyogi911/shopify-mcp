import { z } from 'zod';
import { ShopifyServer } from '../types.js';

// Define types for abandonment data
interface AbandonmentFields {
  id?: boolean;
  abandonedAt?: boolean;
  abandonmentType?: boolean;
  anonymousAccessToken?: boolean;
  app?: {
    id?: boolean;
    title?: boolean;
    type?: boolean;
  };
  customer?: {
    id?: boolean;
    email?: boolean;
    firstName?: boolean;
    lastName?: boolean;
  };
  lastVisit?: {
    landingPage?: boolean;
    landingPageHtml?: boolean;
    occurredAt?: boolean;
    referrerUrl?: boolean;
    sourceType?: boolean;
    userAgent?: boolean;
  };
  totalItems?: boolean;
  totalPrice?: {
    amount?: boolean;
    currencyCode?: boolean;
  };
}

const DEFAULT_ABANDONMENT_FIELDS: AbandonmentFields = {
  id: true,
  abandonedAt: true,
  abandonmentType: true,
  totalItems: true,
  totalPrice: {
    amount: true,
    currencyCode: true
  }
};

/**
 * Builds a GraphQL query for abandonment details based on specified fields
 */
function buildAbandonmentQuery(id: string, fields: AbandonmentFields = DEFAULT_ABANDONMENT_FIELDS): string {
  const buildFieldString = (obj: Record<string, any>, indent: number = 2): string => {
    return Object.entries(obj)
      .filter(([_, value]) => value !== undefined && value !== false)
      .map(([key, value]) => {
        if (typeof value === 'object') {
          return `${' '.repeat(indent)}${key} {\n${buildFieldString(value, indent + 2)}\n${' '.repeat(indent)}}`;
        }
        return `${' '.repeat(indent)}${key}`;
      })
      .join('\n');
  };

  return `
    query {
      abandonment(id: "${id}") {
${buildFieldString(fields)}
      }
    }
  `;
}

/**
 * Retrieves abandonment details from Shopify
 */
async function getAbandonment(server: ShopifyServer, id: string, fields?: AbandonmentFields) {
  const query = buildAbandonmentQuery(id, fields);
  
  try {
    const response = await server.shopify.clients.Graphql().request(query, {});
    return response.data.abandonment;
  } catch (error) {
    console.error('Error fetching abandonment details:', error);
    throw error;
  }
}

/**
 * Register abandonment tools with the server
 */
export function registerAbandonmentTools(server: ShopifyServer) {
  
  // Tool for getting abandonment details by ID
  server.tool(
    'get_abandonment',
    'This tool retrieves detailed information about cart or checkout abandonments by ID. It returns data about abandoned carts including items, prices, customer information (if available), and abandonment timing. You can customize which fields are returned in the response.',
    {
      id: z.string().describe('The ID of the abandonment to retrieve'),
      fields: z.object({}).passthrough().optional().describe('Optional. Specific fields to retrieve. If not provided, default fields will be fetched.')
    },
    async ({ id, fields }) => {
      try {
        const result = await getAbandonment(server, id, fields);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (error: any) {
        console.error('Error in get_abandonment:', error);
        let errorMessage = error.message;
        if (error.response?.errors) {
          errorMessage = error.response.errors.map((err: any) => err.message).join(', ');
        }
        return {
          content: [{ type: 'text', text: `# Error\n\nFailed to get abandonment details: ${errorMessage}` }]
        };
      }
    }
  );
} 