import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { unlink } from "node:fs";
import { readdir } from "node:fs/promises";
import { startApi } from "../../api";
import { http } from "./http";
const DATA_DIR = "./data";

async function cleanup() {
  try {
    const files = await readdir(DATA_DIR);
    for (const file of files) {
      unlink(`${DATA_DIR}/${file}`, (error) => {
        if (error) {
          console.error(`Error deleting file ${file}: ${error}`);
        }
      });
    }
  } catch (e) {}
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
    await cleanup();
    const payload = {
      name: collectionName,
      schema: {
        title: { type: "string" },
        brand: { type: "string", facetable: true },
        price: { type: "number", sortable: true },
      },
    };
    await http.post("/collections", payload);
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
});
