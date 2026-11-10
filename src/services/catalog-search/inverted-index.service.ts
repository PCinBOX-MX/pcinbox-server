/**
 * Índice invertido en el mismo proceso.
 * Cada token apunta a los productos que lo contienen. Una búsqueda intersecta
 * esas listas y solo puntúa a los candidatos, no al catálogo completo.
 */
import { compactCode, foldSearchText, normalizeSearchTerm } from "./search-normalize";

export const SEARCH_SUGGEST_LIMIT = 20;
export const SEARCH_RESULTS_LIMIT = 250;

const STOP_WORDS = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "y",
  "en",
  "con",
  "para",
  "del",
  "al",
  "un",
  "una",
  "por",
  "the",
  "of",
  "and",
]);

const MAX_DESCRIPTION_TOKENS = 24;
const MAX_PREFIX_VARIANTS = 40;
const MAX_PREFIX_SPAN = 400;
const MAX_FUZZY_HITS = 6;
const MIN_FUZZY_LENGTH = 5;

export type IndexableProduct = {
  idProduct: number;
  name?: string | null;
  description?: string | null;
  sku?: string | null;
  upc?: string | null;
  idProductExt?: string | null;
  nameMarca?: string | null;
  nameCategory?: string | null;
  marca?: { name?: string | null } | null;
  categories?: { name?: string | null } | null;
};

export type InvertedIndex<T extends IndexableProduct> = {
  products: T[];
  postings: Map<string, number[]>;
  vocab: string[];
  fuzzyBuckets: Map<string, number[]>;
  names: string[];
  brands: string[];
  categories: string[];
  codes: string[];
};

const EMPTY: number[] = [];

function brandOf(product: IndexableProduct): string {
  return product.nameMarca || product.marca?.name || "";
}

function categoryOf(product: IndexableProduct): string {
  return product.nameCategory || product.categories?.name || "";
}

function tokenize(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const token of text.split(" ")) {
    if (token.length < 2 || token.length > 48 || STOP_WORDS.has(token)) continue;
    out.push(token);
    const parts = token.match(/[a-z]{3,}|\d{3,}/g);
    if (!parts || parts.length < 2) continue;
    for (const part of parts) {
      if (part !== token && !STOP_WORDS.has(part)) out.push(part);
    }
  }
  return out;
}

function addToken(lists: Map<string, number[]>, token: string, productIndex: number) {
  let list = lists.get(token);
  if (!list) {
    list = [];
    lists.set(token, list);
  }
  if (list[list.length - 1] !== productIndex) list.push(productIndex);
}

function lowerBound(vocab: string[], prefix: string): number {
  let lo = 0;
  let hi = vocab.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const word = vocab[mid] ?? "";
    if (word < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function intersect(left: number[], right: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const a = left[i] ?? 0;
    const b = right[j] ?? 0;
    if (a === b) {
      out.push(a);
      i += 1;
      j += 1;
    } else if (a < b) i += 1;
    else j += 1;
  }
  return out;
}

function union(left: number[], right: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const a = left[i] ?? 0;
    const b = right[j] ?? 0;
    if (a === b) {
      out.push(a);
      i += 1;
      j += 1;
    } else if (a < b) {
      out.push(a);
      i += 1;
    } else {
      out.push(b);
      j += 1;
    }
  }
  while (i < left.length) out.push(left[i++] ?? 0);
  while (j < right.length) out.push(right[j++] ?? 0);
  return out;
}

