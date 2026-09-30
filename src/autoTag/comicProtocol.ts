import type { TargetSegment } from '@/autoTag/clean';
import { parseChanges, type ImageCharacterPrompt, type ImageInsertion, type ImagePlan } from '@/autoTag/protocol';
import { normalizeOrientation, type Orientation } from '@/backends/size';

export interface ComicPageBase {
  base: string;
  non_character?: string;
  position?: string;
}

export interface ComicPanelCharacter {
  character_id: string;
  positive: string;
  negative?: string;
  center?: { x: number; y: number };
}

export interface ComicPanel {
  id: string;
  description?: string;
  non_character?: string;
  characters: ComicPanelCharacter[];
}

export interface ComicPageData {
  format: 'nai5-comic';
  page: ComicPageBase;
  panels: ComicPanel[];
}

function cleanMarkdownFences(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : text.trim();
}

/** 从文本中找出所有合法的 nai5-comic JSON 对象 */
function extractComicJsonCandidates(raw: string): ComicPageData[] {
  // 1. 剥离 <thinking> 块
  const withoutThinking = raw.replace(/<think(?:ing)?\b[\s\S]*?<\/think(?:ing)?>/gi, '').trim();

  const candidates: ComicPageData[] = [];

  // 2. 优先匹配 <image>...</image> 标签内部内容
  const imageTagMatches = [...withoutThinking.matchAll(/<image>([\s\S]*?)<\/image>/gi)];
  for (const m of imageTagMatches) {
    const cleaned = cleanMarkdownFences(m[1]);
    try {
      const parsed = JSON.parse(cleaned) as unknown;
      if (isComicPageData(parsed)) {
        candidates.push(parsed);
      }
    } catch {
      // 尝试下一个候选
    }
  }

  if (candidates.length > 0) {
    return candidates;
  }

  // 3. 回落：尝试匹配 markdown 代码块
  for (const m of withoutThinking.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim()) as unknown;
      if (isComicPageData(parsed)) {
        candidates.push(parsed);
      }
    } catch {
      // ignore
    }
  }

  if (candidates.length > 0) {
    return candidates;
  }

  // 4. 回落：直接解析整段文本
  try {
    const parsed = JSON.parse(withoutThinking) as unknown;
    if (isComicPageData(parsed)) {
      candidates.push(parsed);
    }
  } catch {
    // ignore
  }

  return candidates;
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map(v => (typeof v === 'string' ? v.trim() : typeof v === 'object' && v ? JSON.stringify(v) : String(v ?? '')))
      .filter(Boolean)
      .join(', ');
  }
  if (value && typeof value === 'object') {
    return Object.values(value)
      .map(v => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

function isComicPageData(val: unknown): val is ComicPageData {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  const o = val as Record<string, unknown>;
  if (o.format !== 'nai5-comic') return false;
  if (!o.page || typeof o.page !== 'object') return false;
  const page = o.page as Record<string, unknown>;
  const base = safeString(page.base);
  if (!base) return false;
  return Array.isArray(o.panels);
}

/**
 * 将多页漫画映射到正文的段落位置。
 * 若模型指定了有效 P 编号则优先遵从；未指定时均匀分布于可选段落，最后一页保证落于末段。
 */
function resolvePagePosition(
  pagePosition: unknown,
  pageIndex: number,
  totalPages: number,
  segments: TargetSegment[],
): { position: string; sourceLine: number } {
  const fallback = segments[segments.length - 1] ?? { id: 'P1', sourceLine: 0 };
  let posStr = '';
  if (typeof pagePosition === 'string') {
    posStr = pagePosition.trim().toUpperCase();
  } else if (typeof pagePosition === 'number' && Number.isFinite(pagePosition)) {
    posStr = `P${pagePosition}`;
  }
  if (posStr) {
    const matched = segments.find(s => s.id === posStr);
    if (matched) return { position: matched.id, sourceLine: matched.sourceLine };
  }

  if (segments.length === 0) {
    return { position: 'P1', sourceLine: 0 };
  }

  // 均匀分布：总页数为 totalPages，在 segments 长度中线性插值
  const segIndex = Math.min(
    segments.length - 1,
    Math.floor(((pageIndex + 1) / totalPages) * segments.length) - 1,
  );
  const target = segments[Math.max(0, segIndex)] ?? fallback;
  return { position: target.id, sourceLine: target.sourceLine };
}

/**
 * 从 panels 中提取所有出场人物转换为 ImageCharacterPrompt 列表
 */
function extractCharactersFromPanels(panels: ComicPanel[]): ImageCharacterPrompt[] {
  const characters: ImageCharacterPrompt[] = [];
  if (!Array.isArray(panels)) return characters;
  for (const panel of panels) {
    if (!panel || !Array.isArray(panel.characters)) continue;
    for (const c of panel.characters) {
      if (!c || typeof c !== 'object') continue;
      const name = safeString(c.character_id) || 'Character';
      const tag = safeString(c.positive);
      if (tag) {
        characters.push({
          name,
          tag,
          nl: '',
        });
      }
    }
  }
  return characters;
}

/**
 * 解析 LLM 输出的漫画页面规划与 JSON 数据
 */
export function parseComicPlan(
  raw: string,
  segments: TargetSegment[],
  minImages: number,
  maxImages: number,
): ImagePlan {
  const candidates = extractComicJsonCandidates(raw);
  if (!candidates.length) {
    throw new Error('AI 没有返回可解析的漫画页面数据（需包含 format: "nai5-comic" 的 JSON）');
  }

  const normalizedMax = Math.max(1, Math.floor(Number(maxImages)) || 1);
  const normalizedMin = Math.min(
    normalizedMax,
    Math.max(0, Math.floor(Number(minImages)) || 0),
  );

  const pages = candidates.slice(0, normalizedMax);
  if (pages.length < normalizedMin) {
    throw new Error(
      `AI 返回了 ${pages.length} 页漫画，少于设置的最少页数 ${normalizedMin}`,
    );
  }

  const images: ImageInsertion[] = [];

  for (let i = 0; i < pages.length; i++) {
    const pageData = pages[i];
    const { position, sourceLine } = resolvePagePosition(
      pageData.page.position,
      i,
      pages.length,
      segments,
    );

    const baseTag = safeString(pageData.page.base).replace(/[\r\n]+/g, ' ');
    const nonChar = safeString(pageData.page.non_character).replace(/[\r\n]+/g, ' ');
    const characters = extractCharactersFromPanels(pageData.panels);

    images.push({
      position,
      sourceLine,
      tag: baseTag,
      nl: nonChar,
      negative: '',
      characters,
      size: 'portrait',
      comic: pageData,
    });
  }

  const positions = new Map(segments.map(segment => [segment.id, segment.sourceLine]));
  let changes: ReturnType<typeof parseChanges> = [];
  for (const pageData of candidates) {
    if (Array.isArray((pageData as unknown as { changes?: unknown }).changes)) {
      changes = changes.concat(
        parseChanges((pageData as unknown as { changes: unknown }).changes, positions),
      );
    }
  }
  if (changes.length === 0) {
    try {
      const match = raw.match(/"changes"\s*:\s*(\[[^\]]*\])/);
      if (match) {
        const parsed = JSON.parse(match[1]) as unknown;
        changes = parseChanges(parsed, positions);
      }
    } catch {
      // ignore
    }
  }

  return {
    images,
    changes,
  };
}
