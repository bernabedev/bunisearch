import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startApi } from "../../api";
import { http } from "./http";

describe("Monitoring Endpoints", () => {
  let server: Bun.Server;

  beforeAll(async () => {
    const api = await startApi();
    server = api.server;
  });

  afterAll(() => {
    server.stop(true);
  });

  test("GET /health should return 200 OK", async () => {
    const res = await http.get("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("GET /stats should return 200 OK with stats object", async () => {
    const res = await http.get("/stats");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("process");
    expect(body).toHaveProperty("buniSearch");
  });
});
