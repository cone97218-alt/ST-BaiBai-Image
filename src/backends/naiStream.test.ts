import { describe, expect, it, vi } from 'vitest';
import {
  decodeMsgpack,
  parseMsgpackFrames,
  parseSseFrames,
  sniffImageMime,
  generateNaiStreamImage,
  uint8ToBase64,
  base64ToUint8,
} from './naiStream';
import type { NaiSettings } from '@/state/settings';

/**
 * 辅助函数：将 JS 简易数据编码为合法 msgpack 字节（供单测验证解码器）
 */
function encodeSimpleMsgpack(val: unknown): Uint8Array {
  if (val === null) return new Uint8Array([0xc0]);
  if (val === false) return new Uint8Array([0xc2]);
  if (val === true) return new Uint8Array([0xc3]);
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      if (val >= 0 && val <= 0x7f) return new Uint8Array([val]);
      if (val >= -32 && val < 0) return new Uint8Array([val + 256]);
      if (val >= 0 && val <= 0xff) return new Uint8Array([0xcc, val]);
      if (val >= 0 && val <= 0xffff) {
        return new Uint8Array([0xcd, (val >> 8) & 0xff, val & 0xff]);
      }
      return new Uint8Array([
        0xce,
        (val >> 24) & 0xff,
        (val >> 16) & 0xff,
        (val >> 8) & 0xff,
        val & 0xff,
      ]);
    }
  }
  if (typeof val === 'string') {
    const bytes = new TextEncoder().encode(val);
    if (bytes.length <= 31) {
      const out = new Uint8Array(1 + bytes.length);
      out[0] = 0xa0 | bytes.length;
      out.set(bytes, 1);
      return out;
    }
    const out = new Uint8Array(2 + bytes.length);
    out[0] = 0xd9;
    out[1] = bytes.length;
    out.set(bytes, 2);
    return out;
  }
  if (val instanceof Uint8Array) {
    if (val.length <= 0xff) {
      const out = new Uint8Array(2 + val.length);
      out[0] = 0xc4;
      out[1] = val.length;
      out.set(val, 2);
      return out;
    }
  }
  if (Array.isArray(val)) {
    const encodedItems = val.map(encodeSimpleMsgpack);
    const totalLen = encodedItems.reduce((acc, cur) => acc + cur.length, 0);
    const headerLen = val.length <= 15 ? 1 : 3;
    const out = new Uint8Array(headerLen + totalLen);
    if (val.length <= 15) {
      out[0] = 0x90 | val.length;
    } else {
      out[0] = 0xdc;
      out[1] = (val.length >> 8) & 0xff;
      out[2] = val.length & 0xff;
    }
    let offset = headerLen;
    for (const item of encodedItems) {
      out.set(item, offset);
      offset += item.length;
    }
    return out;
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>);
    const encodedPairs = entries.map(([k, v]) => ({
      k: encodeSimpleMsgpack(k),
      v: encodeSimpleMsgpack(v),
    }));
    const totalLen = encodedPairs.reduce((acc, p) => acc + p.k.length + p.v.length, 0);
    const headerLen = entries.length <= 15 ? 1 : 3;
    const out = new Uint8Array(headerLen + totalLen);
    if (entries.length <= 15) {
      out[0] = 0x80 | entries.length;
    } else {
      out[0] = 0xde;
      out[1] = (entries.length >> 8) & 0xff;
      out[2] = entries.length & 0xff;
    }
    let offset = headerLen;
    for (const p of encodedPairs) {
      out.set(p.k, offset);
      offset += p.k.length;
      out.set(p.v, offset);
      offset += p.v.length;
    }
    return out;
  }
  throw new Error(`测试编码器未实现该类型`);
}

describe('naiStream - MessagePack 解码', () => {
  it('正确解码基本标量类型 (null, bool, int, float, string)', () => {
    expect(decodeMsgpack(new Uint8Array([0xc0]))).toBeNull();
    expect(decodeMsgpack(new Uint8Array([0xc2]))).toBe(false);
    expect(decodeMsgpack(new Uint8Array([0xc3]))).toBe(true);

    // 正小整数与负小整数
    expect(decodeMsgpack(new Uint8Array([42]))).toBe(42);
    expect(decodeMsgpack(new Uint8Array([0xe0]))).toBe(-32);
    expect(decodeMsgpack(new Uint8Array([0xff]))).toBe(-1);

    // uint8, uint16, uint32
    expect(decodeMsgpack(new Uint8Array([0xcc, 200]))).toBe(200);
    expect(decodeMsgpack(new Uint8Array([0xcd, 0x01, 0x00]))).toBe(256);
    expect(decodeMsgpack(new Uint8Array([0xce, 0x00, 0x01, 0x00, 0x00]))).toBe(65536);

    // 字符串
    const strBytes = encodeSimpleMsgpack('hello NAI stream');
    expect(decodeMsgpack(strBytes)).toBe('hello NAI stream');
  });

  it('正确解码二进制与复合结构 (Array, Object, Uint8Array)', () => {
    const rawBin = new Uint8Array([1, 2, 3, 4, 5]);
    const encodedBin = encodeSimpleMsgpack(rawBin);
    const decodedBin = decodeMsgpack(encodedBin) as Uint8Array;
    expect(decodedBin).toBeInstanceOf(Uint8Array);
    expect(Array.from(decodedBin)).toEqual([1, 2, 3, 4, 5]);

    const obj = {
      event_type: 'intermediate',
      step_ix: 12,
      data: [1, 2, 3],
    };
    const encodedObj = encodeSimpleMsgpack(obj);
    const decodedObj = decodeMsgpack(encodedObj) as Record<string, unknown>;
    expect(decodedObj).toEqual(obj);
  });
});

