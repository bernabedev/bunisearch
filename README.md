<div align="center">
  <img src="buni-light.svg" alt="BuniSearch Logo" width="150"/>
  <h1>BuniSearch 🐰🔍</h1>
  <p>
    <strong>A high-performance, multi-collection, full-text search engine built with Bun.</strong>
  </p>
  <p>
    Inspired by the speed and developer experience of Typesense and Algolia, BuniSearch is designed from the ground up to be a powerful, self-hostable search solution written entirely in TypeScript and optimized for the Bun runtime.
  </p>
  <p>
    <a href="#-key-features">✨ Features</a> •
    <a href="#-quick-start">🚀 Quick Start</a> •
    <a href="#-api-reference">📚 API Reference</a> •
    <a href="#-running-with-docker">🐳 Docker</a> •
    <a href="#-contributing">🤝 Contributing</a>
  </p>

[![Tests](https://img.shields.io/github/actions/workflow/status/bernabedev/bunisearch/test.yml?branch=main&label=tests&style=for-the-badge)](https://github.com/bernabedev/bunisearch/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

---

## ✨ Key Features

BuniSearch isn't just a simple library; it's a full-featured search server with a modern architecture.

- 🚀 **Blazing Fast:** Built on [Bun](https://bun.sh/), leveraging its incredible speed for indexing and searching.
- 🗂️ **Multi-Collection Architecture:** Manage multiple, independent search indexes (like `products`, `users`, `articles`) on a single server instance, similar to Typesense or Elasticsearch.
- 🔎 **Advanced Full-Text Search:**
  - **Typo Tolerance (Fuzzy Search):** Finds results even with typos, powered by Levenshtein distance.
  - **Relevance Scoring:** Sophisticated TF-IDF ranking to surface the most relevant results first. (Okapi BM25 planned).
  - **Language Agnostic:** Unicode-aware tokenizer handles multiple languages out of the box.
- फिल्टर **Powerful Filtering & Faceting:**
- **Term, Boolean & Numeric Filters:** Drill down with `gte`/`lte` range filters and exact keyword matches.
- **Dynamic Facets:** Get category counts on your search results to build rich, explorable UIs.
- 💾 **Persistent Storage:** Indexes are automatically saved to disk and loaded on startup, ensuring your data survives restarts.
- 🐳 **Docker Ready:** Comes with a `Dockerfile` for easy, isolated deployment in any environment.
- 📚 **Self-Documenting API:** The built-in REST API, powered by [bklar](https://github.com/bernabedev/bklar), includes automatic Swagger & Scalar UI documentation.

## 🚀 Quick Start

Get a BuniSearch server running in under 2 minutes.

### 1. Running with Docker (Recommended)

This is the easiest way to get started.

```bash
# 1. Clone the repository
git clone https://github.com/bernabedev/bunisearch.git
cd bunisearch

# 2. Build the Docker image
docker build -t bunisearch .

# 3. Run the container
# This command maps port 3000 and mounts a local `./data` directory
# for persistent storage.
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data --name my-bunisearch-instance bunisearch
```

Your BuniSearch API is now running and accessible at `http://localhost:3000`.

### 2. Running Locally with Bun

You need [Bun](https://bun.sh/docs/installation) installed.

```bash
# 1. Clone the repository
git clone https://github.com/bernabedev/bunisearch.git
cd bunisearch

# 2. Install dependencies
bun install

# 3. Start the API server
bun run api.ts
```

Your BuniSearch API is now running at `http://localhost:3000`.

## 📚 API Reference

Once the server is running, you can interact with it via its REST API. For a full, interactive experience, visit the auto-generated documentation:

- **Swagger UI:** `http://localhost:3000/docs/swagger`
- **Scalar UI:** `http://localhost:3000/docs/scalar`

Here are уничтожитель most common operations:

### 1. Create a Collection

First, define the structure of your data.

**`POST /collections`**

```json
{
  "name": "products",
  "schema": {
    "title": { "type": "string" },
    "brand": { "type": "string", "facetable": true },
    "price": { "type": "number", "sortable": true },
    "rating": { "type": "number", "sortable": true }
  }
}
```

### 2. Add (Index) a Document

Add documents to your new collection. You can provide your own ID as a query parameter.

**`POST /collections/products/docs?id=product-123`**

```json
{
  "title": "High-Performance Laptop",
  "brand": "TechCorp",
  "price": 1499.99,
  "rating": 4.8
}
```

### 3. Search

Perform a powerful search query.

**`POST /collections/products/search`**

```json
{
  "q": "higt-performanc laptop",
  "tolerance": 2,
  "limit": 5,
  "filters": {
    "price": { "lte": 2000 },
    "rating": { "gte": 4.5 }
  },
  "facets": ["brand"]
}
```

**Example Response:**

```json
{
  "hits": [
    {
      "id": "product-123",
      "score": 1.875,
      "document": {
        "title": "High-Performance Laptop",
        "brand": "TechCorp",
        "price": 1499.99,
        "rating": 4.8,
        "id": "product-123"
      }
    }
  ],
  "count": 1,
  "facets": {
    "brand": {
      "TechCorp": 1
    }
  },
  "elapsed": "5ms"
}
```

### Other Endpoints

- `GET /health`: Check if the server is running.
- `GET /stats`: Get memory usage and index statistics.
- `GET /collections`: List all collection names.
- `DELETE /collections/:collectionName`: Delete a collection.
- `GET /collections/:collectionName/docs/:docId`: Retrieve a document.
- `PUT /collections/:collectionName/docs/:docId`: Update a document.
- `DELETE /collections/:collectionName/docs/:docId`: Delete a document.

## 🧪 Running Tests

To ensure reliability, BuniSearch comes with a comprehensive test suite.

```bash
# Run all tests
bun test
```

## 🗺️ Project Roadmap

BuniSearch is an active project. Here's what's planned for the future:

- [x] **Okapi BM25 Ranking:** Implement a more advanced relevance scoring algorithm.
- [x] **Trie-based Fuzzy Search:** Drastically improve fuzzy search performance.
- [x] **Phrase & Proximity Search:** Support for searching exact phrases like `"red laptop"`.
- [ ] **Asynchronous API:** Convert core operations to be fully non-blocking.
- [ ] **FFI Optimizations:** Rewrite performance-critical sections (like Levenshtein) in Rust or Zig for native speed.
- [ ] **Official Client Libraries:** Provide official client libraries for JavaScript/TypeScript.

## 🤝 Contributing

Contributions are highly welcome! Whether it's a bug report, a feature request, or a pull request, your input is valued.

1.  **Fork the repository.**
2.  **Create a new branch:** `git checkout -b feature/my-awesome-feature`
3.  **Make your changes.**
4.  **Add tests for your changes.**
5.  **Run the test suite:** `bun test`
6.  **Submit a pull request.**

Please open an [issue](https://github.com/bernabedev/bunisearch/issues) to discuss significant changes before starting work.

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
