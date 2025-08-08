use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use strsim::levenshtein;
use lazy_static::lazy_static;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

// --- Trie Data Structures ---

#[derive(Default, Debug)]
struct TrieNode {
    children: HashMap<char, TrieNode>,
    is_end_of_word: bool,
}

#[derive(Default, Debug)]
struct Trie {
    root: TrieNode,
}

impl Trie {
    fn new() -> Self {
        Trie {
            root: TrieNode::default(),
        }
    }

    fn insert(&mut self, word: &str) {
        let mut current_node = &mut self.root;
        for c in word.chars() {
            current_node = current_node.children.entry(c).or_default();
        }
        current_node.is_end_of_word = true;
    }

    fn delete(&mut self, word: &str) {
        fn _delete(node: &mut TrieNode, word: &str, index: usize) -> bool {
            if index == word.len() {
                if !node.is_end_of_word {
                    return false; // Word doesn't exist
                }
                node.is_end_of_word = false;
                return node.children.is_empty();
            }

            let char = word.chars().nth(index).unwrap();
            if let Some(child_node) = node.children.get_mut(&char) {
                if _delete(child_node, word, index + 1) {
                    node.children.remove(&char);
                    return !node.is_end_of_word && node.children.is_empty();
                }
            }
            false
        }
        _delete(&mut self.root, word, 0);
    }

    fn search_fuzzy(&self, word: &str, max_distance: usize) -> Vec<FuzzyResult> {
        let mut results = Vec::new();
        self._search_recursive(&self.root, "", word, max_distance, &mut results);
        results
    }

    fn _search_recursive(
        &self,
        node: &TrieNode,
        prefix: &str,
        word: &str,
        max_distance: usize,
        results: &mut Vec<FuzzyResult>,
    ) {
        if !prefix.is_empty() {
             let distance = levenshtein(prefix, word);
            if distance <= max_distance {
                if node.is_end_of_word {
                    results.push(FuzzyResult {
                        token: prefix.to_string(),
                        distance,
                    });
                }
            }
             // Pruning the search space
            let min_possible_dist = prefix.chars().count().abs_diff(word.chars().count());
            if min_possible_dist > max_distance && distance > max_distance {
                 return;
            }
        }


        for (char, next_node) in &node.children {
            let new_prefix = format!("{}{}", prefix, char);
            self._search_recursive(next_node, &new_prefix, word, max_distance, results);
        }
    }
}

// --- FFI-Safe Data Structures ---

#[derive(Serialize, Deserialize, Debug)]
struct FuzzyResult {
    token: String,
    distance: usize,
}

// --- Global Static Trie Instance ---

lazy_static! {
    static ref TRIE: Mutex<Trie> = Mutex::new(Trie::new());
}

// --- Exposed FFI Functions ---

/// Initializes or resets the global Trie.
#[no_mangle]
pub extern "C" fn init_trie() {
    *TRIE.lock().unwrap() = Trie::new();
}

/// Inserts a word into the Trie. Expects a null-terminated C string.
#[no_mangle]
pub extern "C" fn insert_word(word_c: *const c_char) {
    let word = unsafe { CStr::from_ptr(word_c).to_str().unwrap_or("") };
    if !word.is_empty() {
        TRIE.lock().unwrap().insert(word);
    }
}

/// Deletes a word from the Trie. Expects a null-terminated C string.
#[no_mangle]
pub extern "C" fn delete_word(word_c: *const c_char) {
    let word = unsafe { CStr::from_ptr(word_c).to_str().unwrap_or("") };
    if !word.is_empty() {
        TRIE.lock().unwrap().delete(word);
    }
}

/// Performs a fuzzy search. Returns results as a JSON string.
/// The caller is responsible for freeing the memory of the returned string.
#[no_mangle]
pub extern "C" fn search_fuzzy(word_c: *const c_char, max_distance: usize) -> *mut c_char {
    let word = unsafe { CStr::from_ptr(word_c).to_str().unwrap_or("") };
    if word.is_empty() {
        let empty_json = CString::new("[]").unwrap();
        return empty_json.into_raw();
    }

    let results = TRIE.lock().unwrap().search_fuzzy(word, max_distance);
    let json_string = serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string());

    CString::new(json_string).unwrap().into_raw()
}

/// Frees the memory of a C string that was allocated by Rust.
#[no_mangle]
pub extern "C" fn free_string(s: *mut c_char) {
    if s.is_null() {
        return;
    }
    unsafe {
        let _ = CString::from_raw(s);
    }
}
