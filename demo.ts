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
    title: "Bun performance in 2023",
    content: "Bun is fast.",
    author: "Anna",
    category: "JavaScript",
    year: 2023,
    published: true,
  },
  {
    title: "TypeScript and Bun",
    content: "A great combination.",
    author: "Juan",
    category: "JavaScript",
    year: 2022,
    published: true,
  },
  {
    title: "Search algorithm optimization",
    content: "Key to performance.",
    author: "Peter",
    category: "Algorithms",
    year: 2023,
    published: true,
  },
  {
    title: "Intro to full-text search",
    content: "A crucial algorithm.",
    author: "Anna",
    category: "Algorithms",
    year: 2021,
    published: false,
  },
  {
    title: "Bun for servers",
    content: "Bun can build fast servers.",
    author: "Anna",
    category: "JavaScript",
    year: 2023,
    published: true,
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
        filters,
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
