type ChunkOptions = {
  minTokens?: number;
  maxTokens?: number;
  targetTokens?: number;
  overlapTokens?: number;
};

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const normalizeText = (text: string) =>
  text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();

const getOverlapStartIndex = (
  words: string[],
  start: number,
  end: number,
  overlapTokens: number,
) => {
  let overlap = 0;
  let idx = end;
  while (idx > start && overlap < overlapTokens) {
    idx -= 1;
    overlap += estimateTokens(words[idx]);
  }
  return idx;
};

export const chunkTextWithOverlap = (
  text: string,
  options: ChunkOptions = {},
): string[] => {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const minTokens = options.minTokens ?? 500;
  const maxTokens = options.maxTokens ?? 1000;
  const targetTokens = Math.min(options.targetTokens ?? 800, maxTokens);
  const overlapTokens = options.overlapTokens ?? 100;

  const words = normalized.split(' ').filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    let end = start;
    let tokenCount = 0;

    while (end < words.length && tokenCount < targetTokens) {
      tokenCount += estimateTokens(words[end]);
      end += 1;
    }

    while (end < words.length && tokenCount < minTokens) {
      tokenCount += estimateTokens(words[end]);
      end += 1;
    }

    if (end === start) {
      end = Math.min(start + 1, words.length);
    }

    const chunk = words.slice(start, end).join(' ').trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= words.length) {
      break;
    }

    start = getOverlapStartIndex(words, start, end, overlapTokens);
  }

  return chunks;
};
