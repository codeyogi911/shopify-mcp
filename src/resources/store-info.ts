import { ShopifyServer } from '../types.js';

export function registerStoreInfoResource(server: ShopifyServer) {
  server.resource('store-info', 'shopify://store-info', async (uri) => {
    try {
      const client = server.shopify.clients.Graphql();
      
      const query = `
        query {
          shop {
            name
            email
            myshopifyDomain
            plan {
              displayName
            }
            primaryDomain {
              url
            }
            currencyCode
            weightUnit
            billingAddress {
              address1
              city
              province
              zip
              country
            }
            createdAt
            updatedAt
          }
        }
      `;

      const response = await client.request(query, {});
      const shop = response.data.shop;

      return {
        contents: [{
          uri: uri.href,
          text: `# Store Information

## Basic Information
- **Store Name**: ${shop.name}
- **Email**: ${shop.email}
- **Domain**: ${shop.myshopifyDomain}
- **Primary Domain**: ${shop.primaryDomain.url}
- **Plan**: ${shop.plan.displayName}

## Store Settings
- **Currency**: ${shop.currencyCode}
- **Weight Unit**: ${shop.weightUnit}

## Billing Address
${shop.billingAddress.address1}
${shop.billingAddress.city}, ${shop.billingAddress.province} ${shop.billingAddress.zip}
${shop.billingAddress.country}

## Dates
- **Created**: ${new Date(shop.createdAt).toLocaleString()}
- **Last Updated**: ${new Date(shop.updatedAt).toLocaleString()}`
        }]
      };
    } catch (error) {
      console.error('Error fetching store information:', error);
      return {
        contents: [{
          uri: uri.href,
          text: `# Error Loading Store Information

There was an error loading the store information: ${(error as Error).message}

Please try again later or contact the administrator.`
        }]
      };
    }
  });
}
