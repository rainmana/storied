# Local models

Storied ships no model weights and never silently starts a download. On-device inference happens in dedicated browser workers. Writing and worldbuilding are immediately usable without a model. Optional [API and local-server connections](PROVIDERS.md) are configured separately. To return from an API connection, choose **Use on-device inference** in Settings; loading a browser model alone does not switch your selected connection.

| Role                                  | Runtime                    | Initial model                     | Approximate requirements                                     |
| ------------------------------------- | -------------------------- | --------------------------------- | ------------------------------------------------------------ |
| Storyteller, worldbuilding, extractor | WebLLM / WebGPU            | Qwen2.5-0.5B-Instruct-q4f32_1-MLC | ~400 MB download; ~1.1 GB available graphics memory          |
| More capable generation               | WebLLM / WebGPU            | Qwen2.5-1.5B-Instruct-q4f32_1-MLC | ~1 GB download; ~2 GB available graphics memory              |
| Embeddings                            | Transformers.js / CPU WASM | Xenova/all-MiniLM-L6-v2, q8       | ~23 MB model; 384-dimensional normalized mean-pooled vectors |

Catalog IDs are fixed in source. Sizes are estimates, not device guarantees. WebGPU adapter detection establishes availability, not enough memory for every model. GPU device loss, browser limits, and other applications can still cause loading/generation failures. The 4096-token context is bounded by the compiler’s character budget, with room for output. The approximate token counter is not the model tokenizer.

## Using a model

The same selected model also serves the manuscript writer, continuity/prose/voice reviewers, and sample analyst in separate contexts. On-device manuscript responses are compact: one draft paragraph or at most one finding/observation, with short fields and a 550-token generation cap. Oversized prompts pause with a context-limit explanation; they are not silently shortened or sent to a cloud model. The smallest Qwen model can return inaccurate or invalid reviews even under a response contract, so these remain editorial suggestions.

1. Open Settings. Review model size and device support.
2. Choose **Download & load** (or **Download search model**).
3. Wait for a loaded/ready status. The progress message explicitly says only model assets are downloading.
4. Start or resume an adventure. Do and Say generate a draft; Story lets you author one directly.
5. Edit, retry, discard, or accept the draft. Extraction follows accepted generated passages if the model is available.
6. Review proposed world changes one at a time. A generated passage alone changes no canon.

After reloading, use **Load from device**. The download gate stays closed, so a missing asset produces a recoverable error rather than an automatic download. Use **Repair download** if online. Model removal deletes cached assets and unloads that model. Cancel stops the dedicated workers, discards any incomplete result, and requires loading again. Partial download caches may remain reusable or removable.

## Retrieval

Download/load MiniLM, then build the search index in Settings or request a meaning search. Embeddings and cosine search stay on device. Each indexed document uses the first 2,400 characters in this MVP; the complete original text remains in local exact search. The transformer may further truncate to its input limit. Long-document chunking is a documented follow-up.

Text search works immediately, including names, tags, relationships, manuscripts, adventure turns, world facts, knowledge, memories, and journal notes. The author’s search can inspect secrets. Story retrieval filters to allowed canonical entity IDs in SQL before ranking/limiting, then passes IDs through the compiler’s visibility checks again. A stale vector cannot match an edited document’s current source.

## Troubleshooting

- **No WebGPU:** try a supported browser/device with hardware acceleration. Story/manual writing and CPU semantic search remain available.
- **Out of GPU memory:** close other GPU-heavy applications or use the smaller model. Storied never falls back to cloud AI.
- **Asset/cache missing while offline:** return online and explicitly repair the model download. Do not delete your project to troubleshoot a model.
- **Poor prose:** retry or edit it. Compact models are limited. The author remains the editor.
- **Extraction invalid:** no world mutation occurs. Use the passage’s “Propose change” control to state the change yourself.
- **Search model cache incomplete:** remove and download it again. The application’s WASM runtime is bundled and precached separately.

Official runtime documentation: [WebLLM basic usage](https://webllm.mlc.ai/docs/user/basic_usage.html), [worker and cache behavior](https://webllm.mlc.ai/docs/user/advanced_usage.html), [Transformers.js pipeline](https://huggingface.co/docs/transformers.js/v3.8.1/pipelines). Model terms: [Qwen 2.5 0.5B](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct), [Qwen 2.5 1.5B](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct), [MiniLM](https://huggingface.co/Xenova/all-MiniLM-L6-v2).
