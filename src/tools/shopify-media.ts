import { z } from 'zod';
import { ShopifyServer } from '../types.js';
import path from 'path'; // Needed for extracting filename

// Define tool handlers for Shopify media
export function registerMediaTools(server: ShopifyServer) {

  // Tool for uploading an image from a URL
  server.tool(
    'upload_image_from_url',
    'This tool uploads an image from a public URL to the Shopify CDN Files section. It handles the transfer of image data to Shopify\'s servers, allowing you to specify alt text and optional filename for the uploaded image.',
    {
      image_url: z.string().url().describe('The public URL of the image to upload.'),
      alt_text: z.string().optional().describe('Descriptive alt text for the image.'),
      // Attempt to extract filename from URL if not provided
      filename: z.string().optional().describe('Optional filename for the uploaded image in Shopify Files.'),
    },
    async ({ image_url, alt_text, filename }) => {
      try {
        const client = server.shopify.clients.Graphql();

        // If filename is not provided, try to extract it from the URL
        if (!filename) {
          try {
            const parsedUrl = new URL(image_url);
            filename = path.basename(parsedUrl.pathname);
            // Basic sanitization: remove query params if present in basename
            filename = filename.split('?')[0]; 
            if (!filename) { // Fallback if basename is empty
                filename = 'uploaded_image';
            }
          } catch (urlError) {
            console.warn(`Could not parse URL to extract filename: ${urlError}`);
            filename = 'uploaded_image'; // Default filename if URL parsing fails
          }
        }

        // Construct the input for the fileCreate mutation
        const input = {
          files: [{
            alt: alt_text,
            contentType: 'IMAGE', // Assuming image, Shopify will validate
            originalSource: image_url,
            filename: filename, 
          }],
        };

        const mutation = `
          mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
              files {
                # File details
                id
                alt
                createdAt
                fileStatus
                ... on MediaImage { # Specific fields for images
                  id
                  image {
                    id
                    url
                    altText
                    width
                    height
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

        const response = await client.request(mutation, { variables: input });

        if (response.data?.fileCreate?.userErrors?.length > 0) {
          const errors = response.data.fileCreate.userErrors
            .map((error: any) => `${error.field ? error.field.join(', ') : 'General'}: ${error.message}`)
            .join('\n');
          return {
            content: [{ type: 'text', text: `# Error Uploading Image\n\n${errors}` }]
          };
        }

        const uploadedFiles = response.data?.fileCreate?.files;
        if (!uploadedFiles || uploadedFiles.length === 0) {
          throw new Error('Image upload failed - no file data returned. Shopify might have rejected the URL or file type.');
        }

        const file = uploadedFiles[0]; // Assuming only one file is uploaded per call

        // Format the response
        let responseText = `# Image Uploaded Successfully\n\n`;
        responseText += `**File ID:** ${file.id}\n`;
        responseText += `**Status:** ${file.fileStatus}\n`;
        responseText += `**Created At:** ${new Date(file.createdAt).toLocaleString()}\n`;
        
        // Access image-specific details if available
        if (file.image) { 
            responseText += `**Image URL:** ${file.image.url}\n`;
            responseText += `**Alt Text:** ${file.image.altText || alt_text || 'N/A'}\n`; // Use returned alt text first
            responseText += `**Dimensions:** ${file.image.width}x${file.image.height}\n`;
        } else {
            // Fallback for non-image files or if image details aren't returned as expected
            responseText += `**Alt Text:** ${file.alt || alt_text || 'N/A'}\n`;
            responseText += `(Image details like URL might still be processing or unavailable for this file type)\n`;
        }

        responseText += `\nYou can manage this file in your Shopify Admin under Content > Files.`;

        return {
          content: [{ type: 'text', text: responseText }]
        };

      } catch (error: any) {
        console.error('Error uploading image from URL:', error);
        let errorMessage = error.message;
        // Basic error message extraction
        if (error.response?.errors) {
          errorMessage = error.response.errors.map((err: any) => err.message).join(', ');
        } else if (typeof error === 'string' && error.includes("GraphQL errors:")) {
          try {
            const parsedError = JSON.parse(error.substring(error.indexOf('[')));
            errorMessage = parsedError.map((err: any) => err.message).join(', ');
          } catch (parseError) { /* Stick with original */ }
        }
        return {
          content: [{ type: 'text', text: `# Error\n\nFailed to upload image: ${errorMessage}` }]
        };
      }
    }
  );
  
  // You can add more media-related tools here later

} 