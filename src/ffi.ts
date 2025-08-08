// --- Types to match Rust FFI ---
export type FuzzyResult = {
  token: string;
  distance: number;
};

// --- Singleton pattern for lazy loading the FFI library ---
let ffi: ReturnType<typeof setupFFI> | null = null;

function setupFFI() {
  const { dlopen, FFIType, suffix } = require("bun:ffi");
  const libPath = `native/target/release/libbuni_native.${suffix}`;

  return dlopen(libPath, {
    init_trie: {
      args: [],
      returns: FFIType.void,
    },
    insert_word: {
      args: [FFIType.cstring],
      returns: FFIType.void,
    },
    delete_word: {
      args: [FFIType.cstring],
      returns: FFIType.void,
    },
    search_fuzzy: {
      args: [FFIType.cstring, FFIType.usize],
      returns: FFIType.ptr,
    },
    free_string: {
      args: [FFIType.ptr],
      returns: FFIType.void,
    },
  });
}

function getFFI() {
  if (ffi === null) {
    ffi = setupFFI();
  }
  return ffi.symbols;
}

// --- Wrapper functions for a more idiomatic JS/TS experience ---

export const initTrie = () => {
  getFFI().init_trie();
};

export const insertWord = (word: string) => {
  const wordBuffer = Buffer.from(word + "\0", "utf8");
  getFFI().insert_word(wordBuffer);
};

export const deleteWord = (word: string) => {
  const wordBuffer = Buffer.from(word + "\0", "utf8");
  getFFI().delete_word(wordBuffer);
};

export const searchFuzzy = (
  word: string,
  maxDistance: number,
): FuzzyResult[] => {
  const ffiSymbols = getFFI();
  const wordBuffer = Buffer.from(word + "\0", "utf8");
  const resultPtr = ffiSymbols.search_fuzzy(wordBuffer, maxDistance);

  if (resultPtr === null) {
    return [];
  }

  const resultStr = new CString(resultPtr);
  ffiSymbols.free_string(resultPtr);

  try {
    return JSON.parse(resultStr);
  } catch (e) {
    console.error("Failed to parse JSON from native fuzzy search:", e);
    return [];
  }
};

// Helper class to read C strings from a pointer
class CString extends String {
  constructor(ptr: Pointer) {
    super(new TextDecoder().decode(new Uint8Array(getBuffer(ptr))));
  }
}

function getBuffer(ptr: Pointer, byteLength?: number) {
  if (byteLength !== undefined) {
    return new Uint8Array(ptr, 0, byteLength);
  }

  let i = 0;
  while (ptr[i] !== 0) {
    i++;
  }
  return new Uint8Array(ptr, 0, i);
}
