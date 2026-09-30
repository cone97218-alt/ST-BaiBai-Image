import type { BackendId } from '@/state/settings';
import {
  DEFAULT_JAILBREAK_PROMPT,
  DEFAULT_COMFY_SPEC,
  DEFAULT_COMFY_THINKING,
  DEFAULT_NAI_V5_SPEC,
  DEFAULT_NAI_V5_THINKING,
  DEFAULT_PREFILL_PROMPT,
  DEFAULT_NAI_SINGLE_CONTRACT,
  DEFAULT_COMFY_SINGLE_CONTRACT,
  COMIC_DIRECTOR_PROMPT,
  COMIC_CHARS_RULE,
  COMIC_OUTPUT_SYNTAX,
  COMIC_THINKING_PROMPT,
  COMIC_OUTPUT_CHECK,
} from './promptDefaults';

export * from './promptDefaults';

export type PromptEntryKind = 'text' | 'marker' | 'variant';

export type PromptMarkerKey =
  | 'charCard'
  | 'persona'
  | 'worldInfo'
  | 'library'
  | 'history'
  | 'target';

export interface PromptVariantOption {
  id: string;
  label: string;
  content: string;
}

export interface PromptEntry {
  id: string;
  name: string;
  enabled: boolean;
  role: 'system' | 'user' | 'assistant';
  kind: PromptEntryKind;
  /** 内置核心条目(不可删除,但可自由开关、编辑内容、重命名、调顺序) */
  builtin?: boolean;
  /** 文本提示词内容 (kind === 'text') */
  content?: string;
  /** 系统数据插槽类型 (kind === 'marker') */
  markerKey?: PromptMarkerKey;
  /** 互斥变体组标识 (kind === 'variant', 如 'panelStyle', 'colorMode') */
  variantKey?: string;
  /** 当前选中的变体 ID (kind === 'variant') */
  activeVariantId?: string;
  /** 变体列表 (kind === 'variant') */
  variants?: PromptVariantOption[];
}

export interface PromptPreset {
  id: string;
  name: string;
  backend: BackendId; // 'nai' | 'comfyui'
  mode: 'single' | 'comic';
  builtin?: boolean;
  entries: PromptEntry[];
}

/* ================== 三套内置预设定义 ================== */

export const BUILTIN_NAI_SINGLE_PRESET: PromptPreset = {
  id: 'builtin_nai_single',
  name: 'NAI 单图标准预设',
  backend: 'nai',
  mode: 'single',
  builtin: true,
  entries: [
    {
      id: 'jb',
      name: '破限词',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: DEFAULT_JAILBREAK_PROMPT,
    },
    {
      id: 'm_card',
      name: '角色卡设定',
      enabled: true,
      role: 'system',
      kind: 'marker',
      builtin: true,
      markerKey: 'charCard',
    },
    {
      id: 'm_persona',
      name: '用户角色描述',
      enabled: true,
      role: 'system',
      kind: 'marker',
      builtin: true,
      markerKey: 'persona',
    },
    {
      id: 'm_wi',
      name: '世界书',
      enabled: true,
      role: 'system',
      kind: 'marker',
      builtin: true,
      markerKey: 'worldInfo',
    },
    {
      id: 'spec',
      name: 'NAI 规范',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: DEFAULT_NAI_V5_SPEC,
    },
    {
      id: 'contract',
      name: '任务契约与规则',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: DEFAULT_NAI_SINGLE_CONTRACT,
    },
    {
      id: 'thinking',
      name: 'NAI 思维链',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: DEFAULT_NAI_V5_THINKING,
    },
    {
      id: 'm_lib',
      name: '角色固定外貌库',
      enabled: true,
      role: 'user',
      kind: 'marker',
      builtin: true,
      markerKey: 'library',
    },
    {
      id: 'm_hist',
      name: '历史上下文',
      enabled: true,
      role: 'user',
      kind: 'marker',
      builtin: true,
      markerKey: 'history',
    },
    {
      id: 'm_target',
      name: '目标正文',
      enabled: true,
      role: 'user',
      kind: 'marker',
      builtin: true,
      markerKey: 'target',
    },
    {
      id: 'prefill',
      name: '预填充',
      enabled: true,
      role: 'assistant',
      kind: 'text',
      builtin: true,
      content: DEFAULT_PREFILL_PROMPT,
    },
  ],
};

