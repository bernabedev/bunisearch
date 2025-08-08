import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { readdir, unlink } from "node:fs/promises";
import { startApi } from "../../api";
import { http } from "./http";
const DATA_DIR = "./data";

async function cleanup() {
  try {
    const files = await readdir(DATA_DIR);
    await Promise.all(files.map((file) => unlink(`${DATA_DIR}/${file}`)));
  } catch (e) {
    // Ignore errors (e.g., if the directory doesn't exist)
  }
}
describe("Documents API", () => {
  let server: Bun.Server;
  const collectionName = "e2e-products";

  beforeAll(async () => {
    const api = await startApi();
    server = api.server;
    await cleanup();
  });

  afterAll(() => {
    server.stop(true);
  });

  // Setup the collection once for the entire suite
  beforeEach(async () => {
    // Ensure the collection from a previous test run is gone from the server's memory and disk.
    // We don't care about the response status, just that it's gone.
    await http.delete(`/collections/${collectionName}`);

    const payload = {
      name: collectionName,
      schema: {
        title: { type: "string" },
        brand: { type: "string", facetable: true },
        price: { type: "number", sortable: true },
      },
    };
    // Create a fresh collection for this test.
    const createRes = await http.post("/collections", payload);
    expect(createRes.status).toBe(201);
  });

  const sampleDoc = { title: "Laptop Pro", brand: "TechCorp", price: 1200 };

  test("Full document lifecycle: POST, GET, PUT, DELETE", async () => {
    // 1. POST - Add a document
    const addRes = await http.post(
      `/collections/${collectionName}/docs`,
      sampleDoc,
    );
    expect(addRes.status).toBe(201);
    const { id } = (await addRes.json()) as { id: string };
    expect(id).toBeString();

    // 2. GET - Retrieve the document
    const getRes = await http.get(`/collections/${collectionName}/docs/${id}`);
    expect(getRes.status).toBe(200);
    const doc = (await getRes.json()) as { title: string };
    expect(doc.title).toBe(sampleDoc.title);

    // 3. PUT - Update the document
    const updatedPayload = { price: 1150 };
    const putRes = await http.put(
      `/collections/${collectionName}/docs/${id}`,
      updatedPayload,
    );
    expect(putRes.status).toBe(200);

    // Verify the update
    const getUpdatedRes = await http.get(
      `/collections/${collectionName}/docs/${id}`,
    );
    const updatedDoc = (await getUpdatedRes.json()) as { price: number };
    expect(updatedDoc.price).toBe(1150);

    // 4. DELETE - Delete the document
    const deleteRes = await http.delete(
      `/collections/${collectionName}/docs/${id}`,
    );
    expect(deleteRes.status).toBe(200);

    // Verify it's gone
    const getDeletedRes = await http.get(
      `/collections/${collectionName}/docs/${id}`,
    );
    expect(getDeletedRes.status).toBe(404);
  });

  test("POST /search - should find documents", async () => {
    await http.post(`/collections/${collectionName}/docs`, sampleDoc);

    const searchPayload = { q: "laptop" };
    const searchRes = await http.post(
      `/collections/${collectionName}/search`,
      searchPayload,
    );
    expect(searchRes.status).toBe(200);
    const body = (await searchRes.json()) as { count: number; hits: any[] };
    expect(body.count).toBe(1);
    expect(body.hits[0].document.title).toBe("Laptop Pro");
  });

  test("POST /search - should handle phrase and term search correctly", async () => {
    // 1. Index two documents
    await http.post(`/collections/${collectionName}/docs`, {
      title: "the quick brown fox jumps over the lazy dog",
      brand: "Test",
      price: 100,
    });
    await http.post(`/collections/${collectionName}/docs`, {
      title: "a brown quick fox also jumps",
      brand: "Test",
      price: 100,
    });

    // 2. Perform a phrase search for "quick brown"
    const phraseSearchPayload = { q: '"quick brown"' };
    const phraseSearchRes = await http.post(
      `/collections/${collectionName}/search`,
      phraseSearchPayload,
    );
    expect(phraseSearchRes.status).toBe(200);
    const phraseBody = (await phraseSearchRes.json()) as {
      count: number;
      hits: any[];
    };
    expect(phraseBody.count).toBe(1);
    expect(phraseBody.hits[0].document.title).toBe(
      "the quick brown fox jumps over the lazy dog",
    );

    // 3. Perform a regular term search for "quick brown"
    const termSearchPayload = { q: "quick brown" };
    const termSearchRes = await http.post(
      `/collections/${collectionName}/search`,
      termSearchPayload,
    );
    expect(termSearchRes.status).toBe(200);
    const termBody = (await termSearchRes.json()) as {
      count: number;
      hits: any[];
    };
    // This should match both documents
    expect(termBody.count).toBe(2);
  });

  test("POST /search - should find documents with fuzzy search (tolerance)", async () => {
    // 1. Index a document
    await http.post(`/collections/${collectionName}/docs`, {
      title: "The new Apple Laptop is great",
      brand: "Apple",
      price: 2500,
    });

    // 2. Perform a fuzzy search for "laptob" with tolerance: 1
    const searchPayload = { q: "laptob", tolerance: 1 };
    const searchRes = await http.post(
      `/collections/${collectionName}/search`,
      searchPayload,
    );
    expect(searchRes.status).toBe(200);
    const body = (await searchRes.json()) as { count: number; hits: any[] };

    // Should find the document containing "laptop"
    expect(body.count).toBe(1);
    expect(body.hits[0].document.title).toBe("The new Apple Laptop is great");
  });
});
