import { mkdirSync, unlink } from "node:fs";
import { readdir } from "node:fs/promises";
import { z } from "zod";
import { BuniSearch } from "./engine";

const DATA_DIR = "./data";

// Zod schema for creating a collection
export const createCollectionSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Collection name can only contain letters, numbers, hyphens, and underscores.",
    ),
  schema: z.record(
    z.string(),
    z.object({
      type: z.enum(["string", "number", "boolean"]),
      facetable: z.boolean().optional(),
      sortable: z.boolean().optional(),
    }),
  ),
});

export type CreateCollectionPayload = z.infer<typeof createCollectionSchema>;

export class BuniSearchManager {
  private collections: Map<string, BuniSearch> = new Map();

  constructor() {
    // Ensure the data directory exists
    try {
      mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {}
  }

  /**
   * Loads all existing collections from the data directory on startup.
   */
  async loadAll() {
    console.log(`🚀 Loading all collections from "${DATA_DIR}"...`);
    const files = await readdir(DATA_DIR);
    for (const file of files) {
      if (file.endsWith(".index.json")) {
        const collectionName = file.replace(".index.json", "");
        try {
          const db = await BuniSearch.load(`${DATA_DIR}/${file}`);
          this.collections.set(collectionName, db);
          console.log(`✅ Loaded collection: "${collectionName}"`);
        } catch (error) {
          console.error(
            `❌ Failed to load collection "${collectionName}":`,
            error,
          );
        }
      }
    }
  }

  /**
   * Creates a new collection.
   */
  createCollection(payload: CreateCollectionPayload): BuniSearch {
    const { name, schema } = payload;
    if (this.collections.has(name)) {
      throw new Error(`Collection "${name}" already exists.`);
    }
    const newCollection = new BuniSearch({ schema });
    this.collections.set(name, newCollection);
    return newCollection;
  }

  /**
   * Retrieves a collection by its name.
   */
  getCollection(name: string): BuniSearch | undefined {
    return this.collections.get(name);
  }

  /**
   * Lists the names of all existing collections.
   */
  listCollections(): string[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Deletes a collection and its associated index file.
   */
  async deleteCollection(name: string): Promise<boolean> {
    if (!this.collections.has(name)) {
      return false;
    }
    this.collections.delete(name);
    // Remove the file from disk
    const filePath = `${DATA_DIR}/${name}.index.json`;
    unlink(filePath, (error) => {
      if (error !== null && error.code !== "ENOENT") {
        console.error(`Could not delete index file for ${name}:`, error);
      }
    });

    return true;
  }

  /**
   * Saves the state of a specific collection to its file.
   */
  async saveCollection(name: string): Promise<void> {
    const collection = this.getCollection(name);
    if (!collection) {
      throw new Error(`Collection "${name}" not found.`);
    }
    await collection.save(`${DATA_DIR}/${name}.index.json`);
  }
}
