import { BuniSearch } from "./src/index";

console.log("🚀 Initializing BuniSearch v2 Engine...");

// 1. Create a new search instance with our schema
const db = new BuniSearch({
  schema: {
    title: "string",
    content: "string",
    author: "string",
  },
});

// 2. Index multilingual data
const articles = [
  {
    title: "The incredible performance of Bun",
    content: "Bun is an all-in-one JavaScript runtime designed for speed.",
    author: "Anna",
  },
  {
    title: "TypeScript y Bun: La combinación perfecta",
    content:
      "Usar TypeScript con Bun es una experiencia de desarrollo fantástica.",
    author: "Juan",
  },
  {
    title: "Search algorithm optimization",
    content: "A good algorithm is key to the performance of any search engine.",
    author: "Peter",
  },
  {
    title: "Einführung in die schnelle Suche",
    content: "Ein schneller Suchalgorithmus ist entscheidend.",
    author: "Klaus",
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

      if (!q) {
        return new Response("Missing search query parameter: ?q=term", {
          status: 400,
        });
      }

      console.log(`🔎 Searching for: "${q}" with tolerance: ${tolerance}`);

      const results = db.search(q, {
        tolerance: tolerance,
        limit: 5,
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
