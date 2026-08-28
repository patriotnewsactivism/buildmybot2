/**
 * Automated PDF/URL vector RAG re-indexing queues in Supabase pgvector.
 */

export interface RagQueueItem {
  id: string;
  botId: string;
  organizationId: string;
  sourceType: 'pdf' | 'url' | 'raw_text';
  sourceUrlOrPath: string;
  status: 'queued' | 'processing' | 'indexed' | 'failed';
  errorMessage?: string;
  chunkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunk {
  botId: string;
  content: string;
  embedding?: number[];
  metadata: {
    sourceType: string;
    sourceUrlOrPath: string;
    chunkIndex: number;
  };
}

export function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) return [cleaned];

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end === cleaned.length) break;
    start += chunkSize - overlap;
  }

  return chunks;
}

export async function generateOpenAiEmbeddings(chunks: string[], apiKey: string): Promise<number[][]> {
  if (!apiKey || chunks.length === 0) return [];

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: chunks,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding generation failed: ${response.statusText}`);
  }

  const result = await response.json();
  return (result.data || []).map((item: { embedding: number[] }) => item.embedding);
}

export async function indexRagQueueItem(
  item: RagQueueItem,
  rawContent: string,
  options: { apiKey: string; supabaseUrl: string; supabaseKey: string }
): Promise<{ success: boolean; chunkCount: number; error?: string }> {
  try {
    const textChunks = chunkText(rawContent);
    if (textChunks.length === 0) {
      return { success: true, chunkCount: 0 };
    }

    const embeddings = await generateOpenAiEmbeddings(textChunks, options.apiKey);

    const records = textChunks.map((content, idx) => ({
      bot_id: item.botId,
      organization_id: item.organizationId,
      content,
      embedding: embeddings[idx] || null,
      metadata: {
        source_type: item.sourceType,
        source_url: item.sourceUrlOrPath,
        chunk_index: idx,
      },
      created_at: new Date().toISOString(),
    }));

    // Batch insert into bot_embeddings table in Supabase
    const insertResponse = await fetch(`${options.supabaseUrl}/rest/v1/bot_embeddings`, {
      method: 'POST',
      headers: {
        apikey: options.supabaseKey,
        Authorization: `Bearer ${options.supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(records),
    });

    if (!insertResponse.ok) {
      throw new Error(`Failed to store embeddings in Supabase: ${insertResponse.statusText}`);
    }

    return { success: true, chunkCount: textChunks.length };
  } catch (err: any) {
    return { success: false, chunkCount: 0, error: err.message || 'Unknown indexing error' };
  }
}