export const BUILTIN_NAI_COMIC_PRESET: PromptPreset = {
  id: 'builtin_nai_comic',
  name: 'NAI 漫画导演预设',
  backend: 'nai',
  mode: 'comic',
  builtin: true,
  entries: [
    {
      id: 'jb',
      name: '破限词',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: DEFAULT_JAILBREAK_PROMPT,
    },
    {
      id: 'director',
      name: '总控：分镜导演',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: COMIC_DIRECTOR_PROMPT,
    },
    {
      id: 'm_card',
      name: '角色卡设定',
      enabled: true,
      role: 'system',
      kind: 'marker',
      builtin: true,
      markerKey: 'charCard',
    },
    {
      id: 'm_persona',
      name: '用户角色描述',
      enabled: true,
      role: 'system',
      kind: 'marker',
      builtin: true,
      markerKey: 'persona',
    },
    {
      id: 'm_wi',
      name: '世界书',
      enabled: true,
      role: 'system',
      kind: 'marker',
      builtin: true,
      markerKey: 'worldInfo',
    },
    {
      id: 'm_lib',
      name: '角色固定外貌库',
      enabled: true,
      role: 'user',
      kind: 'marker',
      builtin: true,
      markerKey: 'library',
    },
    {
      id: 'm_hist',
      name: '历史上下文',
      enabled: true,
      role: 'user',
      kind: 'marker',
      builtin: true,
      markerKey: 'history',
    },
    {
      id: 'm_target',
      name: '目标正文',
      enabled: true,
      role: 'user',
      kind: 'marker',
      builtin: true,
      markerKey: 'target',
    },
    {
      id: 'colorMode',
      name: '色彩模式',
      enabled: true,
      role: 'system',
      kind: 'variant',
      builtin: true,
      variantKey: 'colorMode',
      activeVariantId: 'fullColor',
      variants: [
        {
          id: 'fullColor',
          label: '全彩漫画',
          content: `[COLOR-MODE: FULL-COLOR]
全彩漫画模式：
- 人物保持固有设定发色、瞳色、服装与配饰颜色。
- 页面按实际场景使用 full color 及适用的光影视觉词。
- 各格背景与人物受光采用所属场景的光影条件。`,
        },
        {
          id: 'monochrome',
          label: '黑白脱色',
          content: `[COLOR-MODE: MONOCHROME]
黑白漫画脱色模式：
- 禁止具体色彩词；blue/brown/pink/red/黄/青/赤 等一律转成 dark/light/white/black/gray 等灰阶明暗词。
- 页面描述必须带介质词：モノクロ, グレースケール, スクリーントーン。不要写 full color，不要写 warm light 等带色相词。
- 自适应调用黑白介质、网点纸（スクリーントーン）、細い線、強いコントラスト。各格只写光源方向和明暗。`,
        },
      ],
    },
    {
      id: 'charsRule',
      name: '角色：出场与外观',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: COMIC_CHARS_RULE,
    },
    {
      id: 'rating',
      name: '分级标定',
      enabled: true,
      role: 'system',
      kind: 'variant',
      builtin: true,
      variantKey: 'rating',
      activeVariantId: 'sfw',
      variants: [
        {
          id: 'sfw',
          label: 'SFW 适龄日常',
          content: `[RATING-DECISION: SFW]
SFW 适龄日常模式：
- 普通日常叙事、对话交锋、战斗冒险、伤痕战损、轻度着装暴露或泳装（无主要性器官裸露）。`,
        },
        {
          id: 'nsfw',
          label: 'NSFW 成人全开',
          content: `[RATING-DECISION: NSFW]
NSFW 成人全开模式：
- 画面包含成人情欲内容时，器官零件、衣物边界、接触路径与姿态必须落到准确视觉标签。
- 明确褪衣边界，禁止隔衣穿模；写清具体动作接触点与体态重力关系。`,
        },
      ],
    },
    {
      id: 'panelStyle',
      name: '分镜风格',
      enabled: true,
      role: 'system',
      kind: 'variant',
      builtin: true,
      variantKey: 'panelStyle',
      activeVariantId: 'shounen',
      variants: [
        {
          id: 'shounen',
          label: '少年热血',
          content: `[PANEL-PACING: SHOUNEN-ACTION]
正统日漫 コマ割り (Komawari) 少年热血分镜文法：
- 核心动势格显著扩大（大通栏或斜切大格占用半页以上空间）；
- 相邻画格强对撞，采用大角度斜切边框；视线激烈跳跃，动作与冲击力优先；
- 绘图词使用：大きな主コマ, 斜めに切った枠, 激しい動き, 半ページ以上の大コマ。`,
        },
        {
          id: 'seinen',
          label: '青年悬疑',
          content: `[PANEL-PACING: SEINEN-SUSPENSE]
正统日漫 青年悬疑/写实分镜文法：
- 采用宽画幅横向长视线格；节奏凝重克制，多层级微表情与眼神阴影特写；
- 强调细节物证与视线错落，制造戏剧性停顿与压迫感；
- 绘图词使用：横長のコマ, 接写, 目の影, 重い間。`,
        },
        {
          id: 'shoujo',
          label: '恋爱少女',
          content: `[PANEL-PACING: DECORATIVE-SHOUJO]
装饰系少女漫分镜文法：
- 画格边框可带花卉、羽毛、星屑或柔化纹样；
- 格间点缀散花与光点粒子，人物可溢出画格与装饰交织；
- 竖向全身与情感特写多用，强调服饰发丝流动与优雅感。`,
        },
        {
          id: 'eromanga',
          label: '肉感本子',
          content: `[PANEL-PACING: EROMANGA-DOUJINSHI]
成人同人志分镜与构图文法：
- 主客体互动大画格：每页必设一处核心主画格，完整呈现互动全貌与肢体纠缠；
- 嵌入式局部切入小格（Insert Cut-in）：在大格边角紧贴极近特写小格，收束视觉焦点至敏感接触部位或失神神态；
- 身体曲线贴合格（Body Contour Framing）：边框顺应卧躺、仰面或交缠线条作动态贴合。`,
        },
        {
          id: 'yonkoma',
          label: '经典四格',
          content: `[PANEL-PACING: 4-KOMA]
经典四格漫画规范分镜：
- 严格起承转结节奏，垂直四格阶梯布局，等宽矩形框；
- 边界清晰稳定，节奏工整。`,
        },
      ],
    },
    {
      id: 'gutterStyle',
      name: '留白风格',
      enabled: true,
      role: 'system',
      kind: 'variant',
      builtin: true,
      variantKey: 'gutterStyle',
      activeVariantId: 'bleed',
      variants: [
        {
          id: 'bleed',
          label: '天地出血',
          content: `[GUTTER: BLEED]
留白与出血：天头地脚贴边无白边，同行超窄紧凑间距，跨段宽间距，关键格允许单侧出血（タチキリ）。`,
        },
        {
          id: 'boxed',
          label: '全封闭内枠',
          content: `[GUTTER: BOXED]
留白与出血：经典单行本规整内陷，四周保留均匀外白边安全内框（基本枠/囲みコマ）。`,
        },
        {
          id: 'none',
          label: '沉浸全出血',
          content: `[GUTTER: NONE]
留白与出血：全画格向四周极限延伸至画布边缘，无边框全出血（Full Bleed），相邻画格由清晰分隔线或构图边界区分。`,
        },
        {
          id: 'thickInk',
          label: '纯黑线密着',
          content: `[GUTTER: THICK-INK]
留白与出血：全幅零白留白，完全由粗黑墨线（太い黒い仕切り線, 太いインクの枠）密着切分。`,
        },
      ],
    },
    {
      id: 'bubbleStyle',
      name: '气泡风格',
      enabled: true,
      role: 'system',
      kind: 'variant',
      builtin: true,
      variantKey: 'bubbleStyle',
      activeVariantId: 'adaptive',
      variants: [
        {
          id: 'adaptive',
          label: '自适应日漫气泡',
          content: `[BUBBLE: ADAPTIVE]
日漫气泡契约：
- 普通对白：通常吹き出し，Layout: 縦書き，尖尾指向发言人口元；
- 叫喊：ギザギザ吹き出し；心声：思考の吹き出し；旁白：横書き ナレーション枠；
- 台词原文放在末尾 Text:，Text: 内部保留原句。`,
        },
        {
          id: 'none',
          label: '纯画面无对白',
          content: `[BUBBLE: NONE]
无气泡模式：全篇不安排对白气泡与文字，纯靠画面镜头语言、肢体动作与面部神态叙事。`,
        },
      ],
    },
    {
      id: 'outputSyntax',
      name: '语法：输出协议',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: COMIC_OUTPUT_SYNTAX,
    },
    {
      id: 'thinking',
      name: '页面规划与思维链',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: COMIC_THINKING_PROMPT,
    },
    {
      id: 'outputCheck',
      name: '输出检查：页面完整性',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: COMIC_OUTPUT_CHECK,
    },
    {
      id: 'prefill',
      name: '预填充',
      enabled: true,
      role: 'assistant',
      kind: 'text',
      builtin: true,
      content: '<thinking>\n- 角色DNA:',
    },
  ],
};

