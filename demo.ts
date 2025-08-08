import { unlink } from "node:fs/promises";
import { http } from "./src/tests/http";
const COLLECTION_NAME = "bestbuy-products";
const ORIGINAL_PRODUCTS_FILE = "./data/products-bestbuy.json";
const CLEAN_PRODUCTS_FILE = "./products-bestbuy.clean.ndjson";

/**
 * Checks if the BuniSearch API server is running.
 */
async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await http.get("/health");
    return response.ok;
  } catch (error) {
    console.error(
      "❌ API server is not running or is unreachable. Please start it with 'bun run api.ts'.",
    );
    return false;
  }
}

/**
 * Creates the 'bestbuy-products' collection if it doesn't already exist.
 */
async function ensureCollectionExists() {
  console.log(`Checking for collection "${COLLECTION_NAME}"...`);

  const getRes = await http.get("/collections");
  const { collections } = (await getRes.json()) as { collections: string[] };

  if (collections.includes(COLLECTION_NAME)) {
    console.log(`✅ Collection "${COLLECTION_NAME}" already exists.`);
    return;
  }

  console.log(`Collection not found. Creating "${COLLECTION_NAME}"...`);
  const collectionSchema = {
    name: COLLECTION_NAME,
    schema: {
      name: { type: "string" },
      description: { type: "string" },
      manufacturer: { type: "string", facetable: true },
      // Index categories as a single searchable string and as a facetable field
      category: { type: "string", facetable: true },
      price: { type: "number", sortable: true },
    },
  };

  const createRes = await http.post("/collections", collectionSchema);
  if (!createRes.ok) {
    throw new Error(`Failed to create collection: ${await createRes.text()}`);
  }
  console.log(`✅ Collection "${COLLECTION_NAME}" created successfully.`);
}

/**
 * Pre-processes the original JSON file into a valid NDJSON file by removing
 * trailing commas from each line.
 * @returns The number of lines processed.
 */
async function createCleanNDJSONFile(): Promise<number> {
  console.log(
    `\n🧹 Pre-processing "${ORIGINAL_PRODUCTS_FILE}" into a clean NDJSON file...`,
  );

  const inputFile = Bun.file(ORIGINAL_PRODUCTS_FILE);
  const content = await inputFile.text();

  let data: any;
  try {
    data = JSON.parse(content);
  } catch (err) {
    throw new Error(`❌ Failed to parse "${ORIGINAL_PRODUCTS_FILE}" as JSON.`);
  }

  if (!Array.isArray(data)) {
    throw new Error(`❌ Expected JSON array in "${ORIGINAL_PRODUCTS_FILE}".`);
  }

  const writer = Bun.file(CLEAN_PRODUCTS_FILE).writer();
  for (const obj of data) {
    writer.write(JSON.stringify(obj) + "\n");
  }
  await writer.end();

  console.log(
    `✅ Created clean file "${CLEAN_PRODUCTS_FILE}" with ${data.length} products.`,
  );
  return data.length;
}

/**
 * Indexes all products by uploading the clean NDJSON file to the bulk endpoint.
 */
async function indexProductsInBulk() {
  const lineCount = await createCleanNDJSONFile();
  if (lineCount === 0) {
    console.log("No products to index.");
    return;
  }

  console.log(
    `\n📤 Uploading "${CLEAN_PRODUCTS_FILE}" to the bulk indexing endpoint...`,
  );

  // Create FormData and append the clean file
  const formData = new FormData();
  formData.append("file", Bun.file(CLEAN_PRODUCTS_FILE));

  // Send the file using our updated http client
  const response = await http.post(
    `/collections/${COLLECTION_NAME}/docs/bulk`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Bulk indexing failed: ${await response.text()}`);
  }

  const results = await response.json();
  console.log("\n🎉 Bulk indexing complete!");
  console.log(JSON.stringify(results, null, 2));

  // Optional: Clean up the temporary file
  await unlink(CLEAN_PRODUCTS_FILE);
  console.log(`\n🗑️ Cleaned up temporary file.`);
}

/**
 * Main execution function.
 */
async function main() {
  if (!(await checkApiHealth())) {
    process.exit(1);
  }

  try {
    await ensureCollectionExists();
    await indexProductsInBulk();
  } catch (error) {
    console.error("\nAn unexpected error occurred during the demo script:");
    console.error(error);
    process.exit(1);
  }
}

main();
