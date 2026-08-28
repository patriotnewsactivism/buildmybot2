import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface IngestJob {
  id: string;
  botId: string;
  sourceType: 'pdf' | 'url';
  sourceUrl: string;
  maxChunkSize: number;
}

export interface ChunkEmbedding {
  chunkText: string;
  chunkIndex: number;
  embedding: number[];
}

export class RagIngestionQueue {
  public static readonly MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
  public static readonly CHUNK_SIZE = 800;
  public static readonly CHUNK_OVERLAP = 100;

  public static chunkStreamText(text: string, chunkSize = RagIngestionQueue.CHUNK_SIZE, overlap = RagIngestionQueue.CHUNK_OVERLAP): string[] {
    if (!text || !text.trim()) return [];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      if (end >= text.length) break;
      start += chunkSize - overlap;
    }
    return chunks;
  }

  public static async processIngestJob(
    job: IngestJob,
    rawContent: string,
    supabaseClient?: any
  ): Promise<{ status: 'completed' | 'failed'; chunksIndexed: number; error?: string }> {
    if (rawContent.length > this.MAX_FILE_SIZE_BYTES) {
      return { status: 'failed', chunksIndexed: 0, error: 'Document exceeds 10MB limit' };
    }
    const chunks = this.chunkStreamText(rawContent, job.maxChunkSize || this.CHUNK_SIZE);
    
    if (supabaseClient) {
      const rows = chunks.map((chunk, index) => ({
        bot_id: job.botId,
        source_url: job.sourceUrl,
        source_type: job.sourceType,
        chunk_index: index,
        content: chunk,
      }));
      const { error } = await supabaseClient.from('bot_knowledge_embeddings').insert(rows);
      if (error) {
        return { status: 'failed', chunksIndexed: 0, error: error.message };
      }
    }
    return { status: 'completed', chunksIndexed: chunks.length };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const { botId, sourceType, sourceUrl, content } = req.body || {};
  if (!botId || !sourceType || !sourceUrl || typeof content !== 'string') {
    return res.status(400).json({ error: 'Invalid RAG payload' });
  }
  const result = await RagIngestionQueue.processIngestJob(
    { id: `job_${Date.now()}`, botId, sourceType, sourceUrl, maxChunkSize: 800 },
    content
  );
  if (result.status === 'failed') {
    return res.status(400).json(result);
  }
  return res.status(200).json(result);
}
