import type { NaiSettings } from '@/state/settings';

export class NaiStreamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'NaiStreamError';
  }
}

/**
 * NovelAI 流式帧结构（msgpack 与 SSE 协议统一化后的结构）
 */
export interface NovelAIStreamFrame {
  event_type: 'intermediate' | 'final' | 'error' | string;
  samp_ix?: number;
  gen_id?: number;
  step_ix?: number;
  sigma?: number;
  image?: Uint8Array;
  message?: string;
  error?: string;
  seed?: number;
}

export interface NaiStreamProgressEvent {
  url: string;
  step: number;
  total: number;
}

export interface NaiStreamSuccessResult {
  url: string;
  filename: string;
  format: string;
}

/* =========================================================================
 * 1. 最小 MessagePack 解码器（纯原生 TypeScript 实现，无任何外部库依赖）
 * ========================================================================= */

type MsgpackValue =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | MsgpackValue[]
  | { [key: string]: MsgpackValue };

interface DecodeState {
  offset: number;
}

const textDecoder = new TextDecoder();
const MAX_FRAME_SIZE = 32 * 1024 * 1024; // 32MB 帧上限保护
const STREAM_STALL_TIMEOUT_MS = 45_000; // 流传输无新数据超时 45 秒

function ensureAvail(b: Uint8Array, s: DecodeState, n: number): void {
  if (s.offset + n > b.length) throw new Error('msgpack 数据不完整');
}

function readUint(b: Uint8Array, s: DecodeState, size: number): number {
  ensureAvail(b, s, size);
  const v = new DataView(b.buffer, b.byteOffset + s.offset, size);
  s.offset += size;
  if (size === 1) return v.getUint8(0);
  if (size === 2) return v.getUint16(0, false);
  return v.getUint32(0, false);
}

function readInt(b: Uint8Array, s: DecodeState, size: number): number {
  ensureAvail(b, s, size);
  const v = new DataView(b.buffer, b.byteOffset + s.offset, size);
  s.offset += size;
  if (size === 1) return v.getInt8(0);
  if (size === 2) return v.getInt16(0, false);
  return v.getInt32(0, false);
}

function readFloat(b: Uint8Array, s: DecodeState, size: number): number {
  ensureAvail(b, s, size);
  const v = new DataView(b.buffer, b.byteOffset + s.offset, size);
  s.offset += size;
  return size === 4 ? v.getFloat32(0, false) : v.getFloat64(0, false);
}

function readUint64(b: Uint8Array, s: DecodeState): number {
  const hi = readUint(b, s, 4);
  const lo = readUint(b, s, 4);
  const val = hi * 2 ** 32 + lo;
  if (!Number.isSafeInteger(val)) throw new Error('uint64 超出安全范围');
  return val;
}

function readInt64(b: Uint8Array, s: DecodeState): number {
  const hi = readUint(b, s, 4);
  const lo = readUint(b, s, 4);
  if (!(hi & 0x80000000)) {
    const val = hi * 2 ** 32 + lo;
    if (!Number.isSafeInteger(val)) throw new Error('int64 超出安全范围');
    return val;
  }
  const mag = ((~hi) >>> 0) * 2 ** 32 + ((~lo) >>> 0) + 1;
  const val = -mag;
  if (!Number.isSafeInteger(val)) throw new Error('int64 超出安全范围');
  return val;
}

function readStr(b: Uint8Array, s: DecodeState, len: number): string {
  ensureAvail(b, s, len);
  const view = b.subarray(s.offset, s.offset + len);
  s.offset += len;
  return textDecoder.decode(view);
}

function readBin(b: Uint8Array, s: DecodeState, len: number): Uint8Array {
  ensureAvail(b, s, len);
  const view = new Uint8Array(b.buffer, b.byteOffset + s.offset, len);
  s.offset += len;
  return view;
}

