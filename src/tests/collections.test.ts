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
describe("Collections API", () => {
  let server: Bun.Server;

  beforeAll(async () => {
    const api = await startApi();
    server = api.server;
  });

  afterAll(() => {
    server.stop(true);
  });

  beforeEach(async () => {
    await cleanup();
  });

  const sampleCollectionPayload = {
    name: "products",
    schema: { title: { type: "string" } },
  };

  test("POST /collections - should create a new collection", async () => {
    const res = await http.post("/collections", sampleCollectionPayload);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain('Collection "products" created');
  });

  test("GET /collections - should list all collections", async () => {
    await http.post("/collections", { name: "test-col", schema: {} });
    const res = await http.get("/collections");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { collections: string[] };
    expect(body.collections).toContain("test-col");
  });

  test("DELETE /collections/:collectionName - should delete a collection", async () => {
    await http.post("/collections", sampleCollectionPayload); // Create it
    const deleteRes = await http.delete("/collections/products"); // Delete it
    expect(deleteRes.status).toBe(200);

    const getRes = await http.get("/collections"); // Verify it's gone
    const body = (await getRes.json()) as { collections: string[] };
    expect(body.collections).not.toContain("products");
  });
});