export const BUILTIN_COMFY_SINGLE_PRESET: PromptPreset = {
  id: 'builtin_comfy_single',
  name: 'ComfyUI 标准预设',
  backend: 'comfyui',
  mode: 'single',
  builtin: true,
  entries: [
    {
      id: 'jb',
      name: '破限词',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: DEFAULT_JAILBREAK_PROMPT,
    },
    {
      id: 'm_card',
      name: '角色卡设定',
      enabled: true,
      role: 'system',
      kind: 'marker',
      builtin: true,
      markerKey: 'charCard',
    },
    {
      id: 'm_persona',
      name: '用户角色描述',
      enabled: true,
      role: 'system',
      kind: 'marker',
      builtin: true,
      markerKey: 'persona',
    },
    {
      id: 'm_wi',
      name: '世界书',
      enabled: true,
      role: 'system',
      kind: 'marker',
      builtin: true,
      markerKey: 'worldInfo',
    },
    {
      id: 'spec',
      name: 'ComfyUI 规范',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: DEFAULT_COMFY_SPEC,
    },
    {
      id: 'contract',
      name: '任务契约与规则',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: DEFAULT_COMFY_SINGLE_CONTRACT,
    },
    {
      id: 'thinking',
      name: 'ComfyUI 思维链',
      enabled: true,
      role: 'system',
      kind: 'text',
      builtin: true,
      content: DEFAULT_COMFY_THINKING,
    },
    {
      id: 'm_lib',
      name: '角色固定外貌库',
      enabled: true,
      role: 'user',
      kind: 'marker',
      builtin: true,
      markerKey: 'library',
    },
    {
      id: 'm_hist',
      name: '历史上下文',
      enabled: true,
      role: 'user',
      kind: 'marker',
      builtin: true,
      markerKey: 'history',
    },
    {
      id: 'm_target',
      name: '目标正文',
      enabled: true,
      role: 'user',
      kind: 'marker',
      builtin: true,
      markerKey: 'target',
    },
    {
      id: 'prefill',
      name: '预填充',
      enabled: true,
      role: 'assistant',
      kind: 'text',
      builtin: true,
      content: DEFAULT_PREFILL_PROMPT,
    },
  ],
};

