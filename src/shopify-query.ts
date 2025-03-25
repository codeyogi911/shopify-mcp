import { z } from 'zod';
import { Session } from '@shopify/shopify-api';
import { parse } from 'graphql';

/**
 * Register a tool for querying the Shopify GraphQL API
 */
export function registerQueryTool(server: any, session: Session) {
  server.tool(
    'query_shopify',
    {
      query: z.string().describe('The GraphQL query or mutation to execute'),
      variables: z.record(z.any()).optional().describe('Optional: Variables for the GraphQL query'),
      allow_mutations: z.boolean().optional().default(false).describe('Optional: Set to true to allow mutation operations')
    },
    async ({ query, variables, allow_mutations = false }: { 
      query: string, 
      variables?: Record<string, any>, 
      allow_mutations?: boolean 
    }) => {
      try {
        // Parse the query to validate it and check if it's a mutation
        const parsedQuery = parse(query);

        // Check if the query is a mutation
        const isMutation = parsedQuery.definitions.some(
          (def: any) =>
            def.kind === 'OperationDefinition' && def.operation === 'mutation',
        );

        if (isMutation && !allow_mutations) {
          return {
            content: [{ 
              type: 'text', 
              text: '# Error: Mutations Not Allowed\n\nMutations are not allowed unless you enable them by setting allow_mutations=true. Please use a query operation instead.' 
            }]
          };
        }

        console.error(`Executing GraphQL ${isMutation ? 'mutation' : 'query'}`);
        
        // Create a client for the Admin GraphQL API
        const client = new server.shopify.clients.Graphql({
          session
        });
        
        // Execute the GraphQL query using the client
        const response = await client.request(
          query,
          { variables }
        );
        
        // Format the response
        const formattedResponse = JSON.stringify(response, null, 2);
        
        return {
          content: [{ 
            type: 'text', 
            text: `# Shopify GraphQL Response\n\n\`\`\`json\n${formattedResponse}\n\`\`\`` 
          }]
        };
      } catch (error: any) {
        console.error('Error executing GraphQL query:', error);
        
        // Determine if it's a GraphQL validation error or a runtime error
        const errorMessage = error.message || String(error);
        const isValidationError = errorMessage.includes('Syntax Error') || 
                                errorMessage.includes('Cannot query field');
        
        return {
          content: [{ 
            type: 'text', 
            text: `# Error Executing GraphQL ${isValidationError ? 'Query' : 'Request'}\n\n${errorMessage}\n\n${error.stack ? `Stack trace:\n\`\`\`\n${error.stack}\n\`\`\`` : ''}` 
          }]
        };
      }
    }
  );
} 