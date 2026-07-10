// RAG Pipeline — Chunking, Embedding, and Vector Search
// Uses OpenAI embeddings (text-embedding-3-small, 1536 dims) to match
// the existing knowledge_chunks.embedding vector(1536) column.
// Falls back to keyword search if no embedding API key is available.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// Embedding provider — OpenAI text-embedding-3-small (1536 dims, matches DB schema)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const EMBEDDING_MODEL = 'text-embedding-3-small';

// ─── Chunking ─────────────────────────────────────────────────────────
// Split text into overlapping chunks of ~500 tokens (~2000 chars).
// Overlap ensures context isn't lost at chunk boundaries.
const CHUNK_SIZE = 2000; // chars (~500 tokens)
const CHUNK_OVERLAP = 200;

export function chunkText(text: string): string[] {
  if (!text || text.length <= CHUNK_SIZE) return text ? [text.trim()] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + CHUNK_SIZE;
    // Try to break at a sentence boundary
    if (end < text.length) {
      const slice = text.slice(start, end + 200);
      const sentenceEnd = slice.lastIndexOf('. ');
      const newlineEnd = slice.lastIndexOf('\n');
      const breakPoint = Math.max(sentenceEnd, newlineEnd);
      if (breakPoint > CHUNK_SIZE * 0.5) {
        end = start + breakPoint + 1;
      }
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

// ─── Embedding ────────────────────────────────────────────────────────

export async function embedText(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });
    if (!resp.ok) {
      console.error('[rag] embedding failed:', resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    return data.data?.[0]?.embedding || null;
  } catch (err: any) {
    console.error('[rag] embedding error:', err.message);
    return null;
  }
}

export async function embedBatch(
  texts: string[],
): Promise<(number[] | null)[]> {
  if (!OPENAI_API_KEY || texts.length === 0) return texts.map(() => null);
  try {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    });
    if (!resp.ok) {
      console.error('[rag] batch embedding failed:', resp.status);
      return texts.map(() => null);
    }
    const data = await resp.json();
    return (data.data || [])
      .sort((a: any, b: any) => a.index - b.index)
      .map((d: any) => d.embedding || null);
  } catch (err: any) {
    console.error('[rag] batch embedding error:', err.message);
    return texts.map(() => null);
  }
}

// ─── Ingestion ────────────────────────────────────────────────────────
// Chunk + embed a knowledge source and persist to knowledge_chunks

export async function ingestKnowledgeSource(
  sourceId: string,
  botId: string,
  content: string,
): Promise<{ chunksCreated: number; embedded: boolean }> {
  // 1. Chunk the content
  const chunks = chunkText(content);
  if (chunks.length === 0) return { chunksCreated: 0, embedded: false };

  // 2. Delete existing chunks for this source (re-ingestion)
  await fetch(
    `${SUPABASE_URL}/rest/v1/knowledge_chunks?source_id=eq.${sourceId}`,
    { method: 'DELETE', headers: SUPABASE_HEADERS },
  ).catch(() => {});

  // 3. Embed all chunks in one batch
  const embeddings = await embedBatch(chunks);
  const hasEmbeddings = embeddings.some((e) => e !== null);

  // 4. Insert chunks with embeddings
  const rows = chunks.map((text, i) => ({
    source_id: sourceId,
    bot_id: botId,
    chunk_index: i,
    content: text,
    token_count: Math.ceil(text.length / 4),
    ...(embeddings[i] ? { embedding: JSON.stringify(embeddings[i]) } : {}),
  }));

  // Insert in batches of 20 to avoid payload limits
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    await fetch(`${SUPABASE_URL}/rest/v1/knowledge_chunks`, {
      method: 'POST',
      headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify(batch),
    });
  }

  // 5. Update source status
  await fetch(`${SUPABASE_URL}/rest/v1/knowledge_sources?id=eq.${sourceId}`, {
    method: 'PATCH',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'ready',
      last_processed_at: new Date().toISOString(),
      processing_state: { chunks: chunks.length, embedded: hasEmbeddings },
    }),
  });

  return { chunksCreated: chunks.length, embedded: hasEmbeddings };
}

// ─── Retrieval ────────────────────────────────────────────────────────
// Vector similarity search with keyword fallback

export async function searchKnowledge(
  botId: string,
  query: string,
  topK = 5,
): Promise<string[]> {
  // Try vector search first
  const queryEmbedding = await embedText(query);

  if (queryEmbedding) {
    // Use Supabase RPC for vector similarity search
    // We call a Postgres function that does cosine similarity
    const rpcResp = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/match_knowledge_chunks`,
      {
        method: 'POST',
        headers: SUPABASE_HEADERS,
        body: JSON.stringify({
          query_embedding: JSON.stringify(queryEmbedding),
          match_bot_id: botId,
          match_threshold: 0.5,
          match_count: topK,
        }),
      },
    );

    if (rpcResp.ok) {
      const results = await rpcResp.json();
      if (Array.isArray(results) && results.length > 0) {
        return results.map((r: any) => r.content);
      }
    }
  }

  // Fallback: keyword search using Postgres full-text
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 5);

  if (keywords.length === 0) return [];

  // Simple ILIKE search on chunks for this bot
  const params = new URLSearchParams({
    select: 'content',
    bot_id: `eq.${botId}`,
    order: 'chunk_index.asc',
    limit: String(topK),
  });

  // Search for chunks containing the query keywords
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/knowledge_chunks?${params}&content=ilike.*${keywords[0]}*`,
    { headers: SUPABASE_HEADERS },
  );

  if (resp.ok) {
    const results = await resp.json();
    return (results || []).map((r: any) => r.content);
  }

  return [];
}

// ─── URL Scraping ─────────────────────────────────────────────────────

export async function scrapeUrl(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'BuildMyBot-KnowledgeBot/1.0',
        Accept: 'text/html,application/xhtml+xml,text/plain',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    // Basic HTML to text conversion: strip tags, decode entities, collapse whitespace
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50000); // Cap at ~50k chars per URL
  } catch (err: any) {
    console.error('[rag] scrape failed for', url, err.message);
    return '';
  }
}