export const BUILTIN_PROMPT_PRESETS: readonly PromptPreset[] = [
  BUILTIN_NAI_SINGLE_PRESET,
  BUILTIN_NAI_COMIC_PRESET,
  BUILTIN_COMFY_SINGLE_PRESET,
];

/* ================== 工具函数 ================== */

let presetSeq = 0;

export function newPromptPreset(
  name = '新建预设',
  backend: BackendId = 'nai',
  mode: 'single' | 'comic' = 'single',
): PromptPreset {
  presetSeq += 1;
  const base =
    backend === 'nai'
      ? mode === 'comic'
        ? BUILTIN_NAI_COMIC_PRESET
        : BUILTIN_NAI_SINGLE_PRESET
      : BUILTIN_COMFY_SINGLE_PRESET;

  return {
    id: `preset_${Date.now()}_${presetSeq}`,
    name,
    backend,
    mode,
    entries: clonePromptEntries(base.entries),
  };
}

export function clonePromptEntries(entries: PromptEntry[]): PromptEntry[] {
  return JSON.parse(JSON.stringify(entries)) as PromptEntry[];
}

export function clonePromptPreset(source: PromptPreset, newName?: string): PromptPreset {
  presetSeq += 1;
  return {
    id: `preset_${Date.now()}_${presetSeq}`,
    name: newName ?? `${source.name} 副本`,
    backend: source.backend,
    mode: source.mode,
    entries: clonePromptEntries(source.entries),
  };
}

