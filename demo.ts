import { http } from "./src/tests/http";

const COLLECTION_NAME = "bestbuy-products";
const PRODUCTS_FILE_PATH = "./data/products-bestbuy.json";

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
 * Reads the products file line by line and indexes each product.
 */
async function indexProducts() {
  console.log(`\nIndexing products from "${PRODUCTS_FILE_PATH}"...`);

  const file = Bun.file(PRODUCTS_FILE_PATH);
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let indexedCount = 0;

  // This loop processes the file as a stream, which is memory-efficient
  // for very large files.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep the last, possibly incomplete line

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine === "") continue;
      let cleanLine = trimmedLine;
      if (cleanLine.endsWith(",")) {
        cleanLine = cleanLine.slice(0, -1);
      }
      try {
        const product = JSON.parse(cleanLine);

        // Transform the product data to match our schema
        const docToIndex = {
          name: product.name,
          description: product.description,
          manufacturer: product.manufacturer,
          // Flatten the category array into a single string for searching
          // and take the last category name for faceting.
          category:
            product.category.map((c: any) => c.name).pop() || "Uncategorized",
          price: product.price,
        };

        // Use the original SKU as the document ID
        const response = await http.post(
          `/collections/${COLLECTION_NAME}/docs?id=${product.sku}`,
          docToIndex,
        );

        if (response.ok) {
          indexedCount++;
          // Log progress every 1000 documents to avoid spamming the console
          if (indexedCount % 1000 === 0) {
            console.log(`... Indexed ${indexedCount} products`);
          }
        } else {
          console.warn(
            `⚠️ Failed to index product SKU ${product.sku}: ${await response.text()}`,
          );
        }
      } catch (e) {
        console.error(`❌ Could not parse line: ${line.substring(0, 100)}...`);
      }
    }
  }

  console.log(
    `\n🎉 Indexing complete! Successfully indexed ${indexedCount} products.`,
  );
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
    await indexProducts();
  } catch (error) {
    console.error("\nAn unexpected error occurred during the demo script:");
    console.error(error);
    process.exit(1);
  }
}

main();
