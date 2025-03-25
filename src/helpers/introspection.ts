import { buildClientSchema, getIntrospectionQuery, printSchema } from "graphql";
import { readFile } from "node:fs/promises";
/**
 * Introspect a GraphQL endpoint and return the schema as the GraphQL SDL
 * @param endpoint - The endpoint to introspect
 * @returns The schema
 */
export async function introspectEndpoint(
	endpoint: string,
	headers?: Record<string, string>,
) {
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
		body: JSON.stringify({
			query: getIntrospectionQuery(),
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
}

/**
 * Introspect a local GraphQL schema file and return the schema as the GraphQL SDL
 * @param path - The path to the local schema file
 * @returns The schema
 */
export async function introspectLocalSchema(path: string) {
	const schema = await readFile(path, "utf8");
	return schema;
}