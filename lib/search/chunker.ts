/**
 * Sentence-aware chunker for long document OCR text.
 *
 * Produces ~400-token chunks with ~50-token overlap, respecting
 * sentence boundaries where possible so passages don't start or end
 * mid-word. Each chunk records its page number (estimated if the
 * source text includes page-feed markers) and its char offsets into
 * the original full text so the result can deep-link back to the
 * source PDF.
 *
 * This is a pure function, no DB access — easy to test and reuse in
 * both the one-shot chunker script and any realtime pipeline.
 */

export type Chunk = {
  chunkIndex: number;
  pageNumber: number | null;
  charStart: number;
  charEnd: number;
  text: string;
  tokenCount: number;
};

export type ChunkerOptions = {
  /** Target tokens per chunk. Defaults to 400. */
  targetTokens?: number;
  /** Tokens of overlap between consecutive chunks. Defaults to 50. */
  overlapTokens?: number;
  /**
   * Minimum tokens before we consider emitting a chunk on a sentence
   * boundary; lets short intros combine with the next paragraph.
   */
  minTokens?: number;
  /**
   * If the source text contains form-feed characters (\f) or
   * `[[page:N]]` markers, treat them as page boundaries. Overrides
   * the automatic page-counter.
   */
  pageMarker?: RegExp;
};

const DEFAULT_PAGE_MARKER = /\f|\[\[\s*page\s*[:=]\s*(\d+)\s*\]\]/gi;

/**
 * Rough token estimation — Postgres embeddings cost is driven by
 * OpenAI's tokenizer, but for chunking we just need a stable
 * heuristic. ~4 chars per token is the conventional English rule of
 * thumb and is close enough for layout purposes.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Split text into sentences without pulling in an NLP library. Good
 * enough for paragraph-bounded medical records, legal briefs, and
 * correspondence. Handles common abbreviations by not splitting on
 * lowercase-letter follow-ups.
 */
function splitSentences(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const c = text[i];
    if (c === "." || c === "?" || c === "!" || c === "\n") {
      // Look ahead: if the next non-whitespace char is lowercase, it
      // was probably an abbreviation (e.g. "Dr. Smith"). Skip.
      let j = i + 1;
      while (j < len && (text[j] === " " || text[j] === "\t")) j++;
      const nextChar = text[j];
      if (c !== "\n" && nextChar && nextChar >= "a" && nextChar <= "z") {
        continue;
      }
      const piece = text.slice(start, i + 1).trim();
      if (piece) parts.push(piece);
      start = i + 1;
    }
  }
  const trailing = text.slice(start).trim();
  if (trailing) parts.push(trailing);
  return parts;
}

/**
 * Build a page index so we can map any char offset back to a
 * 1-indexed page number. Uses explicit page markers if present;
 * otherwise estimates by character budget.
 */
function buildPageIndex(
  text: string,
  marker: RegExp,
): Array<{ start: number; page: number }> {
  const out: Array<{ start: number; page: number }> = [{ start: 0, page: 1 }];
  let pageNo = 1;
  let match: RegExpExecArray | null;
  const rx = new RegExp(marker.source, marker.flags);
  while ((match = rx.exec(text)) !== null) {
    pageNo += 1;
    const capturedPage = match[1] ? parseInt(match[1], 10) : undefined;
    out.push({ start: match.index + match[0].length, page: capturedPage ?? pageNo });
    if (capturedPage) pageNo = capturedPage;
  }
  return out;
}

function pageForOffset(
  index: Array<{ start: number; page: number }>,
  offset: number,
  totalLen: number,
): number {
  if (!index.length) return 1;
  // If no explicit markers, estimate: 1 page every ~3000 chars.
  if (index.length === 1) {
    return Math.max(1, Math.floor(offset / 3000) + 1);
  }
  // Binary search would be faster but the list is tiny in practice.
  let page = 1;
  for (const entry of index) {
    if (entry.start <= offset) page = entry.page;
    else break;
  }
  return page;
}

export function chunkText(
  fullText: string,
  opts: ChunkerOptions = {},
): Chunk[] {
  const targetTokens = opts.targetTokens ?? 400;
  const overlapTokens = opts.overlapTokens ?? 50;
  const minTokens = opts.minTokens ?? 100;
  const marker = opts.pageMarker ?? DEFAULT_PAGE_MARKER;

  if (!fullText || !fullText.trim()) return [];

  const cleaned = fullText.replace(/\r\n/g, "\n");
  const pageIndex = buildPageIndex(cleaned, marker);
  const sentences = splitSentences(cleaned);

  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;
  let bufferStart = 0;
  let scanOffset = 0;

  const findOffset = (sentence: string, from: number): number => {
    const idx = cleaned.indexOf(sentence, from);
    return idx >= 0 ? idx : from;
  };

  for (const sentence of sentences) {
    const sentOffset = findOffset(sentence, scanOffset);
    scanOffset = sentOffset + sentence.length;
    const sentTokens = estimateTokens(sentence);

    if (buffer.length === 0) bufferStart = sentOffset;

    if (bufferTokens + sentTokens > targetTokens && bufferTokens >= minTokens) {
      // Emit the current buffer as a chunk.
      const chunkText = buffer.join(" ").trim();
      const charStart = bufferStart;
      const charEnd = charStart + chunkText.length;
      chunks.push({
        chunkIndex: chunks.length,
        pageNumber: pageForOffset(pageIndex, charStart, cleaned.length),
        charStart,
        charEnd,
        text: chunkText,
        tokenCount: bufferTokens,
      });
      // Start the next buffer with overlap pulled from the end of the
      // previous one so context is preserved across the seam.
      if (overlapTokens > 0 && buffer.length > 0) {
        const tail: string[] = [];
        let tailTokens = 0;
        for (let i = buffer.length - 1; i >= 0 && tailTokens < overlapTokens; i--) {
          tail.unshift(buffer[i]);
          tailTokens += estimateTokens(buffer[i]);
        }
        buffer = tail;
        bufferTokens = tailTokens;
        bufferStart = Math.max(0, charEnd - tail.join(" ").length);
      } else {
        buffer = [];
        bufferTokens = 0;
      }
    }

    buffer.push(sentence);
    bufferTokens += sentTokens;
  }

  if (buffer.length > 0) {
    const chunkText = buffer.join(" ").trim();
    const charStart = bufferStart;
    const charEnd = charStart + chunkText.length;
    chunks.push({
      chunkIndex: chunks.length,
      pageNumber: pageForOffset(pageIndex, charStart, cleaned.length),
      charStart,
      charEnd,
      text: chunkText,
      tokenCount: bufferTokens,
    });
  }

  return chunks;
}
