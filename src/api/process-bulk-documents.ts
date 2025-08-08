import type { BuniSearch } from "../engine";

/**
 * Processes an iterable of documents in batches to avoid blocking the event loop.
 * @param collection The BuniSearch collection instance.
 * @param documents An iterable of document objects.
 * @returns An object with statistics about the indexing operation.
 */
export async function processBulkDocuments(
  collection: BuniSearch,
  documents: AsyncIterable<any> | Iterable<any>,
) {
  const results = {
    indexed: 0,
    failed: 0,
    errors: [] as { document: any; error: string }[],
  };
  const BATCH_SIZE = 1000; // Process 1000 documents before yielding
  let countInBatch = 0;

  for await (const doc of documents) {
    try {
      // We assume each document object has a unique identifier 'id' or 'sku'
      // If not, BuniSearch will generate one.
      const id = doc.id || doc.sku;
      collection.add(
        {
          ...doc,
          tags: Array.isArray(doc.tags) ? doc.tags.join(" ") : doc.tags,
        },
        id ? String(id) : undefined,
      );
      results.indexed++;
    } catch (e) {
      results.failed++;
      if (results.errors.length < 10) {
        // Limit stored errors to avoid memory issues
        results.errors.push({
          document: doc.id || "unknown",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    countInBatch++;
    if (countInBatch >= BATCH_SIZE) {
      // Yield to the event loop to allow other requests to be processed
      await Bun.sleep(0);
      countInBatch = 0;
    }
  }

  return results;
}

export async function* parseNDJSON(stream: ReadableStream<Uint8Array>) {
  const textStream = stream.pipeThrough(new TextDecoderStream());

  const lineStream = textStream.pipeThrough(
    new TransformStream<string, string>({
      start() {},
      transform(chunk, controller) {
        this.buffer = (this.buffer || "") + chunk;
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.trim()) controller.enqueue(line.trim());
        }
      },
      flush(controller) {
        if (this.buffer?.trim()) {
          controller.enqueue(this.buffer.trim());
        }
      },
    }),
  );

  const reader = lineStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "]" || trimmed === "[") continue;

    try {
      yield JSON.parse(trimmed);
    } catch (err) {
      console.warn("Invalid JSON line:", trimmed);
      throw new Error("Invalid JSON in NDJSON file.");
    }
  }
}