export function isBuiltinPromptPreset(id: string): boolean {
  return BUILTIN_PROMPT_PRESETS.some(p => p.id === id);
}

/**
 * 寻找当前生效的预设。
 * 优先级：
 * 1. activePresetId 指向的预设（且 backend 匹配当前 defaultBackend，mode 匹配当前 comicMode）；
 * 2. 用户自定义列表中首个匹配当前 backend 和 mode 的预设；
 * 3. 官方内置对应 backend 和 mode 的默认预设。
 */
export function resolveActivePromptPreset(
  presets: PromptPreset[],
  activePresetId: string | undefined,
  backend: BackendId,
  comicMode = false,
  activePresetMap?: Record<string, string>,
): PromptPreset {
  const targetMode = backend === 'nai' && comicMode ? 'comic' : 'single';
  const allPresets = [...presets, ...BUILTIN_PROMPT_PRESETS];

  // 1. 优先查当前专属模式与后端的 map
  const mapKey = `${backend}:${targetMode}`;
  const mappedId = activePresetMap?.[mapKey];
  if (mappedId) {
    const found = allPresets.find(p => p.id === mappedId);
    if (found && found.backend === backend && found.mode === targetMode) {
      return found;
    }
  }

  // 2. 查 activePresetId
  if (activePresetId) {
    const found = allPresets.find(p => p.id === activePresetId);
    if (found && found.backend === backend && found.mode === targetMode) {
      return found;
    }
  }

  // 3. 用户预设列表中匹配当前 backend 与 mode 的首个预设
  const matchedUser = presets.find(p => p.backend === backend && p.mode === targetMode);
  if (matchedUser) return matchedUser;

  // 4. 内置预设兜底
  const matchedBuiltin = BUILTIN_PROMPT_PRESETS.find(
    p => p.backend === backend && p.mode === targetMode,
  );
  return matchedBuiltin ?? (backend === 'comfyui' ? BUILTIN_COMFY_SINGLE_PRESET : BUILTIN_NAI_SINGLE_PRESET);
}

function normalizePromptEntry(raw: unknown, idx: number): PromptEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `entry_${idx}`;
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : `条目 ${idx + 1}`;
  const enabled = o.enabled !== false;
  const role = o.role === 'user' || o.role === 'assistant' ? o.role : 'system';
  const kind: PromptEntryKind =
    o.kind === 'marker' || o.kind === 'variant' ? o.kind : 'text';
  const builtin = o.builtin === true;

  const entry: PromptEntry = { id, name, enabled, role, kind, builtin };

  if (kind === 'text') {
    entry.content = typeof o.content === 'string' ? o.content : '';
  } else if (kind === 'marker') {
    entry.markerKey =
      o.markerKey === 'charCard' ||
      o.markerKey === 'persona' ||
      o.markerKey === 'worldInfo' ||
      o.markerKey === 'library' ||
      o.markerKey === 'history' ||
      o.markerKey === 'target'
        ? o.markerKey
        : 'target';
  } else if (kind === 'variant') {
    entry.variantKey = typeof o.variantKey === 'string' ? o.variantKey : '';
    entry.activeVariantId = typeof o.activeVariantId === 'string' ? o.activeVariantId : '';
    if (Array.isArray(o.variants)) {
      entry.variants = o.variants
        .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
        .map(v => ({
          id: typeof v.id === 'string' ? v.id : '',
          label: typeof v.label === 'string' ? v.label : '',
          content: typeof v.content === 'string' ? v.content : '',
        }));
    } else {
      entry.variants = [];
    }
  }

  return entry;
}

