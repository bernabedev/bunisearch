import { BuniSearch } from "./src/index";

const INDEX_PATH = "./buni.index.json";

async function main() {
  console.log("🚀 Initializing BuniSearch v6 Persistence Demo...");

  let db: BuniSearch;
  const indexFile = Bun.file(INDEX_PATH);
  const indexExists = await indexFile.exists();

  if (indexExists) {
    // --- PATH 1: LOAD EXISTING INDEX ---
    console.log(`\n📄 Index file found at "${INDEX_PATH}". Loading...`);
    const startTime = process.hrtime.bigint();
    db = await BuniSearch.load(INDEX_PATH);
    const endTime = process.hrtime.bigint();
    const elapsedMs = Number((endTime - startTime) / 1000000n);
    console.log(`✅ Index loaded successfully in ${elapsedMs}ms.`);
  } else {
    // --- PATH 2: CREATE AND SAVE NEW INDEX ---
    console.log(`\n❌ No index file found. Creating a new one...`);
    db = new BuniSearch({
      schema: {
        title: { type: "string" },
        author: { type: "string", facetable: true },
        year: { type: "number", sortable: true },
      },
    });

    console.log("✍️ Indexing initial documents...");
    db.add({
      title: "Bun is the future of JavaScript",
      author: "Anna",
      year: 2023,
    });
    db.add({
      title: "Advanced TypeScript Techniques",
      author: "Juan",
      year: 2022,
    });
    db.add({
      title: "Optimizing Search Algorithms",
      author: "Peter",
      year: 2023,
    });

    console.log("💾 Saving index to file...");
    const startTime = process.hrtime.bigint();
    await db.save(INDEX_PATH);
    const endTime = process.hrtime.bigint();
    const elapsedMs = Number((endTime - startTime) / 1000000n);
    console.log(`✅ Index saved to "${INDEX_PATH}" in ${elapsedMs}ms.`);
  }

  // --- VERIFY THE INDEX IS WORKING ---
  console.log("\n-------------------------------------");
  console.log("🔍 Verifying the index is operational...");

  const results = db.search("javascript", {
    filters: { year: { gte: 2023 } },
    facets: ["author"],
  });

  console.log(`\nSearch results for "javascript" with year >= 2023:`);
  console.log(JSON.stringify(results, null, 2));

  // The number of hits should be 1
  if (
    results.hits.length === 1 &&
    results?.hits?.[0]?.document.author === "Anna"
  ) {
    console.log(
      "\n🎉 Verification successful! The loaded/created index works correctly.",
    );
  } else {
    console.log(
      "\n🚨 Verification failed! Something is wrong with the index state.",
    );
  }
}

main();
