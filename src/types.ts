import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface ShopifyServer extends McpServer {
  shopify: {
    clients: {
      Graphql: () => {
        request: (query: string, options: any) => Promise<any>;
      };
    };
    config: {
      apiVersion: string;
      hostName: string;
    };
  };
} 