const BASE_URL = "http://localhost:3001";

export const http = {
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    const defaultHeaders = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    return fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: defaultHeaders,
    });
  },

  get(path: string, options?: RequestInit) {
    return this.request(path, { method: "GET", ...options });
  },

  post(path: string, body: any, options?: RequestInit) {
    return this.request(path, {
      method: "POST",
      body: JSON.stringify(body),
      ...options,
    });
  },

  put(path: string, body: any, options?: RequestInit) {
    return this.request(path, {
      method: "PUT",
      body: JSON.stringify(body),
      ...options,
    });
  },

  delete(path: string, options?: RequestInit) {
    return this.request(path, { method: "DELETE", ...options });
  },
};
