import type { BuniSearchManager } from "../manager";

/**
 * Formats a number of bytes into a human-readable string (e.g., "12.34 MB").
 * @param bytes The number of bytes.
 * @returns A formatted string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(2)} MB`;
}

/**
 * Generates a statistics object for the application.
 *
 * @param manager The BuniSearchManager instance.
 * @param serverStartTime The timestamp (in milliseconds) when the server started.
 * @returns A structured object containing process and BuniSearch statistics.
 */
export function getApplicationStats(
  manager: BuniSearchManager,
  serverStartTime: number,
) {
  const memoryUsage = process.memoryUsage();
  const uptimeSeconds = (Date.now() - serverStartTime) / 1000;

  const collectionsStats = manager.listCollections().map((name) => {
    const collection = manager.getCollection(name)!;
    return {
      name,
      documentCount: collection.docCount,
    };
  });

  return {
    process: {
      uptime: `${uptimeSeconds.toFixed(2)}s`,
      memory: {
        rss: formatBytes(memoryUsage.rss),
        heapUsed: formatBytes(memoryUsage.heapUsed),
        heapTotal: formatBytes(memoryUsage.heapTotal),
      },
      cpuUsage: process.cpuUsage(),
    },
    buniSearch: {
      totalCollections: collectionsStats.length,
      collections: collectionsStats,
    },
  };
}