describe('naiStream - 帧流解析', () => {
  it('parseMsgpackFrames: 正确分帧并产出流式帧', async () => {
    // 构造两帧：第一帧 intermediate，第二帧 final
    const frame1 = { event_type: 'intermediate', step_ix: 5 };
    const frame2 = { event_type: 'final', step_ix: 28 };

    const payload1 = encodeSimpleMsgpack(frame1);
    const payload2 = encodeSimpleMsgpack(frame2);

    const chunk1 = new Uint8Array(4 + payload1.length);
    new DataView(chunk1.buffer).setUint32(0, payload1.length, false);
    chunk1.set(payload1, 4);

    const chunk2 = new Uint8Array(4 + payload2.length);
    new DataView(chunk2.buffer).setUint32(0, payload2.length, false);
    chunk2.set(payload2, 4);

    const total = new Uint8Array(chunk1.length + chunk2.length);
    total.set(chunk1, 0);
    total.set(chunk2, chunk1.length);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(total);
        controller.close();
      },
    });

    const frames: unknown[] = [];
    for await (const frame of parseMsgpackFrames(stream)) {
      frames.push(frame);
    }

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject(frame1);
    expect(frames[1]).toMatchObject(frame2);
  });

  it('parseSseFrames: 正确解析 Server-Sent Events', async () => {
    const sseText =
      `event: update\n` +
      `data: {"event_type":"intermediate","step_ix":10}\n\n` +
      `event: done\n` +
      `data: {"event_type":"final","step_ix":28}\n\n`;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseText));
        controller.close();
      },
    });

    const frames: unknown[] = [];
    for await (const frame of parseSseFrames(stream)) {
      frames.push(frame);
    }

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ event_type: 'intermediate', step_ix: 10 });
    expect(frames[1]).toMatchObject({ event_type: 'final', step_ix: 28 });
  });

  it('sniffImageMime: 正确嗅探图片 MIME 类型', () => {
    // PNG
    expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]))).toBe('image/png');
    // JPEG
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    // WEBP
    const webpHeader = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(sniffImageMime(webpHeader)).toBe('image/webp');
  });

  it('base64 与 Uint8Array 互转一致', () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]);
    const b64 = uint8ToBase64(original);
    const converted = base64ToUint8(b64);
    expect(converted).toEqual(original);
  });
});

function makeMockNai(overrides: Partial<NaiSettings> = {}): NaiSettings {
  return {
    url: 'https://image.novelai.net',
    key: 'test-key',
    model: 'nai-diffusion-5-full',
    resolution: '832x1216',
    portraitSize: '832x1216',
    landscapeSize: '1216x832',
    qualityTags: '',
    negativePrompt: '',
    endpoints: [{ id: 'nep_official', name: 'Official', url: 'https://image.novelai.net', key: 'test-key' }],
    activeEndpointId: 'nep_official',
    undesiredContent: '',
    sampler: 'k_euler',
    steps: 28,
    scale: 5,
    cfgRescale: 0,
    noiseSchedule: 'karras',
    seed: 0,
    varietyBoost: false,
    normalizeRefStrength: false,
    concurrency: 1,
    vibes: [],
    artistPresets: [],
    activeArtistId: '',
    naturalLanguage: true,
    orientationLock: 'auto',
    streamPreview: true,
    ...overrides,
  };
}

describe('naiStream - generateNaiStreamImage 端到端调度', () => {
  it('推送中间帧预览并返回最终成品图像', async () => {
    const mockNai = makeMockNai();

    const intermediatePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02]);
    const finalPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x03, 0x04]);

    const frame1 = { event_type: 'intermediate', step_ix: 13, image: intermediatePng };
    const frame2 = { event_type: 'final', step_ix: 27, image: finalPng };

    const p1 = encodeSimpleMsgpack(frame1);
    const p2 = encodeSimpleMsgpack(frame2);

    const c1 = new Uint8Array(4 + p1.length);
    new DataView(c1.buffer).setUint32(0, p1.length, false);
    c1.set(p1, 4);

    const c2 = new Uint8Array(4 + p2.length);
    new DataView(c2.buffer).setUint32(0, p2.length, false);
    c2.set(p2, 4);

    const combined = new Uint8Array(c1.length + c2.length);
    combined.set(c1, 0);
    combined.set(c2, c1.length);

    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(combined);
        controller.close();
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/msgpack' }),
      body: mockStream,
    } as unknown as Response);

    const previewEvents: Array<{ step: number; total: number }> = [];
    const onStreamPreview = vi.fn(ev => {
      previewEvents.push({ step: ev.step, total: ev.total });
    });

    const result = await generateNaiStreamImage(
      mockNai,
      { input: '1girl', parameters: { steps: 28 } },
      undefined,
      onStreamPreview,
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://image.novelai.net/ai/generate-image-stream',
      expect.objectContaining({ method: 'POST' }),
    );

    // 验证中间帧回调被调用
    expect(onStreamPreview).toHaveBeenCalled();
    expect(previewEvents).toContainEqual({ step: 14, total: 28 });

    // 验证最终图返回
    expect(result).not.toBeNull();
    expect(result!.format).toBe('png');
    expect(result!.url).toContain('data:image/png;base64,');

    fetchSpy.mockRestore();
  });

  it('当端点返回 HTTP 错误时抛出 NaiStreamError', async () => {
    const mockNai = makeMockNai({ endpoints: [], activeEndpointId: '' });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers(),
    } as unknown as Response);

    await expect(
      generateNaiStreamImage(mockNai, { input: '1girl' }),
    ).rejects.toThrow();

    fetchSpy.mockRestore();
  });
});