function decodeVal(b: Uint8Array, s: DecodeState): MsgpackValue {
  ensureAvail(b, s, 1);
  const p = b[s.offset++]!;

  if (p <= 0x7f) return p;
  if (p >= 0x80 && p <= 0x8f) {
    const n = p & 0x0f;
    const obj: { [k: string]: MsgpackValue } = {};
    for (let i = 0; i < n; i++) {
      const k = decodeVal(b, s);
      obj[typeof k === 'string' ? k : String(k)] = decodeVal(b, s);
    }
    return obj;
  }
  if (p >= 0x90 && p <= 0x9f) {
    const n = p & 0x0f;
    const arr: MsgpackValue[] = [];
    for (let i = 0; i < n; i++) arr.push(decodeVal(b, s));
    return arr;
  }
  if (p >= 0xa0 && p <= 0xbf) return readStr(b, s, p & 0x1f);
  if (p >= 0xe0) return p - 0x100;

  switch (p) {
    case 0xc0:
      return null;
    case 0xc2:
      return false;
    case 0xc3:
      return true;
    case 0xc4:
      return readBin(b, s, readUint(b, s, 1));
    case 0xc5:
      return readBin(b, s, readUint(b, s, 2));
    case 0xc6:
      return readBin(b, s, readUint(b, s, 4));
    case 0xca:
      return readFloat(b, s, 4);
    case 0xcb:
      return readFloat(b, s, 8);
    case 0xcc:
      return readUint(b, s, 1);
    case 0xcd:
      return readUint(b, s, 2);
    case 0xce:
      return readUint(b, s, 4);
    case 0xcf:
      return readUint64(b, s);
    case 0xd0:
      return readInt(b, s, 1);
    case 0xd1:
      return readInt(b, s, 2);
    case 0xd2:
      return readInt(b, s, 4);
    case 0xd3:
      return readInt64(b, s);
    case 0xd9:
      return readStr(b, s, readUint(b, s, 1));
    case 0xda:
      return readStr(b, s, readUint(b, s, 2));
    case 0xdb:
      return readStr(b, s, readUint(b, s, 4));
    case 0xdc: {
      const n = readUint(b, s, 2);
      const arr: MsgpackValue[] = [];
      for (let i = 0; i < n; i++) arr.push(decodeVal(b, s));
      return arr;
    }
    case 0xdd: {
      const n = readUint(b, s, 4);
      const arr: MsgpackValue[] = [];
      for (let i = 0; i < n; i++) arr.push(decodeVal(b, s));
      return arr;
    }
    case 0xde: {
      const n = readUint(b, s, 2);
      const obj: { [k: string]: MsgpackValue } = {};
      for (let i = 0; i < n; i++) {
        const k = decodeVal(b, s);
        obj[typeof k === 'string' ? k : String(k)] = decodeVal(b, s);
      }
      return obj;
    }
    case 0xdf: {
      const n = readUint(b, s, 4);
      const obj: { [k: string]: MsgpackValue } = {};
      for (let i = 0; i < n; i++) {
        const k = decodeVal(b, s);
        obj[typeof k === 'string' ? k : String(k)] = decodeVal(b, s);
      }
      return obj;
    }
    default:
      throw new Error(`不支持的 msgpack 前缀: 0x${p.toString(16)}`);
  }
}

/**
 * 最小 msgpack 解码器（反序列化单个 msgpack 对象）
 */
export function decodeMsgpack(bytes: Uint8Array): MsgpackValue {
  const s: DecodeState = { offset: 0 };
  const val = decodeVal(bytes, s);
  if (s.offset !== bytes.length) throw new Error('msgpack 数据存在未消费字节');
  return val;
}

/**
 * 带超时看门狗的分块读取
 */
async function readChunkWithStall(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  armed: boolean,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!armed) return reader.read();
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const stall = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`流式连接 ${STREAM_STALL_TIMEOUT_MS / 1000} 秒无新数据，可能已中断`)),
      STREAM_STALL_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([reader.read(), stall]);
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * 解析 NAI 官方 msgpack 图像流帧
 * 帧格式：[4 字节大端 uint32 载荷长度] + [msgpack 载荷]
 */
export async function* parseMsgpackFrames(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<NovelAIStreamFrame, void, unknown> {
  const reader = stream.getReader();
  let buf = new Uint8Array(0);
  let receivedData = false;

  try {
    while (true) {
      const { done, value } = await readChunkWithStall(reader, receivedData);
      if (done) break;
      if (!value?.length) continue;
      receivedData = true;

      const next = new Uint8Array(buf.length + value.length);
      next.set(buf);
      next.set(value, buf.length);
      buf = next;

      while (buf.length >= 4) {
        const frameLen = new DataView(buf.buffer, buf.byteOffset).getUint32(0, false);
        if (frameLen <= 0 || frameLen > MAX_FRAME_SIZE) {
          throw new Error(`非法 msgpack 帧长度: ${frameLen}`);
        }
        if (buf.length < 4 + frameLen) break;

        const payload = buf.slice(4, 4 + frameLen);
        buf = buf.slice(4 + frameLen);

        const decoded = decodeMsgpack(payload);
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
          throw new Error('msgpack 帧必须是对象');
        }
        yield decoded as unknown as NovelAIStreamFrame;
      }
    }

    if (buf.length !== 0) throw new Error('msgpack 流在非帧边界结束');
  } finally {
    reader.releaseLock();
  }
}

/* =========================================================================
 * 2. SSE（Server-Sent Events）图像流解析器
 * ========================================================================= */

export async function* parseSseFrames(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<NovelAIStreamFrame, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';
  let receivedData = false;

  try {
    while (true) {
      const { done, value } = await readChunkWithStall(reader, receivedData);
      if (done) break;
      if (!value?.length) continue;
      receivedData = true;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) {
          if (currentData) {
            const frame = ssePayloadToFrame(currentEvent, currentData);
            if (frame) yield frame;
            currentEvent = '';
            currentData = '';
          }
          continue;
        }
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const content = line.slice(5).trim();
          currentData = currentData ? `${currentData}\n${content}` : content;
        }
      }
    }

    if (currentData) {
      const frame = ssePayloadToFrame(currentEvent, currentData);
      if (frame) yield frame;
    }
  } finally {
    reader.releaseLock();
  }
}