function withinDistance(left: string, right: string, max: number): boolean {
  if (Math.abs(left.length - right.length) > max) return false;
  const prev = new Array<number>(right.length + 1);
  const next = new Array<number>(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) prev[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    next[0] = i;
    let rowMin = i;
    const leftChar = left[i - 1];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = leftChar === right[j - 1] ? 0 : 1;
      const inserted = (next[j - 1] ?? 0) + 1;
      const deleted = (prev[j] ?? 0) + 1;
      const replaced = (prev[j - 1] ?? 0) + cost;
      const value = Math.min(inserted, deleted, replaced);
      next[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return false;
    for (let j = 0; j <= right.length; j += 1) prev[j] = next[j] ?? 0;
  }
  return (prev[right.length] ?? max + 1) <= max;
}

export function buildInvertedIndex<T extends IndexableProduct>(
  products: T[],
): InvertedIndex<T> {
  const lists = new Map<string, number[]>();
  const names: string[] = [];
  const brands: string[] = [];
  const categories: string[] = [];
  const codes: string[] = [];

  products.forEach((product, productIndex) => {
    const name = foldSearchText(product.name);
    const brand = foldSearchText(brandOf(product));
    const category = foldSearchText(categoryOf(product));
    const sku = compactCode(product.sku);
    const upc = compactCode(product.upc);
    const ext = compactCode(product.idProductExt);
    names.push(name);
    brands.push(brand);
    categories.push(category);
    codes.push([sku, upc, ext].filter(Boolean).join(" "));

    const seen = new Set<string>();
    const push = (token: string) => {
      if (seen.has(token)) return;
      seen.add(token);
      addToken(lists, token, productIndex);
    };

    for (const token of tokenize(name)) push(token);
    for (const token of tokenize(brand)) push(token);
    for (const token of tokenize(category)) push(token);
    for (const token of tokenize(foldSearchText(product.sku))) push(token);
    for (const token of tokenize(foldSearchText(product.upc))) push(token);
    for (const token of tokenize(foldSearchText(product.idProductExt))) push(token);
    if (sku.length >= 4) push(sku);
    if (upc.length >= 4) push(upc);
    if (ext.length >= 4) push(ext);

    // El cliente reescribe sinónimos también en el texto del producto.
    // Indexar esa forma hace que "gpu" encuentre "tarjeta gráfica".
    const canonical = normalizeSearchTerm(
      [product.name, brandOf(product), categoryOf(product), product.sku]
        .filter(Boolean)
        .join(" "),
    );
    for (const token of tokenize(canonical)) push(token);

    let descriptionCount = 0;
    for (const token of tokenize(foldSearchText(product.description))) {
      if (descriptionCount >= MAX_DESCRIPTION_TOKENS) break;
      if (seen.has(token)) continue;
      push(token);
      descriptionCount += 1;
    }
  });

  const postings = new Map<string, number[]>();
  for (const [token, ids] of lists) {
    postings.set(token, ids);
  }

  const vocab = [...postings.keys()].sort();
  const fuzzyBuckets = new Map<string, number[]>();
  vocab.forEach((word, vocabIndex) => {
    if (word.length < MIN_FUZZY_LENGTH || /^\d+$/.test(word)) return;
    const key = `${word[0]}:${word.length}`;
    let bucket = fuzzyBuckets.get(key);
    if (!bucket) {
      bucket = [];
      fuzzyBuckets.set(key, bucket);
    }
    bucket.push(vocabIndex);
  });

  const frozenBuckets = new Map<string, number[]>();
  for (const [key, bucket] of fuzzyBuckets) {
    frozenBuckets.set(key, bucket);
  }

  return {
    products,
    postings,
    vocab,
    fuzzyBuckets: frozenBuckets,
    names,
    brands,
    categories,
    codes,
  };
}

function prefixPostings<T extends IndexableProduct>(
  index: InvertedIndex<T>,
  prefix: string,
): number[] {
  const start = lowerBound(index.vocab, prefix);
  const end = lowerBound(index.vocab, `${prefix}\uffff`);
  const span = end - start;
  if (span <= 0 || span > MAX_PREFIX_SPAN) return EMPTY;

  const chosen: number[] = [];
  for (let cursor = start; cursor < end; cursor += 1) chosen.push(cursor);
  if (chosen.length > MAX_PREFIX_VARIANTS) {
    chosen.sort(
      (a, b) => (index.vocab[a]?.length ?? 0) - (index.vocab[b]?.length ?? 0),
    );
    chosen.length = MAX_PREFIX_VARIANTS;
  }

  let acc = EMPTY;
  for (const vocabIndex of chosen) {
    const word = index.vocab[vocabIndex];
    if (!word) continue;
    const posting = index.postings.get(word) ?? EMPTY;
    acc = acc.length === 0 ? posting : union(acc, posting);
  }
  return acc;
}

function fuzzyPostings<T extends IndexableProduct>(
  index: InvertedIndex<T>,
  token: string,
): number[] {
  if (token.length < MIN_FUZZY_LENGTH || /^\d+$/.test(token)) return EMPTY;
  const lists: number[][] = [];
  const first = token[0];
  if (!first) return EMPTY;

  for (let length = token.length - 1; length <= token.length + 1; length += 1) {
    if (length < MIN_FUZZY_LENGTH) continue;
    const bucket = index.fuzzyBuckets.get(`${first}:${length}`);
    if (!bucket) continue;
    for (const vocabIndex of bucket) {
      const word = index.vocab[vocabIndex];
      if (!word || word === token) continue;
      if (!withinDistance(token, word, 1)) continue;
      const posting = index.postings.get(word);
      if (posting) lists.push(posting);
      if (lists.length >= MAX_FUZZY_HITS) break;
    }
    if (lists.length >= MAX_FUZZY_HITS) break;
  }

  let acc = EMPTY;
  for (const list of lists) acc = acc.length === 0 ? list : union(acc, list);
  return acc;
}

function postingsFor<T extends IndexableProduct>(
  index: InvertedIndex<T>,
  token: string,
): number[] {
  const exact = index.postings.get(token);
  if (exact && exact.length > 0) return exact;
  if (token.length >= 3) {
    const prefixed = prefixPostings(index, token);
    if (prefixed.length > 0) return prefixed;
  }
  return fuzzyPostings(index, token);
}

function resolveToken<T extends IndexableProduct>(
  index: InvertedIndex<T>,
  token: string,
): number[] {
  const direct = postingsFor(index, token);
  if (direct.length > 0) return direct;

  const parts = token.match(/[a-z]{3,}|\d{2,}/g);
  if (!parts || parts.length < 2) return EMPTY;
  let acc = EMPTY;
  for (const part of parts) {
    const posting = postingsFor(index, part);
    if (posting.length === 0) return EMPTY;
    acc = acc.length === 0 ? posting : intersect(acc, posting);
    if (acc.length === 0) return EMPTY;
  }
  return acc;
}

type Rank = { index: number; score: number };

function consider(top: Rank[], limit: number, productIndex: number, score: number) {
  const last = top[top.length - 1];
  if (top.length === limit && last) {
    if (score < last.score) return;
    if (score === last.score && productIndex >= last.index) return;
  }

  let pos = top.length;
  while (pos > 0) {
    const prev = top[pos - 1];
    if (!prev) break;
    if (prev.score > score || (prev.score === score && prev.index < productIndex)) break;
    pos -= 1;
  }
  top.splice(pos, 0, { index: productIndex, score });
  if (top.length > limit) top.pop();
}

function scoreCandidate<T extends IndexableProduct>(
  index: InvertedIndex<T>,
  productIndex: number,
  query: string,
  tokens: string[],
  compactQuery: string,
): number {
  const name = index.names[productIndex] ?? "";
  const brand = index.brands[productIndex] ?? "";
  const category = index.categories[productIndex] ?? "";
  const codes = index.codes[productIndex] ?? "";
  let score = 5;

  if (compactQuery.length >= 4 && codes.split(" ").includes(compactQuery)) score += 200;
  if (name === query) score += 150;
  if (query && name.startsWith(query)) score += 80;
  if (query && name.includes(query)) score += 40;
  if (query && category.includes(query)) score += 24;

  let tokensInName = 0;
  for (const token of tokens) {
    if (name.includes(token)) {
      score += 30;
      tokensInName += 1;
    } else if (codes.includes(token)) score += 35;
    else if (brand.includes(token)) score += 20;
    else if (category.includes(token)) score += 18;
    else score += 4;
  }
  if (tokens.length > 0 && tokensInName === tokens.length) score += 25;
  return score;
}

export function searchInvertedIndex<T extends IndexableProduct>(
  index: InvertedIndex<T>,
  rawQuery: string,
  limit: number,
  include?: (product: T) => boolean,
): T[] {
  const safeLimit = Math.max(1, Math.min(limit, SEARCH_RESULTS_LIMIT));
  const query = normalizeSearchTerm(rawQuery).slice(0, 120);
  if (query.length < 2) return [];

  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const token of query.split(" ")) {
    if (token.length < 2 || STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  if (tokens.length === 0) return [];

  const lists = tokens
    .map((token) => resolveToken(index, token))
    .filter((list) => list.length > 0)
    .sort((a, b) => a.length - b.length);
  if (lists.length === 0) return [];

  let candidates = lists[0] ?? EMPTY;
  for (let cursor = 1; cursor < lists.length; cursor += 1) {
    const next = lists[cursor];
    if (!next) break;
    const narrowed = intersect(candidates, next);
    if (narrowed.length === 0) break;
    candidates = narrowed;
  }
  if (candidates.length === 0) return [];

  const compactQuery = compactCode(query);
  const top: Rank[] = [];
  for (const productIndex of candidates) {
    const product = index.products[productIndex];
    if (!product || (include && !include(product))) continue;
    consider(
      top,
      safeLimit,
      productIndex,
      scoreCandidate(index, productIndex, query, tokens, compactQuery),
    );
  }

  const hits: T[] = [];
  for (const rank of top) {
    const product = index.products[rank.index];
    if (product) hits.push(product);
  }
  return hits;
}
