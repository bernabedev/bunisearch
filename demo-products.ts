// demo-products.ts
import { BuniSearch } from "./src/index";

const INDEX_PATH = "./products.index.json";
const PRODUCTS_PATH = "./products.json";

// --- Type definition for our Product data ---
type Product = {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  rating: number;
  brand: string;
  tags: string[];
  availabilityStatus: string;
};

async function main() {
  console.log("🚀 Initializing BuniSearch v6 Product Search Demo...");

  let db: BuniSearch;
  const indexFile = Bun.file(INDEX_PATH);
  const indexExists = await indexFile.exists();

  if (indexExists) {
    // --- Load existing index from file ---
    console.log(`\n📄 Index file found at "${INDEX_PATH}". Loading...`);
    const startTime = process.hrtime.bigint();
    db = await BuniSearch.load(INDEX_PATH);
    const endTime = process.hrtime.bigint();
    const elapsedMs = Number((endTime - startTime) / 1000000n);
    console.log(`✅ Product index loaded successfully in ${elapsedMs}ms.`);
  } else {
    // --- Create, index, and save a new index ---
    console.log(
      `\n❌ No index file found. Creating a new one from "${PRODUCTS_PATH}"...`,
    );

    // 1. Define the schema for our products
    db = new BuniSearch({
      schema: {
        // --- Searchable fields ---
        title: { type: "string" },
        description: { type: "string" },
        tags: { type: "string" }, // We'll index the tags array as a single string

        // --- Facetable fields (for filtering and grouping) ---
        category: { type: "string", facetable: true },
        brand: { type: "string", facetable: true },
        availabilityStatus: { type: "string", facetable: true },

        // --- Sortable fields (for range filtering) ---
        price: { type: "number", sortable: true },
        rating: { type: "number", sortable: true },
      },
    });

    // 2. Load and index the products
    console.log("✍️ Loading and indexing products...");
    const productsFile = Bun.file(PRODUCTS_PATH);
    const products: Product[] = await productsFile.json();

    let indexedCount = 0;
    for (const product of products) {
      // BuniSearch expects a flat object, so we join the tags array into a searchable string.
      // We pass the original product ID to 'add' so we can reference it easily.
      db.add(
        {
          ...product,
          tags: product.tags.join(" "), // Convert array to space-separated string
        },
        String(product.id),
      );
      indexedCount++;
    }
    console.log(` indexed ${indexedCount} products.`);

    // 3. Save the newly created index
    console.log("💾 Saving index to file...");
    await db.save(INDEX_PATH);
    console.log(`✅ Index saved to "${INDEX_PATH}".`);
  }

  // --- Start the API Server ---
  console.log("\n-------------------------------------");
  console.log("🔥 Product Search API Server is running!");
  console.log("🔥 Listening on http://localhost:3000");
  console.log("-------------------------------------");

  Bun.serve({
    port: 3000,
    fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === "/search") {
        const q = url.searchParams.get("q") || "";
        const tolerance = Number(url.searchParams.get("tolerance") || 1);
        const facets = url.searchParams.get("facets")?.split(",") || [];

        let filters = {};
        const filtersParam = url.searchParams.get("filters");
        if (filtersParam) {
          try {
            filters = JSON.parse(filtersParam);
          } catch (e) {
            return new Response("Invalid JSON in 'filters' parameter.", {
              status: 400,
            });
          }
        }

        const results = db.search(q, { tolerance, facets, filters, limit: 20 });

        return new Response(JSON.stringify(results, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Simple help page
      return new Response(
        `BuniSearch Product API\n\nEndpoint: /search\n\nParameters:\n` +
          `- q (string): Full-text search query.\n` +
          `- tolerance (number): Fuzzy search tolerance (e.g., 1, 2).\n` +
          `- filters (JSON string): Filter results. e.g., '{"brand":"Essence","price":{"gte":50}}'\n` +
          `- facets (comma-separated string): Calculate facets. e.g., 'brand,category'\n`,
        { headers: { "Content-Type": "text/plain" } },
      );
    },
    error: (e) => new Response(e.toString(), { status: 500 }),
  });
}

main();
