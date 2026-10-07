// Curated integration controls, not quality-qualified product defaults.
// Revisions, LFS SHA-256 and exact bytes verified against official Qwen upload commits.
export const modelProfiles = Object.freeze(Object.fromEntries(Object.entries({
  "qwen3-4b": {
    repository:"Qwen/Qwen3-4B-GGUF",
    revision:"bc640142c66e1fdd12af0bd68f40445458f3869b",
    filename:"Qwen3-4B-Q4_K_M.gguf",
    sha256:"7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5",
    bytes:2497280256,license:"apache-2.0"
  },
  "coder-3b-research": {
    repository:"Qwen/Qwen2.5-Coder-3B-Instruct-GGUF",
    revision:"f74adce6aa16316c625447af059dbebe4983757c",
    filename:"qwen2.5-coder-3b-instruct-q4_k_m.gguf",
    sha256:"724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7",
    bytes:2104932800,license:"qwen-research"
  },
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
