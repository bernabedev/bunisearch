import { BuniSearch } from "./src/index";

console.log("🚀 Initializing BuniSearch v2 Engine...");

// 1. Create a new search instance with our schema
const db = new BuniSearch({
  schema: {
    title: { type: "string" },
    content: { type: "string" },
    author: { type: "string", facetable: true },
    category: { type: "string", facetable: true },
  },
});

// 2. Index multilingual data
const articles = [
  {
    title: "The incredible performance of Bun",
    content: "Bun is an all-in-one JavaScript runtime.",
    author: "Anna",
    category: "JavaScript",
  },
  {
    title: "TypeScript y Bun: La combinación perfecta",
    content: "Usar TypeScript es fantástico.",
    author: "Juan",
    category: "JavaScript",
  },
  {
    title: "Search algorithm optimization",
    content: "A good algorithm is key to performance.",
    author: "Peter",
    category: "Algorithms",
  },
  {
    title: "Introduction to fast full-text search",
    content: "A fast search algorithm is crucial.",
    author: "Anna",
    category: "Algorithms",
  },
  {
    title: "Bun for server-side development",
    content: "Bun can also build fast servers.",
    author: "Anna",
    category: "JavaScript",
  },
];

articles.forEach((article) => db.insert(article));

console.log(`✅ Index created with ${articles.length} documents.`);

// 3. Create the HTTP server with Bun
Bun.serve({
  port: 3000,
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/search") {
      const q = url.searchParams.get("q");
      const tolerance = Number(url.searchParams.get("tolerance") || 1);
      const facets = url.searchParams.get("facets")?.split(",") || [];

      if (!q) {
        return new Response("Missing search query parameter: ?q=term", {
          status: 400,
        });
      }

      console.log(`🔎 Searching for: "${q}" with tolerance: ${tolerance}`);

      const results = db.search(q, {
        tolerance: tolerance,
        limit: 5,
        facets,
      });

      // We convert bigint to a number for JSON serialization
      const response = { ...results, elapsed: Number(results.elapsed) };

      return new Response(JSON.stringify(response, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      "BuniSearch v2 server is running. Use /search?q=your-query",
      { status: 404 },
    );
  },

  error(error) {
    console.error(error);
    return new Response("An unexpected error occurred.", { status: 500 });
  },
});

console.log("🔥 BuniSearch v2 server listening on http://localhost:3000");
