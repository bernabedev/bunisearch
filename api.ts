import { swagger } from "@bklarjs/swagger";
import { Bklar, type Middleware } from "bklar";
import { BadRequestError, NotFoundError } from "bklar/errors";
import { z } from "zod";
import {
  addDocumentQuerySchema,
  searchBodySchema,
} from "./src/api/zod-schemas";
import { BuniSearchManager, createCollectionSchema } from "./src/manager";
import { getApplicationStats } from "./src/utils/stats";

/**
 * Initializes the BuniSearchManager and loads all existing collections from disk.
 * This function is called once when the server starts.
 */
async function initializeSearchEngine(): Promise<BuniSearchManager> {
  console.log("🚀 Initializing BuniSearch Engine...");
  const manager = new BuniSearchManager();
  await manager.loadAll();
  return manager;
}

/**
 * Main function to set up and start the API server.
 */
async function startApi(port: number = 3000) {
  const manager = await initializeSearchEngine();
  const app = Bklar();
  const serverStartTime = Date.now();

  app.get(
    "/health",
    (ctx) => {
      return ctx.json({ status: "ok", timestamp: new Date().toISOString() });
    },
    {
      doc: {
        summary: "Health Check",
        tags: ["Monitoring"],
        description:
          "A simple endpoint to check if the API server is running and responsive.",
      },
    },
  );
  app.get(
    "/stats",
    (ctx) => {
      const stats = getApplicationStats(manager, serverStartTime);
      return ctx.json(stats);
    },
    {
      doc: {
        summary: "Application Statistics",
        tags: ["Monitoring"],
        description:
          "Provides statistics about the application's resource consumption and the state of the search engine.",
      },
    },
  );
  // --- Middleware Definitions ---

  /**
   * Middleware to automatically persist a collection's state to disk after a write operation.
   */
  const persistOnWrite: Middleware = async (ctx) => {
    if (["POST", "PUT", "DELETE"].includes(ctx.req.method)) {
      const collectionName = ctx.params.collectionName;
      if (collectionName) {
        console.log(
          `💾 Persisting changes for collection: "${collectionName}"`,
        );
        await manager.saveCollection(collectionName);
      }
    }
  };

  /**
   * Middleware to find the requested collection and attach it to the context state.
   * Throws a 404 error if the collection is not found.
   */
  const findCollection: Middleware = (ctx) => {
    const collection = manager.getCollection(ctx.params.collectionName);
    if (!collection) {
      throw new NotFoundError(
        `Collection "${ctx.params.collectionName}" not found.`,
      );
    }
    ctx.state.collection = collection;
  };

  // =================================================================
  // API Route Definitions
  // =================================================================

  // --- Top-level Collection Management ---
  app.group("/collections", (r) => {
    r.post(
      "/",
      (ctx) => {
        const { name, schema } = ctx.body;
        try {
          manager.createCollection({ name, schema });
          manager.saveCollection(name); // Persist immediately on creation
          return ctx.json(
            { message: `Collection "${name}" created successfully.` },
            201,
          );
        } catch (e) {
          throw new BadRequestError(
            e instanceof Error ? e.message : "Unknown error",
          );
        }
      },
      {
        schemas: { body: createCollectionSchema },
        doc: {
          summary: "Create a new collection",
          tags: ["Collections"],
          description: "Creates a new, empty collection with a defined schema.",
        },
      },
    );

    r.get(
      "/",
      (ctx) => {
        return ctx.json({ collections: manager.listCollections() });
      },
      {
        doc: {
          summary: "List all collections",
          tags: ["Collections"],
          description:
            "Returns an array of names for all existing collections.",
        },
      },
    );

    r.delete(
      "/:collectionName",
      async (ctx) => {
        const { collectionName } = ctx.params;
        const success = await manager.deleteCollection(collectionName);
        if (!success) {
          throw new NotFoundError(`Collection "${collectionName}" not found.`);
        }
        return ctx.json({
          message: `Collection "${collectionName}" and its data have been deleted.`,
        });
      },
      {
        doc: {
          summary: "Delete a collection",
          tags: ["Collections"],
          description:
            "Permanently deletes a collection and all of its indexed documents.",
        },
      },
    );
  });

  // --- Document Management within a specific collection ---
  app.group(
    "/collections/:collectionName",
    (col) => {
      col.post(
        "/search",
        (ctx) => {
          const { collection } = ctx.state;
          const searchParams = ctx.body;
          const results = collection.search(searchParams.q, searchParams);

          return ctx.json({
            ...results,
            elapsedMs: results.elapsed,
          });
        },
        {
          schemas: { body: searchBodySchema },
          doc: {
            summary: "Search within a collection",
            tags: ["Documents"],
            description:
              "Performs a full-featured search on the documents within a specific collection.",
          },
        },
      );

      col.get(
        "/docs/:docId",
        (ctx) => {
          const { collection } = ctx.state;
          // Note: This requires the 'documents' property in BuniSearch to be public, or a 'getDoc' method.
          const doc = collection.documents.get(ctx.params.docId);
          if (!doc) {
            throw new NotFoundError(
              `Document with ID "${ctx.params.docId}" not found in this collection.`,
            );
          }
          return ctx.json(doc);
        },
        {
          schemas: {
            params: z.object({
              docId: z.uuid(),
            }),
          },
          doc: {
            summary: "Get a document by ID",
            tags: ["Documents"],
            description:
              "Retrieves a single document by its unique ID from a specific collection.",
          },
        },
      );

      col.post(
        "/docs",
        (ctx) => {
          const { collection } = ctx.state;
          const docId = ctx.query.id;
          try {
            const newId = collection.add(ctx.body, docId);
            return ctx.json(
              { id: newId, message: "Document added successfully." },
              201,
            );
          } catch (e) {
            throw new BadRequestError(
              e instanceof Error ? e.message : "Unknown error",
            );
          }
        },
        {
          schemas: { query: addDocumentQuerySchema },
          doc: {
            summary: "Add a new document",
            tags: ["Documents"],
            description:
              "Adds a new document to the collection. An optional 'id' can be provided as a query parameter.",
          },
        },
      );

      col.put(
        "/docs/:docId",
        (ctx) => {
          const { collection } = ctx.state;
          const success = collection.update(ctx.params.docId, ctx.body);
          if (!success) {
            throw new NotFoundError(
              `Document with ID "${ctx.params.docId}" not found.`,
            );
          }
          return ctx.json({ message: "Document updated successfully." });
        },
        {
          schemas: {
            params: z.object({
              docId: z.uuid(),
            }),
          },
          doc: {
            summary: "Update a document",
            tags: ["Documents"],
            description:
              "Updates an existing document by its ID. Replaces fields with the new values provided in the body.",
          },
        },
      );

      col.delete(
        "/docs/:docId",
        (ctx) => {
          const { collection } = ctx.state;
          const success = collection.delete(ctx.params.docId);
          if (!success) {
            throw new NotFoundError(
              `Document with ID "${ctx.params.docId}" not found.`,
            );
          }
          return ctx.json({ message: "Document deleted successfully." });
        },
        {
          schemas: {
            params: z.object({
              docId: z.uuid(),
            }),
          },
          doc: {
            summary: "Delete a document",
            tags: ["Documents"],
            description:
              "Permanently deletes a single document from a collection by its ID.",
          },
        },
      );
    },
    [findCollection, persistOnWrite],
  ); // Apply middlewares to all routes in this group

  // --- Setup API Documentation ---
  swagger({
    path: "/docs",
    openapi: {
      title: "BuniSearch Multi-Collection API",
      version: "1.0.0",
      description:
        "A powerful, multi-tenant search API built with BuniSearch and bklar. Inspired by Algolia and Typesense.",
    },
  }).setup(app);

  // --- Start the Server ---
  const server = app.listen(port);
  return { app, server };
}

if (import.meta.main) {
  startApi(3000);
}

export { startApi };
