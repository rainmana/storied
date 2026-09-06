export const DATABASE_SCHEMA = `
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE TABLE IF NOT EXISTS migrations (version integer PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS projects (id text PRIMARY KEY, body jsonb NOT NULL, updated_at text NOT NULL);
  CREATE TABLE IF NOT EXISTS documents (project_id text REFERENCES projects(id) ON DELETE CASCADE, id text, kind text, title text, body text, target text, tags jsonb, PRIMARY KEY(project_id,id));
  CREATE TABLE IF NOT EXISTS embeddings (project_id text REFERENCES projects(id) ON DELETE CASCADE, id text, source text, embedding vector(384), PRIMARY KEY(project_id,id));
  CREATE TABLE IF NOT EXISTS relationships (project_id text REFERENCES projects(id) ON DELETE CASCADE, id text, from_id text, to_id text, label text, body jsonb, PRIMARY KEY(project_id,id));
  CREATE INDEX IF NOT EXISTS relation_from ON relationships(project_id,from_id);
  CREATE INDEX IF NOT EXISTS relation_to ON relationships(project_id,to_id);
  INSERT INTO migrations VALUES (1) ON CONFLICT DO NOTHING;
`
export const SEMANTIC_QUERY = `
  SELECT d.*, 1-(e.embedding <=> $2::vector) AS similarity
  FROM embeddings e JOIN documents d
    ON d.project_id=e.project_id AND d.id=e.id AND d.body=e.source
  WHERE e.project_id=$1
    AND ($3::text[] IS NULL OR d.id=ANY($3::text[]))
    AND ($4::text IS NULL OR d.kind=$4)
    AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(d.tags) tag WHERE tag ILIKE $5))
  ORDER BY e.embedding <=> $2::vector LIMIT 30
`