/** 存量 prompts 自定义迁移进预设 */
export function migrateLegacyPrompts(
  legacy: Partial<{
    jailbreak?: string;
    naiV5Spec?: string;
    naiV5Thinking?: string;
    comfySpec?: string;
    comfyThinking?: string;
    prefill?: string;
  }>,
  backend: BackendId = 'nai',
): PromptPreset[] {
  const migrated: PromptPreset[] = [];
  const hasNaiSpec = Boolean(legacy.naiV5Spec?.trim()) || Boolean(legacy.naiV5Thinking?.trim());
  const hasComfySpec = Boolean(legacy.comfySpec?.trim()) || Boolean(legacy.comfyThinking?.trim());
  const hasCommon = Boolean(legacy.jailbreak?.trim()) || Boolean(legacy.prefill?.trim());

  if (hasNaiSpec || (hasCommon && (backend === 'nai' || !hasComfySpec))) {
    const p = clonePromptPreset(BUILTIN_NAI_SINGLE_PRESET, '我的 NAI 单图预设');
    p.id = 'preset_migrated_nai';
    for (const e of p.entries) {
      if (e.id === 'jb' && legacy.jailbreak?.trim()) e.content = legacy.jailbreak;
      if (e.id === 'spec' && legacy.naiV5Spec?.trim()) e.content = legacy.naiV5Spec;
      if (e.id === 'thinking' && legacy.naiV5Thinking?.trim()) e.content = legacy.naiV5Thinking;
      if (e.id === 'prefill' && legacy.prefill?.trim()) e.content = legacy.prefill;
    }
    migrated.push(p);
  }

  if (hasComfySpec || (hasCommon && (backend === 'comfyui' || !hasNaiSpec))) {
    const p = clonePromptPreset(BUILTIN_COMFY_SINGLE_PRESET, '我的 ComfyUI 预设');
    p.id = 'preset_migrated_comfy';
    for (const e of p.entries) {
      if (e.id === 'jb' && legacy.jailbreak?.trim()) e.content = legacy.jailbreak;
      if (e.id === 'spec' && legacy.comfySpec?.trim()) e.content = legacy.comfySpec;
      if (e.id === 'thinking' && legacy.comfyThinking?.trim()) e.content = legacy.comfyThinking;
      if (e.id === 'prefill' && legacy.prefill?.trim()) e.content = legacy.prefill;
    }
    migrated.push(p);
  }

  return migrated;
}

export function normalizePromptPresets(
  rawPresets: unknown,
  activeId: unknown,
  backend: BackendId,
  comicMode = false,
  legacyPrompts?: Partial<{
    jailbreak?: string;
    naiV5Spec?: string;
    naiV5Thinking?: string;
    comfySpec?: string;
    comfyThinking?: string;
    prefill?: string;
  }>,
  rawActiveMap?: unknown,
): { presets: PromptPreset[]; activePresetId: string; activePresetMap: Record<string, string> } {
  const list: PromptPreset[] = [];
  if (Array.isArray(rawPresets)) {
    for (let i = 0; i < rawPresets.length; i += 1) {
      const item = rawPresets[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;

      const isBuiltin = typeof o.id === 'string' && isBuiltinPromptPreset(o.id);
      const defaultName = isBuiltin
        ? (BUILTIN_PROMPT_PRESETS.find(p => p.id === o.id)?.name ?? '官方预设')
        : `自定义预设 ${i + 1}`;

      const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `preset_${Date.now()}_${i}`;
      const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : defaultName;
      const b: BackendId = o.backend === 'comfyui' ? 'comfyui' : 'nai';
      const m: 'single' | 'comic' = o.mode === 'comic' ? 'comic' : 'single';
      const builtin = isBuiltin || o.builtin === true;

      const entries: PromptEntry[] = [];
      if (Array.isArray(o.entries)) {
        for (let j = 0; j < o.entries.length; j += 1) {
          const entry = normalizePromptEntry(o.entries[j], j);
          if (entry) entries.push(entry);
        }
      }
      list.push({ id, name, backend: b, mode: m, builtin, entries });
    }
  }

  // 存量老配置且从未建立过 presets 数组时,将自定义 prompts 迁移为一套用户预设
  if (!list.length && legacyPrompts) {
    const migrated = migrateLegacyPrompts(legacyPrompts, backend);
    list.push(...migrated);
  }

  const activePresetMap: Record<string, string> =
    rawActiveMap && typeof rawActiveMap === 'object' && !Array.isArray(rawActiveMap)
      ? (rawActiveMap as Record<string, string>)
      : {};

  const active = resolveActivePromptPreset(
    list,
    typeof activeId === 'string' ? activeId : undefined,
    backend,
    comicMode,
    activePresetMap,
  );

  return { presets: list, activePresetId: active.id, activePresetMap };
}
