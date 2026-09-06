export const STORY_MODELS = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
    name: 'Qwen 2.5 · 0.5B',
    size: '~400 MB',
    memory: '~1.1 GB GPU memory',
    license: 'Apache-2.0',
    description:
      'A compact starting point. Fast on compatible devices; prose and extraction quality are limited.',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
    name: 'Qwen 2.5 · 1.5B',
    size: '~1 GB',
    memory: '~2 GB GPU memory',
    license: 'Apache-2.0',
    description:
      'More room for nuance. A better storyteller on devices with enough graphics memory.',
  },
] as const
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'
export const EMBEDDING_CACHE = 'storied-embeddings-v1'
