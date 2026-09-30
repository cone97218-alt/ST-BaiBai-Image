import { describe, expect, it } from 'vitest';
import { parseComicPlan } from './comicProtocol';
import type { TargetSegment } from '@/autoTag/clean';

const mockSegments: TargetSegment[] = [
  { id: 'P1', sourceLine: 1, text: '第一段正文' },
  { id: 'P2', sourceLine: 3, text: '第二段正文' },
  { id: 'P3', sourceLine: 5, text: '第三段正文' },
];

describe('comicProtocol - parseComicPlan', () => {
  it('parses a single comic page enclosed in <image>...</image>', () => {
    const raw = `<thinking>
- 角色DNA:
  - C1: 小雪
</thinking>
<comic_plan>
[Page 1]
- 布局: 4格
</comic_plan>
<image>
{
  "format": "nai5-comic",
  "page": {
    "base": "comic, 4 panels, monochrome, screentone",
    "non_character": "Text: 窗外的风声"
  },
  "panels": [
    {
      "id": "P1",
      "description": "教室窗边",
      "characters": [
        {
          "character_id": "小雪",
          "positive": "girl, short hair, looking away, Text: 又是这样啊...",
          "negative": "blonde hair"
        }
      ]
    }
  ]
}
</image>`;

    const plan = parseComicPlan(raw, mockSegments, 1, 3);
    expect(plan.images).toHaveLength(1);
    expect(plan.images[0].tag).toBe('comic, 4 panels, monochrome, screentone');
    expect(plan.images[0].nl).toBe('Text: 窗外的风声');
    expect(plan.images[0].characters).toHaveLength(1);
    expect(plan.images[0].characters[0].name).toBe('小雪');
    expect(plan.images[0].characters[0].tag).toContain('girl, short hair');
    expect(plan.images[0].size).toBe('portrait');
    expect(plan.images[0].comic?.format).toBe('nai5-comic');
    expect(plan.images[0].comic?.panels).toHaveLength(1);
    expect(plan.images[0].position).toBe('P3'); // 默认落于末尾
  });

  it('parses multiple comic pages and assigns positions', () => {
    const raw = `<image>
{
  "format": "nai5-comic",
  "page": {
    "base": "comic, page 1, full color",
    "position": "P1"
  },
  "panels": []
}
</image>
<image>
{
  "format": "nai5-comic",
  "page": {
    "base": "comic, page 2, full color",
    "position": "P3"
  },
  "panels": []
}
</image>`;

    const plan = parseComicPlan(raw, mockSegments, 1, 2);
    expect(plan.images).toHaveLength(2);
    expect(plan.images[0].position).toBe('P1');
    expect(plan.images[0].tag).toBe('comic, page 1, full color');
    expect(plan.images[1].position).toBe('P3');
    expect(plan.images[1].tag).toBe('comic, page 2, full color');
  });

  it('parses json inside markdown block when <image> tag is omitted', () => {
    const raw = `\`\`\`json
{
  "format": "nai5-comic",
  "page": {
    "base": "comic, 3 panels, high contrast"
  },
  "panels": [
    {
      "id": "P1",
      "characters": [
        {
          "character_id": "C1",
          "positive": "boy, standing"
        }
      ]
    }
  ]
}
\`\`\``;

    const plan = parseComicPlan(raw, mockSegments, 1, 2);
    expect(plan.images).toHaveLength(1);
    expect(plan.images[0].tag).toBe('comic, 3 panels, high contrast');
    expect(plan.images[0].characters[0].name).toBe('C1');
  });

  it('throws when no valid nai5-comic json is found', () => {
    const raw = '一些无效的纯文本内容，没有返回任何 JSON';
    expect(() => parseComicPlan(raw, mockSegments, 1, 2)).toThrow(
      'AI 没有返回可解析的漫画页面数据',
    );
  });

  it('throws when page count is less than minImages', () => {
    const raw = `<image>
{
  "format": "nai5-comic",
  "page": { "base": "comic, 1 page" },
  "panels": []
}
</image>`;
    expect(() => parseComicPlan(raw, mockSegments, 2, 4)).toThrow(
      '少于设置的最少页数 2',
    );
  });

  it('limits page count to maxImages', () => {
    const raw = `<image>
{ "format": "nai5-comic", "page": { "base": "page 1" }, "panels": [] }
</image>
<image>
{ "format": "nai5-comic", "page": { "base": "page 2" }, "panels": [] }
</image>
<image>
{ "format": "nai5-comic", "page": { "base": "page 3" }, "panels": [] }
</image>`;

    const plan = parseComicPlan(raw, mockSegments, 1, 2);
    expect(plan.images).toHaveLength(2);
  });
});