function ssePayloadToFrame(event: string, data: string): NovelAIStreamFrame | null {
  try {
    const json = JSON.parse(data);
    let imageBytes: Uint8Array | undefined;
    if (json.image && typeof json.image === 'string') {
      imageBytes = base64ToUint8(json.image);
    }
    const eventType =
      event === 'done' || event === 'final' || json.event_type === 'final'
        ? 'final'
        : json.event_type || 'intermediate';
    return {
      event_type: eventType,
      step_ix: json.step_ix ?? json.step,
      image: imageBytes,
      error: json.error,
      message: json.message,
    };
  } catch {
    return null;
  }
}

/* =========================================================================
 * 3. 辅助函数：魔数嗅探、Base64 编解码
 * ========================================================================= */

export function uint8ToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToUint8(b64: string): Uint8Array {
  let clean = b64;
  const commaIdx = clean.indexOf(',');
  if (commaIdx !== -1) clean = clean.slice(commaIdx + 1);
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/png';
}

/* =========================================================================
 * 4. 流式生图核心调度
 * ========================================================================= */

/**
 * 向 NAI 发起流式生图请求，实时推送中间预览帧，最终返回成图结果
 */
export async function generateNaiStreamImage(
  nai: NaiSettings,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  onStreamPreview?: (event: NaiStreamProgressEvent) => void,
): Promise<NaiStreamSuccessResult | null> {
  const url = `${nai.url.replace(/\/+$/, '')}/ai/generate-image-stream`;
  const streamBody = {
    ...body,
    parameters: {
      ...((body.parameters as Record<string, unknown>) ?? {}),
      stream: 'msgpack',
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${nai.key.trim()}`,
      Accept: 'application/msgpack, text/event-stream;q=0.9, */*;q=0.8',
    },
    body: JSON.stringify(streamBody),
    signal,
  });

  if (!resp.ok) {
    throw new NaiStreamError(`NAI 流式端点返回 HTTP ${resp.status}`, resp.status);
  }

  const contentType = (resp.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.includes('json')) {
    const errText = await resp.text().catch(() => '');
    throw new NaiStreamError(`NAI 流式端点返回 JSON（可能不支持流式）: ${errText.slice(0, 150)}`);
  }

  if (!resp.body) {
    throw new NaiStreamError('NAI 响应体不支持流式读取');
  }

  const isSse = contentType.includes('event-stream');
  const frameGenerator = isSse ? parseSseFrames(resp.body) : parseMsgpackFrames(resp.body);

  const totalSteps =
    typeof (body.parameters as Record<string, unknown>)?.steps === 'number'
      ? ((body.parameters as Record<string, unknown>).steps as number)
      : 28;

  let lastPreviewObjectUrl: string | null = null;
  let finalImageBytes: Uint8Array | null = null;

  try {
    for await (const frame of frameGenerator) {
      if (signal?.aborted) throw new DOMException('操作已取消', 'AbortError');

      if (frame.event_type === 'error') {
        throw new NaiStreamError(`流式生成错误: ${frame.error ?? frame.message ?? '未知错误'}`);
      }

      if (frame.event_type === 'final' && frame.image && frame.image.length > 0) {
        finalImageBytes = frame.image;
        break;
      }

      if (frame.image && frame.image.length > 0 && onStreamPreview) {
        const mime = sniffImageMime(frame.image);
        const blob = new Blob([frame.image as unknown as BlobPart], { type: mime });
        const previewUrl = URL.createObjectURL(blob);

        if (lastPreviewObjectUrl && lastPreviewObjectUrl.startsWith('blob:')) {
          URL.revokeObjectURL(lastPreviewObjectUrl);
        }
        lastPreviewObjectUrl = previewUrl;

        const currentStep = (frame.step_ix ?? 0) + 1;
        onStreamPreview({
          url: previewUrl,
          step: Math.min(currentStep, totalSteps),
          total: totalSteps,
        });
      }
    }
  } finally {
    if (lastPreviewObjectUrl && lastPreviewObjectUrl.startsWith('blob:')) {
      // 延迟释放上一张预览图，让卡片有足够时间接管最终图
      const toRevoke = lastPreviewObjectUrl;
      setTimeout(() => URL.revokeObjectURL(toRevoke), 5000);
    }
    await resp.body.cancel().catch(() => {});
  }

  if (!finalImageBytes || finalImageBytes.length === 0) {
    throw new NaiStreamError('流式生成完成，但未收到最终图像数据');
  }

  const mime = sniffImageMime(finalImageBytes);
  const format = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const base64 = uint8ToBase64(finalImageBytes);

  return {
    url: `data:${mime};base64,${base64}`,
    filename: `nai-stream-${Date.now()}.${format}`,
    format,
  };
}
