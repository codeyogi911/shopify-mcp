import { buildClientSchema, getIntrospectionQuery, printSchema } from "graphql";
import { readFile } from "node:fs/promises";

// Custom introspection query that includes all necessary schema information
const CUSTOM_INTROSPECTION_QUERY = `
  query IntrospectSchema {
    __schema {
      queryType {
        name
        fields {
          name
          description
          type {
            ...TypeRef
          }
          args {
            name
            description
            type {
              ...TypeRef
            }
          }
        }
      }
      mutationType {
        name
        fields {
          name
          description
          type {
            ...TypeRef
          }
          args {
            name
            description
            type {
              ...TypeRef
            }
          }
        }
      }
      subscriptionType {
        name
        fields {
          name
          description
          type {
            ...TypeRef
          }
          args {
            name
            description
            type {
              ...TypeRef
            }
          }
        }
      }
      types {
        ...Type
      }
      directives {
        name
        description
        locations
        args {
          name
          description
          type {
            ...TypeRef
          }
        }
      }
    }
  }

  fragment TypeRef on __Type {
    name
    kind
    ofType {
      name
      kind
      ofType {
        name
        kind
        ofType {
          name
          kind
        }
      }
    }
  }

  fragment Type on __Type {
    name
    description
    kind
    fields {
      name
      description
      type {
        ...TypeRef
      }
      args {
        name
        description
        type {
          ...TypeRef
        }
      }
    }
    inputFields {
      name
      description
      type {
        ...TypeRef
      }
    }
    interfaces {
      name
      kind
      ofType {
        name
        kind
      }
    }
    enumValues {
      name
      description
    }
    possibleTypes {
      name
      kind
      ofType {
        name
        kind
      }
    }
  }
`;

/**
 * Introspect a GraphQL endpoint and return the schema as the GraphQL SDL
 * @param endpoint - The endpoint to introspect
 * @returns The schema
 */
export async function introspectEndpoint(
	endpoint: string,
	headers?: Record<string, string>,
) {
	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...headers,
			},
			body: JSON.stringify({
				query: CUSTOM_INTROSPECTION_QUERY,
			}),
		});

		if (!response.ok) {
			throw new Error(`GraphQL request failed: ${response.statusText}`);
		}

		const responseJson = await response.json();
		// Transform to a schema object
		const schema = buildClientSchema(responseJson.data);

		// Print the schema SDL
		return printSchema(schema);
	} catch (error) {
		console.error('Error during schema introspection:', error);
		throw error;
	}
}

/**
 * Introspect a local GraphQL schema file and return the schema as the GraphQL SDL
 * @param path - The path to the local schema file
 * @returns The schema
 */
export async function introspectLocalSchema(path: string) {
	try {
		const schema = await readFile(path, "utf8");
		return schema;
	} catch (error) {
		console.error('Error reading local schema:', error);
		throw error;
	}
}