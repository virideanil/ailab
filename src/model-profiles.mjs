// Curated integration controls, not quality-qualified product defaults.
// Revisions, LFS SHA-256 and exact bytes verified against official Qwen upload commits.
export const modelProfiles = Object.freeze(Object.fromEntries(Object.entries({
  "coder-0.5b": {
    "repository": "Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF",
    "revision": "bf1da6ca8f02b444067db175f02a14e74f49c5c0",
    "filename": "qwen2.5-coder-0.5b-instruct-q4_k_m.gguf",
    "sha256": "1d9614638d18024d0fbb36575a15f1302a3adf044df10345688ec4f6e1c4ff32",
    "bytes": 491400064
  },
  "coder-1.5b": {
    "repository": "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF",
    "revision": "2ab9f8f42af02fc212effaef7c4850c885e965f4",
    "filename": "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
    "sha256": "cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046",
    "bytes": 1117320768
  }
}).map(([name, profile]) => [name, Object.freeze(profile)])));
