import { z } from 'zod';
import { ShopifyServer } from '../types.js';

// Define the tool handlers for Shopify products and inventory
export function registerProductTools(server: ShopifyServer) {

  // Tool for creating a product structure with options (always in DRAFT status)
  server.tool(
    'create_product',
    'Create a product structure with options (e.g., Color, Size) in DRAFT status. Does not create variants with prices. Use productVariantsBulkCreate for that.', 
    {
      name: z.string().describe('The name (title) of the product'),
      description: z.string().optional().describe('Product description (HTML is supported)'),
      vendor: z.string().optional().describe('Product vendor name'),
      product_type: z.string().optional().describe('The category or type of the product'),
      tags: z.string().optional().describe('Comma-separated list of tags for the product'),
      options: z.string().optional().describe('Product options formatted as "OptionName1:Value1,Value2;OptionName2:ValueA,ValueB"'),
      media_url: z.string().url().optional().describe('URL of the primary image for the product'),
    },
    async ({ 
      name, 
      description = '', 
      vendor = '', 
      product_type,
      tags,
      options,
      media_url
    }) => {
      try {
        const client = server.shopify.clients.Graphql();
        
        // 1. Parse the options string into the required structure
        const productOptions: { name: string; values: { name: string }[] }[] = [];
        if (options) {
          const optionPairs = options.split(';');
          for (const pair of optionPairs) {
            const [optionName, valuesString] = pair.split(':');
            if (optionName && valuesString) {
              const values = valuesString.split(',').map(v => ({ name: v.trim() }));
              if (values.length > 0) {
                 productOptions.push({ name: optionName.trim(), values });
              }
            }
          }
        }

        // 2. Build the main product input object
        const productInput: any = {
          title: name,
          descriptionHtml: description,
          vendor: vendor,
          status: 'DRAFT',
          ...(productOptions.length > 0 && { productOptions: productOptions })
        };

        // Add optional fields to productInput
        if (product_type) {
          productInput.productType = product_type;
        }
        if (tags) {
          productInput.tags = tags.split(',').map(tag => tag.trim());
        }

        // 3. Build the media input array (only if media_url exists)
        let mediaInput: any[] | null = null;
        if (media_url) {
          mediaInput = [{ mediaContentType: 'IMAGE', originalSource: media_url }];
        }

        // 4. Update the mutation string
        const mutation = `
          mutation createProductWithOptions($product: ProductCreateInput!, $media: [CreateMediaInput!]) { 
            productCreate(product: $product, media: $media) { 
              product {
                id
                title
                descriptionHtml
                status
                vendor
                productType
                tags
                options { 
                  id
                  name
                  position
                  optionValues {
                    id
                    name
                  }
                }
                media(first: 1) { 
                  edges {
                    node {
                      id
                      status
                      mediaContentType
                      preview {
                        image {
                          url
                        }
                      }
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

        // 5. Prepare variables for the request
        const variables: { product: any; media?: any[] } = {
          product: productInput,
        };
        if (mediaInput) {
          variables.media = mediaInput;
        }

        // 6. Execute the request
        const response = await client.request(mutation, { variables });

        if (response.data?.productCreate?.userErrors?.length > 0) {
          const errors = response.data.productCreate.userErrors
            .map((error: any) => `${error.field ? error.field.join(', ') : 'General'}: ${error.message}`)
            .join('\n');
          return {
            content: [{ type: 'text', text: `# Error Creating Product\n\n${errors}` }]
          };
        }

        const product = response.data?.productCreate?.product;
        if (!product) {
          throw new Error('Product creation failed - no product data returned');
        }

        const mediaItem = product.media?.edges[0]?.node;

        let responseText = `# Product Structure Created (Status: ${product.status})\n\n`;
        responseText += `**ID:** ${product.id.split('/').pop()}\n`;
        responseText += `**Title:** ${product.title}\n`;
        responseText += `**Vendor:** ${product.vendor || 'N/A'}\n`;
        responseText += `**Product Type:** ${product.productType || 'N/A'}\n`;
        responseText += `**Tags:** ${product.tags?.join(', ') || 'N/A'}\n`;
        
        if (product.options && product.options.length > 0) {
          responseText += `\n### Product Options Created\n`;
          product.options.forEach((option: any) => {
             responseText += `- **${option.name} (ID: ${option.id.split('/').pop()})**\n`;
             if (option.optionValues && option.optionValues.length > 0) {
                const values = option.optionValues.map((v: any) => `${v.name} (ID: ${v.id.split('/').pop()})`).join(', ');
                responseText += `  - Values: ${values}\n`;
             }
          });
        } else {
            responseText += `\n*No product options were specified or created.*\n`;
        }
        
        if (mediaItem) {
          responseText += `\n### Media\n`;
          responseText += `**Media ID:** ${mediaItem.id.split('/').pop()}\n`;
          responseText += `**Status:** ${mediaItem.status}\n`;
          responseText += `**Type:** ${mediaItem.mediaContentType}\n`;
          if (mediaItem.preview?.image?.url) {
            responseText += `**Preview:** ${mediaItem.preview.image.url}\n`;
          }
        }
        
        responseText += `\n## Description\n\n${product.descriptionHtml || 'No description provided.'}\n`;
        responseText += `\n*Note: This tool only creates the product structure. Use other tools/mutations (like productVariantsBulkCreate) to create specific variants based on these options.*`;

        return {
          content: [{ type: 'text', text: responseText }]
        };
      } catch (error: any) {
        console.error('Error creating product:', error);
        let errorMessage = error.message;
        if (error.response?.errors) {
            errorMessage = error.response.errors.map((err: any) => err.message).join(', ');
        } else if (typeof error === 'string' && error.includes("GraphQL errors:")) {
           try {
             const parsedError = JSON.parse(error.substring(error.indexOf('[')));
             errorMessage = parsedError.map((err: any) => err.message).join(', ');
           } catch (parseError) {
              // Stick with original message if parsing fails
           }
        }
        return {
          content: [{ type: 'text', text: `# Error\n\nFailed to create product: ${errorMessage}` }]
        };
      }
    }
  );

  // Create a combined tool for browsing products with inventory information
  server.tool(
    'browse_products',
    'Browse products with inventory information',
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
          return await getProductDetails(server, product_id);
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
        const client = server.shopify.clients.Graphql();
        
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
        
        // Execute the GraphQL query with simple parameters
        const response = await client.request(query, {
          variables: { first: parseInt(String(limit)) || 10 }
        });
        
        console.error('Products API response received, type:', typeof response);
        
        // Handle different response formats
        let products;
        try {
          // Try different possible response structures
          if (response.data && response.data.products && response.data.products.edges) {
            products = response.data.products.edges.map((edge: any) => edge.node);
          } else if (response.products && response.products.edges) {
            products = response.products.edges.map((edge: any) => edge.node);
          } else {
            throw new Error('Unexpected response format');
          }
          
          console.error(`Retrieved ${products.length} products`);
          
          if (products.length === 0) {
            return {
              content: [{ 
                type: 'text', 
                text: `# No Products Found\n\nNo products were found in your Shopify store.`
              }]
            };
          }
        } catch (formatError) {
          console.error('Error extracting products:', formatError);
          return {
            content: [{ 
              type: 'text', 
              text: `# Error\n\nFailed to retrieve products: ${formatError instanceof Error ? formatError.message : String(formatError)}\n\nPlease try again with a smaller number of products (e.g., 3 instead of 5).`
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

  // Tool to add a single variant to an existing product
  server.tool(
    'add_product_variant',
    'Adds a new variant (combination of options like color/size) with its price to an existing product.',
    {
      product_id: z.string().describe('The Global ID (GID) of the product to add the variant to (e.g., \'gid://shopify/Product/12345\')'),
      // Update description to emphasize order requirement
      option_values: z.string().describe('Comma-separated list of the option values for this specific variant, **in the exact order** they appear on the product (e.g., \'Red,Small\' for options Color then Size).'),
      price: z.string().describe('The price for this new variant.'),
      sku: z.string().optional().describe('Optional Stock Keeping Unit (SKU) for this variant.'),
      compare_at_price: z.string().optional().describe('Optional compare-at price for this variant.'),
    },
    async ({ product_id, option_values, price, sku, compare_at_price }) => {
      try {
        const client = server.shopify.clients.Graphql();

        // --- Step 1: Fetch Product Option Names ---
        const productOptionsQuery = `
          query getProductOptions($id: ID!) {
            product(id: $id) {
              options(first: 10) { # Assuming max 10 options
                name
              }
            }
          }
        `;
        const optionsResponse = await client.request(productOptionsQuery, { variables: { id: product_id } });
        
        const productOptions = optionsResponse.data?.product?.options;
        if (!productOptions || !Array.isArray(productOptions)) {
          throw new Error(`Could not fetch options for product ID ${product_id}. Ensure the ID is correct and the product exists.`);
        }
        const optionNames = productOptions.map((opt: any) => opt.name);
        // --- End Step 1 ---

        // Parse the comma-separated option values provided by the user
        const providedValues = option_values.split(',').map(opt => opt.trim());
        if (providedValues.some(opt => !opt)) {
            throw new Error('Invalid option_values format. Ensure values are comma-separated and not empty.');
        }

        // Validate if the number of provided values matches the number of product options
        if (providedValues.length !== optionNames.length) {
          throw new Error(`Mismatch between provided option values (${providedValues.length}) and product options (${optionNames.length}). Expected values for options: ${optionNames.join(', ')}.`);
        }

        // --- Step 2: Construct the optionValues input array ---
        const optionValuesInput = providedValues.map((value, index) => ({
          name: value,
          optionName: optionNames[index] // Match value with option name by order
        }));
        // --- End Step 2 ---


        // Construct the single variant input for the bulk mutation
        const variantInput = {
          price: price,
          optionValues: optionValuesInput, // Use the structured input
          ...(sku && { sku: sku }),
          ...(compare_at_price && { compareAtPrice: compare_at_price })
          // Note: Inventory needs to be set separately after creation
        };

        const mutation = `
          mutation ProductVariantAdd($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkCreate(productId: $productId, variants: $variants) {
              productVariants {
                id
                title
                price
                compareAtPrice
                sku
                selectedOptions {
                  name
                  value
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const variables = {
          productId: product_id,
          variants: [variantInput] // Pass the single variant in an array
        };

        const response = await client.request(mutation, { variables });

        if (response.data?.productVariantsBulkCreate?.userErrors?.length > 0) {
          const errors = response.data.productVariantsBulkCreate.userErrors
            .map((error: any) => `${error.field ? error.field.join(', ') : 'General'}: ${error.message}`)
            .join('\n');
          return {
            content: [{ type: 'text', text: `# Error Adding Variant\n\n${errors}` }]
          };
        }

        const createdVariants = response.data?.productVariantsBulkCreate?.productVariants;
        if (!createdVariants || createdVariants.length === 0) {
          throw new Error('Variant creation using bulk mutation failed - no variant data returned.');
        }

        const newVariant = createdVariants[0]; // Get the first (and only) variant created

        let responseText = `# Variant Added Successfully\n\n`;
        responseText += `**Product ID:** ${product_id.split('/').pop()}\n`;
        responseText += `**Variant ID:** ${newVariant.id.split('/').pop()}\n`;
        responseText += `**Title:** ${newVariant.title}\n`; // Title is usually combination of options
        responseText += `**Price:** ${newVariant.price}\n`;
        if (newVariant.compareAtPrice) {
            responseText += `**Compare At Price:** ${newVariant.compareAtPrice}\n`;
        }
        responseText += `**SKU:** ${newVariant.sku || 'N/A'}\n`;
        responseText += `**Options:** ${newVariant.selectedOptions.map((opt: any) => `${opt.name}: ${opt.value}`).join(', ')}\n`;
        responseText += `\n*Note: Inventory for this variant needs to be set separately.*`;

        return {
          content: [{ type: 'text', text: responseText }]
        };

      } catch (error: any) {
        console.error('Error adding product variant:', error);
        let errorMessage = error.message;
        // Extract GraphQL errors if available
        if (error.graphQLErrors && error.graphQLErrors.length > 0) {
            errorMessage = error.graphQLErrors.map((err: any) => err.message).join(', ');
        } else if (error.response?.errors) {
            errorMessage = error.response.errors.map((err: any) => err.message).join(', ');
        } else if (typeof error === 'string' && error.includes("GraphQL errors:")) {
           try {
             const parsedError = JSON.parse(error.substring(error.indexOf('[')));
             errorMessage = parsedError.map((err: any) => err.message).join(', ');
           } catch (parseError) { /* Stick with original */ }
        }
        return {
          content: [{ type: 'text', text: `# Error\n\nFailed to add variant: ${errorMessage}` }]
        };
      }
    }
  );

  // Tool to update the price of a single product variant
  server.tool(
    'update_variant_price',
    'Updates the price and/or compare-at price of a specific product variant.',
    {
      variant_id: z.string().describe('The Global ID (GID) of the product variant to update (e.g., \'gid://shopify/ProductVariant/98765\')'),
      new_price: z.string().optional().describe('The new price for the variant. If omitted, price is unchanged.'),
      // Use coerce for compare_at_price to allow null or empty string for removal
      new_compare_at_price: z.coerce.string().nullable().optional().describe('The new compare-at price. Send null or empty string to remove it. If omitted, compare-at price is unchanged.'),
    },
    async ({ variant_id, new_price, new_compare_at_price }) => {
      // Basic validation: Ensure at least one price is being updated
      if (new_price === undefined && new_compare_at_price === undefined) {
          return {
              content: [{ type: 'text', text: `# Error\n\nPlease provide at least new_price or new_compare_at_price.` }]
          };
      }
      
      try {
        const client = server.shopify.clients.Graphql();

        // Construct the input for the productVariantUpdate mutation
        const variantInput: { id: string; price?: string; compareAtPrice?: string | null } = {
          id: variant_id,
        };

        if (new_price !== undefined) {
            variantInput.price = new_price;
        }
        // Handle setting compareAtPrice to null if empty string provided, otherwise use the value
        if (new_compare_at_price !== undefined) { 
             variantInput.compareAtPrice = (new_compare_at_price === '' || new_compare_at_price === null) ? null : new_compare_at_price;
        }

        const mutation = `
          mutation ProductVariantUpdate($input: ProductVariantInput!) {
            productVariantUpdate(input: $input) {
              productVariant {
                id
                title
                price
                compareAtPrice
                sku
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const variables = { input: variantInput };

        const response = await client.request(mutation, { variables });

        if (response.data?.productVariantUpdate?.userErrors?.length > 0) {
          const errors = response.data.productVariantUpdate.userErrors
            .map((error: any) => `${error.field ? error.field.join(', ') : 'General'}: ${error.message}`)
            .join('\n');
          return {
            content: [{ type: 'text', text: `# Error Updating Variant Price\n\n${errors}` }]
          };
        }

        const updatedVariant = response.data?.productVariantUpdate?.productVariant;
        if (!updatedVariant) {
          throw new Error('Variant price update failed - no variant data returned.');
        }

        let responseText = `# Variant Price Updated Successfully\n\n`;
        responseText += `**Variant ID:** ${updatedVariant.id.split('/').pop()}\n`;
        responseText += `**Title:** ${updatedVariant.title}\n`;
        responseText += `**New Price:** ${updatedVariant.price}\n`;
        responseText += `**New Compare At Price:** ${updatedVariant.compareAtPrice || 'N/A'}\n`;
        responseText += `**SKU:** ${updatedVariant.sku || 'N/A'}\n`;

        return {
          content: [{ type: 'text', text: responseText }]
        };

      } catch (error: any) {
        console.error('Error updating variant price:', error);
        let errorMessage = error.message;
        // Extract GraphQL errors if available
        if (error.graphQLErrors && error.graphQLErrors.length > 0) {
            errorMessage = error.graphQLErrors.map((err: any) => err.message).join(', ');
        } else if (error.response?.errors) {
            errorMessage = error.response.errors.map((err: any) => err.message).join(', ');
        } else if (typeof error === 'string' && error.includes("GraphQL errors:")) {
           try {
             const parsedError = JSON.parse(error.substring(error.indexOf('[')));
             errorMessage = parsedError.map((err: any) => err.message).join(', ');
           } catch (parseError) { /* Stick with original */ }
        }
        return {
          content: [{ type: 'text', text: `# Error\n\nFailed to update variant price: ${errorMessage}` }]
        };
      }
    }
  );
}

// Helper function to get detailed information about a specific product
async function getProductDetails(server: ShopifyServer, id: string): Promise<any> {
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
    
    // Get the GraphQL client
    const client = server.shopify.clients.Graphql();
    
    // Execute the GraphQL query for product details with inventory
    const response = await client.request(
      `
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
      { variables: { id: fullId } }
    );
    
    console.error('Product details API response received, type:', typeof response);
    
    // Handle different response formats
    let product;
    if (response.data && response.data.product) {
      product = response.data.product;
    } else if (response.product) {
      product = response.product;
    } else {
      console.error('Product not found in response data');
      return {
        content: [{ 
          type: 'text', 
          text: `# Product Not Found\n\nNo product with ID '${id}' was found in your Shopify store.`
        }]
      };
    }
    
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