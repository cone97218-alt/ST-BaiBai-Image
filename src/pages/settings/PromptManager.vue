<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import Icon from '@/components/Icon.vue';
import ModalMask from '@/components/ModalMask.vue';
import {
  BUILTIN_COMFY_SINGLE_PRESET,
  BUILTIN_NAI_COMIC_PRESET,
  BUILTIN_NAI_SINGLE_PRESET,
  clonePromptPreset,
  isBuiltinPromptPreset,
  newPromptPreset,
  type PromptEntry,
  type PromptEntryKind,
  type PromptMarkerKey,
  type PromptPreset,
} from '@/autoTag/promptPresets';
import { settings, activePromptPreset } from '@/state/settings';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
}>();

function close() {
  emit('update:open', false);
}

// 展开/收起的条目 ID 集合
const expandedEntries = ref<Set<string>>(new Set());

function toggleExpand(id: string) {
  const next = new Set(expandedEntries.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedEntries.value = next;
}

// 当前出图模式和后端
const currentBackend = computed(() => settings.defaultBackend);
const isComicMode = computed(() => currentBackend.value === 'nai' && !!settings.autoTag.comicMode);
const targetMode = computed(() => (isComicMode.value ? 'comic' : 'single'));

// 适合当前后端与模式的全部预设（内置 + 用户自定义）
const availablePresets = computed<PromptPreset[]>(() => {
  const baseBuiltin =
    currentBackend.value === 'nai'
      ? isComicMode.value
        ? BUILTIN_NAI_COMIC_PRESET
        : BUILTIN_NAI_SINGLE_PRESET
      : BUILTIN_COMFY_SINGLE_PRESET;

  const currentPresets = settings.autoTag.presets ?? [];
  const foundBuiltinInSettings = currentPresets.find(p => p.id === baseBuiltin.id);
  const builtin = foundBuiltinInSettings ?? baseBuiltin;

  const userPresets = currentPresets.filter(
    p => p.backend === currentBackend.value && p.mode === targetMode.value && p.id !== baseBuiltin.id,
  );
  return [builtin, ...userPresets];
});

function ensurePresetInSettings(preset: PromptPreset): PromptPreset {
  if (!settings.autoTag.presets) settings.autoTag.presets = [];
  const found = settings.autoTag.presets.find(p => p.id === preset.id);
  if (found) return found;
  if (isBuiltinPromptPreset(preset.id)) {
    const clone = clonePromptPreset(preset, preset.name);
    clone.id = preset.id;
    clone.builtin = true;
    settings.autoTag.presets.push(clone);
    return clone;
  }
  return preset;
}

// 当前正在编辑与查看的预设
const currentPreset = computed<PromptPreset>(() => {
  return ensurePresetInSettings(activePromptPreset());
});

const isBuiltin = computed(() => isBuiltinPromptPreset(currentPreset.value.id));

// 切换预设
function selectPreset(id: string) {
  settings.autoTag.activePresetId = id;
  if (!settings.autoTag.activePresetMap) settings.autoTag.activePresetMap = {};
  settings.autoTag.activePresetMap[`${currentBackend.value}:${targetMode.value}`] = id;
}

// 新建预设
function handleNewPreset() {
  const name = `${currentBackend.value === 'nai' ? 'NAI' : 'ComfyUI'} ${isComicMode.value ? '漫画' : '单图'}自定义预设 ${(settings.autoTag.presets ?? []).length + 1}`;
  const p = newPromptPreset(name, currentBackend.value, isComicMode.value ? 'comic' : 'single');
  p.builtin = false;
  if (!settings.autoTag.presets) settings.autoTag.presets = [];
  settings.autoTag.presets.push(p);
  selectPreset(p.id);
  toastr.success(`已创建预设「${name}」`, '提示词预设');
}

// 克隆当前预设
function handleClonePreset() {
  const source = currentPreset.value;
  const p = clonePromptPreset(source, `${source.name} 副本`);
  p.builtin = false;
  if (!settings.autoTag.presets) settings.autoTag.presets = [];
  settings.autoTag.presets.push(p);
  selectPreset(p.id);
  toastr.success(`已克隆预设「${p.name}」`, '提示词预设');
}

// 删除预设二次确认
const confirmDeletePresetOpen = ref(false);

function askDeletePreset() {
  if (isBuiltin.value) {
    toastr.warning('官方内置预设不可删除，如需恢复默认请点击「恢复默认」', '提示词预设');
    return;
  }
  confirmDeletePresetOpen.value = true;
}

function confirmDeletePreset() {
  confirmDeletePresetOpen.value = false;
  const id = currentPreset.value.id;
  if (isBuiltinPromptPreset(id)) return;
  if (!settings.autoTag.presets) settings.autoTag.presets = [];
  const idx = settings.autoTag.presets.findIndex(p => p.id === id);
  if (idx >= 0) {
    settings.autoTag.presets.splice(idx, 1);
    const key = `${currentBackend.value}:${targetMode.value}`;
    if (settings.autoTag.activePresetMap) delete settings.autoTag.activePresetMap[key];
    settings.autoTag.activePresetId = '';
    toastr.info('预设已删除', '提示词预设');
  }
}

// 恢复默认预设
const confirmResetPresetOpen = ref(false);

function askResetPreset() {
  confirmResetPresetOpen.value = true;
}

function confirmResetPreset() {
  confirmResetPresetOpen.value = false;
  const baseBuiltin =
    currentBackend.value === 'nai'
      ? isComicMode.value
        ? BUILTIN_NAI_COMIC_PRESET
        : BUILTIN_NAI_SINGLE_PRESET
      : BUILTIN_COMFY_SINGLE_PRESET;

  // 将当前预设 entries 重置为内置副本
  currentPreset.value.entries = JSON.parse(JSON.stringify(baseBuiltin.entries));
  toastr.success('已恢复为初始默认条目与内容', '提示词预设');
}

// 导出 JSON
function exportPreset() {
  const data = JSON.stringify(currentPreset.value, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BBI_PromptPreset_${currentPreset.value.name}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toastr.success('预设已导出为 JSON', '提示词预设');
}

// 导入 JSON
const fileInput = ref<HTMLInputElement | null>(null);

function triggerImport() {
  fileInput.value?.click();
}

function onFileSelected(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files || !files[0]) return;
  const file = files[0];
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const content = evt.target?.result as string;
      const parsed = JSON.parse(content) as unknown;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Record<string, unknown>).entries)) {
        throw new Error('无效的预设 JSON 格式');
      }
      const imported = clonePromptPreset(parsed as PromptPreset, `${(parsed as Record<string, unknown>).name || '导入预设'} (导入)`);
      imported.builtin = false;
      if (!settings.autoTag.presets) settings.autoTag.presets = [];
      settings.autoTag.presets.push(imported);
      if (imported.backend === currentBackend.value && imported.mode === targetMode.value) {
        selectPreset(imported.id);
      }
      toastr.success(`预设「${imported.name}」导入成功`, '提示词预设');
    } catch (err) {
      toastr.error(err instanceof Error ? err.message : String(err), '导入失败');
    } finally {
      if (fileInput.value) fileInput.value.value = '';
    }
  };
  reader.readAsText(file);
}

// 条目移动（上移 / 下移）
function moveEntry(index: number, direction: 'up' | 'down') {
  const entries = currentPreset.value.entries;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= entries.length) return;
  const [removed] = entries.splice(index, 1);
  entries.splice(target, 0, removed);
}

// 添加自定义条目
function addCustomEntry() {
  const entries = currentPreset.value.entries;
  const newId = `custom_entry_${Date.now()}`;
  const entry: PromptEntry = {
    id: newId,
    name: `自定义规则 ${entries.filter(e => !e.builtin).length + 1}`,
    enabled: true,
    role: 'system',
    kind: 'text',
    builtin: false,
    content: '',
  };
  entries.push(entry);
  expandedEntries.value.add(newId);
  toastr.info('已添加自定义条目，可输入提示词内容', '提示词条目');
}

// 删除自定义条目
function removeEntry(index: number) {
  const entries = currentPreset.value.entries;
  const item = entries[index];
  if (item.builtin) return;
  entries.splice(index, 1);
  expandedEntries.value.delete(item.id);
}

// 重命名条目
const renamingEntry = ref<PromptEntry | null>(null);
const renameDraft = ref('');

function startRename(entry: PromptEntry) {
  renamingEntry.value = entry;
  renameDraft.value = entry.name;
}

function saveRename() {
  if (renamingEntry.value && renameDraft.value.trim()) {
    renamingEntry.value.name = renameDraft.value.trim();
  }
  renamingEntry.value = null;
}

// 常用宏标签列表
const MACRO_LIST = [
  { token: '{{output_shape}}', label: '输出格式 JSON' },
  { token: '{{image_count_rule}}', label: '图片数量规则' },
  { token: '{{page_count_rule}}', label: '漫画页数规则' },
  { token: '{{content_rule}}', label: '正向内容规范' },
  { token: '{{negative_rule}}', label: '负面词规范' },
  { token: '{{size_rule}}', label: '画幅方向规则' },
  { token: '{{character_rule}}', label: '角色建档规则' },
  { token: '{{nl}}', label: '自然语言规范' },
];

function insertMacro(entry: PromptEntry, token: string) {
  entry.content = (entry.content ?? '') + token;
}

// 变体管理（新增 / 改名 / 删除）
const addingVariantForId = ref<string | null>(null);
const newVariantLabel = ref('');
const editingVariantId = ref<string | null>(null);
const editingVariantLabel = ref('');

function startAddVariant(entry: PromptEntry) {
  if (isBuiltin.value) {
    toastr.warning('官方预设不可修改变体结构，请先点击顶部「克隆」新建自定义预设', '变体管理');
    return;
  }
  addingVariantForId.value = entry.id;
  newVariantLabel.value = '';
}

function submitAddVariant(entry: PromptEntry) {
  const label = newVariantLabel.value.trim();
  if (!label) {
    toastr.warning('请输入变体名称', '变体管理');
    return;
  }
  if (!entry.variants) entry.variants = [];
  const id = `var_${Date.now()}`;
  entry.variants.push({
    id,
    label,
    content: `[${label.toUpperCase()}]\n在此输入「${label}」的提示词规则说明...`,
  });
  entry.activeVariantId = id;
  addingVariantForId.value = null;
  newVariantLabel.value = '';
  toastr.success(`已添加新变体「${label}」`, '变体管理');
}

function startRenameVariant(entry: PromptEntry) {
  if (isBuiltin.value) {
    toastr.warning('官方预设不可修改变体名称，请先点击顶部「克隆」新建自定义预设', '变体管理');
    return;
  }
  const v = entry.variants?.find(item => item.id === entry.activeVariantId);
  if (!v) return;
  editingVariantId.value = `${entry.id}_${v.id}`;
  editingVariantLabel.value = v.label;
}

function saveRenameVariant(entry: PromptEntry) {
  const v = entry.variants?.find(item => item.id === entry.activeVariantId);
  if (v && editingVariantLabel.value.trim()) {
    v.label = editingVariantLabel.value.trim();
    toastr.success(`已重命名为「${v.label}」`, '变体管理');
  }
  editingVariantId.value = null;
}

function deleteActiveVariant(entry: PromptEntry) {
  if (isBuiltin.value) {
    toastr.warning('官方预设不可删除变体，请先点击顶部「克隆」新建自定义预设', '变体管理');
    return;
  }
  if (!entry.variants || entry.variants.length <= 1) {
    toastr.warning('至少需要保留一个变体选项', '变体管理');
    return;
  }
  const activeId = entry.activeVariantId;
  const idx = entry.variants.findIndex(v => v.id === activeId);
  if (idx >= 0) {
    const deletedName = entry.variants[idx].label;
    entry.variants.splice(idx, 1);
    entry.activeVariantId = entry.variants[0].id;
    toastr.info(`已删除变体「${deletedName}」`, '变体管理');
  }
}

const MARKER_NAMES: Record<PromptMarkerKey, string> = {
  charCard: '角色卡设定',
  persona: '用户角色描述',
  worldInfo: '世界书',
  library: '角色固定外貌库',
  history: '历史上下文',
  target: '目标正文',
};

const MARKER_DESCRIPTIONS: Record<PromptMarkerKey, string> = {
  charCard: '动态注入当前聊天激活的角色卡设定信息（如有）。',
  persona: '动态注入用户人设与主角描述（如有）。',
  worldInfo: '动态扫描目标楼与上下文激活的世界书条目内容（剔除被排除项）。',
  library: '动态注入本楼的角色固定外貌库档案与柏宝书记忆。',
  history: '动态携带清洗后的最近上下文楼层对话。',
  target: '动态插入带 P 编号的当前目标正文与任务重写说明。',
};
</script>

<template>
  <ModalMask :open="open" @close="close">
    <div class="bbi-modal bbi-pm-modal" role="dialog" aria-modal="true" aria-label="提示词预设管理器">
      <!-- 头部 -->
      <header class="bbi-modal-head">
        <div class="bbi-pm-title-group">
          <span class="bbi-modal-title">提示词预设管理器</span>
          <span class="bbi-pm-mode-badge" :class="isComicMode ? 'is-comic' : 'is-single'">
            {{ currentBackend === 'nai' ? 'NAI' : 'ComfyUI' }} · {{ isComicMode ? '漫画模式' : '单图模式' }}
          </span>
        </div>
        <button class="bbi-icon-mini" type="button" title="关闭" @click="close">
          <Icon name="close" />
        </button>
      </header>

      <!-- 预设操作栏 -->
      <div class="bbi-pm-preset-bar">
        <div class="bbi-pm-preset-select-wrap">
          <span class="bbi-field-label">预设</span>
          <select
            class="bbi-input bbi-select bbi-pm-select"
            :value="currentPreset.id"
            @change="selectPreset(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="p in availablePresets" :key="p.id" :value="p.id">
              {{ p.builtin ? `[官方] ${p.name}` : `[自定义] ${p.name}` }}
            </option>
          </select>
        </div>

        <div class="bbi-pm-actions">
          <button class="bbi-btn bbi-btn-sm" type="button" title="新建预设" @click="handleNewPreset">
            <Icon name="plus" /> 新建
          </button>
          <button class="bbi-btn bbi-btn-sm" type="button" title="克隆当前预设" @click="handleClonePreset">
            <Icon name="copy" /> 克隆
          </button>
          <button class="bbi-btn bbi-btn-sm" type="button" title="导出预设文件" @click="exportPreset">
            <Icon name="download" /> 导出
          </button>
          <button class="bbi-btn bbi-btn-sm" type="button" title="导入预设文件" @click="triggerImport">
            <Icon name="upload" /> 导入
          </button>
          <input ref="fileInput" type="file" accept=".json" class="bbi-hidden-file" @change="onFileSelected" />
          <button
            class="bbi-btn bbi-btn-sm bbi-btn-warning"
            type="button"
            title="将条目恢复为初始默认"
            @click="askResetPreset"
          >
            <Icon name="undo" /> 重置
          </button>
          <button
            v-if="!isBuiltin"
            class="bbi-btn bbi-btn-sm bbi-btn-danger"
            type="button"
            title="删除此预设"
            @click="askDeletePreset"
          >
            <Icon name="trash" /> 删除
          </button>
        </div>
      </div>

      <!-- 预设名称编辑 -->
      <div class="bbi-pm-info-row">
        <template v-if="!isBuiltin">
          <span class="bbi-field-label">预设名称</span>
          <input v-model="currentPreset.name" class="bbi-input bbi-pm-name-input" type="text" placeholder="预设名称" />
        </template>
        <template v-else>
          <p class="bbi-field-hint bbi-pm-builtin-hint">
            <Icon name="info" /> 当前为官方内置预设。可自由开关条目、调整顺序或编辑提示词内容；如需增加或删除条目，请点击「克隆」新建副本。
          </p>
        </template>
      </div>

      <!-- 条目列表 -->
      <div class="bbi-pm-list-container">
        <div class="bbi-pm-list-header">
          <span class="bbi-field-label">提示词结构与条目流</span>
          <span class="bbi-field-value">{{ currentPreset.entries.filter(e => e.enabled).length }} / {{ currentPreset.entries.length }} 启用</span>
        </div>

        <ul class="bbi-pm-entry-list">
          <li
            v-for="(entry, idx) in currentPreset.entries"
            :key="entry.id"
            class="bbi-pm-entry-card"
            :class="{ 'is-disabled': !entry.enabled, 'is-expanded': expandedEntries.has(entry.id) }"
          >
            <!-- 条目概览栏 -->
            <div class="bbi-pm-entry-header" @click="toggleExpand(entry.id)">
              <!-- 开关 -->
              <input
                v-model="entry.enabled"
                type="checkbox"
                class="bbi-checkbox"
                :title="entry.enabled ? '点击禁用该条目' : '点击启用该条目'"
                @click.stop
              />

              <!-- 主体: 标题 + 徽标 (移动端自动换行显示，避免挤压文字) -->
              <div class="bbi-pm-entry-main">
                <div class="bbi-pm-entry-title">
                  <template v-if="renamingEntry?.id === entry.id">
                    <input
                      v-model="renameDraft"
                      class="bbi-input bbi-input-sm bbi-pm-rename-input"
                      type="text"
                      @blur="saveRename"
                      @keydown.enter.prevent="saveRename"
                      @click.stop
                    />
                  </template>
                  <template v-else>
                    <span class="bbi-pm-entry-name" :title="entry.name">{{ entry.name }}</span>
                    <button
                      v-if="!entry.builtin"
                      class="bbi-pm-btn-icon bbi-pm-btn-edit"
                      type="button"
                      title="重命名条目"
                      @click.stop="startRename(entry)"
                    >
                      <Icon name="edit" />
                    </button>
                  </template>
                </div>

                <!-- 徽标标签 -->
                <div class="bbi-pm-entry-badges" @click.stop>
                  <span class="bbi-badge bbi-badge-role" :class="`is-${entry.role}`">{{ entry.role }}</span>
                  <span class="bbi-badge bbi-badge-kind" :class="`is-${entry.kind}`">
                    {{ entry.kind === 'text' ? '文本' : entry.kind === 'variant' ? '变体' : '插槽' }}
                  </span>
                </div>
              </div>

              <!-- 右侧操作 -->
              <div class="bbi-pm-entry-right-actions" @click.stop>
                <!-- 上移 -->
                <button
                  class="bbi-pm-btn-icon"
                  type="button"
                  :disabled="idx === 0"
                  title="上移"
                  @click="moveEntry(idx, 'up')"
                >
                  <Icon name="arrowUp" />
                </button>
                <!-- 下移 -->
                <button
                  class="bbi-pm-btn-icon"
                  type="button"
                  :disabled="idx === currentPreset.entries.length - 1"
                  title="下移"
                  @click="moveEntry(idx, 'down')"
                >
                  <Icon name="arrowDown" />
                </button>
                <!-- 删除（仅自定义条目） -->
                <button
                  v-if="!entry.builtin && !isBuiltin"
                  class="bbi-pm-btn-icon bbi-pm-btn-delete"
                  type="button"
                  title="删除条目"
                  @click="removeEntry(idx)"
                >
                  <Icon name="trash" />
                </button>
                <!-- 展开/收起 -->
                <button
                  class="bbi-pm-btn-icon bbi-pm-btn-toggle"
                  type="button"
                  :title="expandedEntries.has(entry.id) ? '收起' : '展开编辑'"
                  @click="toggleExpand(entry.id)"
                >
                  <Icon :name="expandedEntries.has(entry.id) ? 'chevronUp' : 'chevronDown'" />
                </button>
              </div>
            </div>

            <!-- 展开详情面板 -->
            <div v-if="expandedEntries.has(entry.id)" class="bbi-pm-entry-body">
              <!-- Kind === 'text' -->
              <template v-if="entry.kind === 'text'">
                <div class="bbi-pm-field-row">
                  <span class="bbi-field-label">消息角色</span>
                  <select v-model="entry.role" class="bbi-input bbi-select bbi-input-sm">
                    <option value="system">System</option>
                    <option value="user">User</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </div>

                <div class="bbi-pm-textarea-wrap">
                  <textarea
                    v-model="entry.content"
                    class="bbi-input bbi-pm-textarea"
                    rows="6"
                    placeholder="输入提示词文本..."
                    spellcheck="false"
                  ></textarea>
                </div>

                <!-- 宏插入工具栏 -->
                <div class="bbi-pm-macros-bar">
                  <span class="bbi-field-label">点击插入可用宏：</span>
                  <div class="bbi-pm-macro-chips">
                    <button
                      v-for="m in MACRO_LIST"
                      :key="m.token"
                      class="bbi-chip bbi-pm-macro-chip"
                      type="button"
                      :title="m.token"
                      @click="insertMacro(entry, m.token)"
                    >
                      + {{ m.label }}
                    </button>
                  </div>
                </div>
              </template>

              <!-- Kind === 'variant' -->
              <template v-else-if="entry.kind === 'variant'">
                <div class="bbi-pm-variant-desc">
                  <p class="bbi-field-hint">
                    互斥风格选项：从下列预设选项中切换当前生效的分镜/色彩/风格文法。
                  </p>
                </div>

                <div class="bbi-pm-field-row bbi-pm-variant-row">
                  <div class="bbi-pm-variant-head">
                    <span class="bbi-field-label">当前选项</span>
                    <div class="bbi-pm-variant-actions">
                      <button
                        class="bbi-btn bbi-btn-sm"
                        type="button"
                        title="添加新变体选项"
                        @click="startAddVariant(entry)"
                      >
                        <Icon name="plus" /> 新增选项
                      </button>
                      <button
                        class="bbi-btn bbi-btn-sm"
                        type="button"
                        title="重命名当前选项"
                        @click="startRenameVariant(entry)"
                      >
                        <Icon name="edit" /> 改名
                      </button>
                      <button
                        v-if="(entry.variants?.length ?? 0) > 1"
                        class="bbi-btn bbi-btn-sm bbi-btn-danger"
                        type="button"
                        title="删除当前选项"
                        @click="deleteActiveVariant(entry)"
                      >
                        <Icon name="trash" /> 删除
                      </button>
                    </div>
                  </div>

                  <!-- 重命名输入框（展开时显示） -->
                  <div v-if="editingVariantId === `${entry.id}_${entry.activeVariantId}`" class="bbi-pm-inline-edit">
                    <input
                      v-model="editingVariantLabel"
                      class="bbi-input bbi-input-sm"
                      placeholder="修改选项名称"
                      @keydown.enter.prevent="saveRenameVariant(entry)"
                    />
                    <button class="bbi-btn bbi-btn-primary bbi-btn-sm" type="button" @click="saveRenameVariant(entry)">保存</button>
                    <button class="bbi-btn bbi-btn-sm" type="button" @click="editingVariantId = null">取消</button>
                  </div>

                  <!-- 新增变体输入框（展开时显示） -->
                  <div v-else-if="addingVariantForId === entry.id" class="bbi-pm-inline-edit">
                    <input
                      v-model="newVariantLabel"
                      class="bbi-input bbi-input-sm"
                      placeholder="输入新变体名称（如：自制气泡、美漫分镜）"
                      @keydown.enter.prevent="submitAddVariant(entry)"
                    />
                    <button class="bbi-btn bbi-btn-primary bbi-btn-sm" type="button" @click="submitAddVariant(entry)">添加</button>
                    <button class="bbi-btn bbi-btn-sm" type="button" @click="addingVariantForId = null">取消</button>
                  </div>

                  <!-- 正常下拉选择器 -->
                  <select v-else v-model="entry.activeVariantId" class="bbi-input bbi-select">
                    <option v-for="v in entry.variants" :key="v.id" :value="v.id">
                      {{ v.label }}
                    </option>
                  </select>
                </div>

                <!-- 显示并允许编辑选中的变体文案 -->
                <div v-if="entry.variants?.find(v => v.id === entry.activeVariantId)" class="bbi-pm-textarea-wrap">
                  <div class="bbi-field-head">
                    <span class="bbi-field-label">选中项提示词内容</span>
                  </div>
                  <textarea
                    v-model="entry.variants.find(v => v.id === entry.activeVariantId)!.content"
                    class="bbi-input bbi-pm-textarea"
                    rows="5"
                    spellcheck="false"
                  ></textarea>
                </div>
              </template>

              <!-- Kind === 'marker' -->
              <template v-else-if="entry.kind === 'marker'">
                <div class="bbi-pm-marker-info">
                  <div class="bbi-pm-field-row">
                    <span class="bbi-field-label">插槽类型</span>
                    <span class="bbi-pm-marker-name">{{ MARKER_NAMES[entry.markerKey!] }}</span>
                  </div>
                  <p class="bbi-field-hint">
                    {{ MARKER_DESCRIPTIONS[entry.markerKey!] }}
                  </p>
                </div>
              </template>
            </div>
          </li>
        </ul>

        <!-- 添加条目按钮 -->
        <div class="bbi-pm-add-bar">
          <button class="bbi-btn bbi-btn-primary" type="button" @click="addCustomEntry">
            <Icon name="plus" /> 添加自定义提示词条目
          </button>
        </div>
      </div>
    </div>
  </ModalMask>

  <!-- 删除确认弹窗 -->
  <ConfirmDialog
    v-model:open="confirmDeletePresetOpen"
    title="删除预设"
    tone="danger"
    confirm-icon="trash"
    confirm-text="确认删除"
    @confirm="confirmDeletePreset"
  >
    <p>确定要删除预设「{{ currentPreset.name }}」吗？此操作不可撤销。</p>
  </ConfirmDialog>

  <!-- 重置确认弹窗 -->
  <ConfirmDialog
    v-model:open="confirmResetPresetOpen"
    title="恢复初始预设"
    tone="danger"
    confirm-icon="undo"
    confirm-text="确认恢复"
    @confirm="confirmResetPreset"
  >
    <p>确定要将当前预设的全部条目与内容重置回初始默认设置吗？您做出的自定义改动将会丢失。</p>
  </ConfirmDialog>
</template>

<style scoped>
.bbi-pm-modal {
  width: 95vw;
  max-width: 820px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}

.bbi-pm-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bbi-pm-mode-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.bbi-pm-mode-badge.is-single {
  background: rgba(var(--bbi-accent-rgb, 59, 130, 246), 0.15);
  color: var(--bbi-accent);
}

.bbi-pm-mode-badge.is-comic {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.bbi-pm-preset-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bbi-surface-2, rgba(0, 0, 0, 0.2));
  border-bottom: 1px solid var(--bbi-border);
  flex-wrap: wrap;
}

.bbi-pm-preset-select-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 220px;
}

.bbi-pm-select {
  flex: 1;
  font-weight: 500;
}

.bbi-pm-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.bbi-hidden-file {
  display: none;
}

.bbi-pm-info-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--bbi-border);
}

.bbi-pm-name-input {
  max-width: 320px;
}

.bbi-pm-builtin-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--bbi-text-muted);
  font-size: 12px;
}

.bbi-pm-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bbi-pm-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.bbi-pm-entry-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bbi-pm-entry-card {
  border: 1px solid var(--bbi-border);
  border-radius: var(--bbi-radius, 6px);
  background: var(--bbi-surface, rgba(255, 255, 255, 0.03));
  transition: all 0.2s ease;
}

.bbi-pm-entry-card.is-disabled {
  opacity: 0.55;
  background: transparent;
}

.bbi-pm-entry-card.is-expanded {
  border-color: var(--bbi-accent);
}

.bbi-pm-entry-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}

.bbi-pm-entry-header:hover {
  background: rgba(255, 255, 255, 0.02);
}

.bbi-pm-entry-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.bbi-pm-entry-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.bbi-pm-entry-name {
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bbi-pm-entry-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bbi-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 600;
}

.bbi-badge-role.is-system {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
}

.bbi-badge-role.is-user {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.bbi-badge-role.is-assistant {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.bbi-badge-kind {
  background: var(--bbi-surface-2, rgba(255, 255, 255, 0.08));
  color: var(--bbi-text-muted);
}

.bbi-pm-entry-right-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.bbi-pm-btn-icon {
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--bbi-ink-muted, rgba(255, 255, 255, 0.6));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 13px;
}

.bbi-pm-btn-icon:hover:not(:disabled) {
  background: var(--bbi-surface-hover, rgba(255, 255, 255, 0.1));
  color: var(--bbi-ink, #ffffff);
}

.bbi-pm-btn-icon:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}

.bbi-pm-btn-delete:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.bbi-pm-entry-body {
  padding: 12px;
  border-top: 1px solid var(--bbi-border);
  background: var(--bbi-surface-2, rgba(0, 0, 0, 0.1));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bbi-pm-field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.bbi-pm-variant-row {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.bbi-pm-variant-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.bbi-pm-variant-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bbi-pm-inline-edit {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.bbi-pm-inline-edit input {
  flex: 1;
  min-width: 0;
}

.bbi-pm-textarea-wrap {
  width: 100%;
}

.bbi-pm-textarea {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}

.bbi-pm-macros-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bbi-pm-macro-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bbi-pm-macro-chip {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--bbi-surface, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--bbi-border);
  border-radius: 4px;
  cursor: pointer;
}

.bbi-pm-macro-chip:hover {
  border-color: var(--bbi-accent);
  color: var(--bbi-accent);
}

.bbi-pm-marker-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--bbi-accent);
}

.bbi-pm-add-bar {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

@media (max-width: 640px) {
  /* 弹窗占满/贴边，最大化手机屏幕利用率 */
  .bbi-pm-modal {
    width: 98vw;
    max-width: 98vw;
    height: 94vh;
    max-height: 94vh;
    margin: 0 auto;
  }

  .bbi-modal-head {
    padding: 8px 12px;
  }

  .bbi-pm-title-group {
    gap: 6px;
    flex-wrap: wrap;
  }

  .bbi-modal-title {
    font-size: 14px;
  }

  /* 顶部预设切换区：纵向换行与网格按钮 */
  .bbi-pm-preset-bar {
    padding: 8px 10px;
    gap: 8px;
  }

  .bbi-pm-preset-select-wrap {
    width: 100%;
    min-width: 0;
    gap: 6px;
  }

  .bbi-pm-preset-select-wrap .bbi-field-label {
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 12px;
  }

  .bbi-pm-select {
    font-size: 12px;
  }

  .bbi-pm-actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }

  .bbi-pm-actions .bbi-btn {
    padding: 5px 6px;
    font-size: 11px;
    justify-content: center;
  }

  /* 预设名称：上下两行排列，防止「预设名称」被挤成两截 */
  .bbi-pm-info-row {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding: 8px 10px;
  }

  .bbi-pm-info-row .bbi-field-label {
    white-space: nowrap;
  }

  .bbi-pm-name-input {
    width: 100%;
    max-width: 100%;
    font-size: 13px;
  }

  .bbi-pm-list-container {
    padding: 8px 6px;
  }

  .bbi-pm-list-header {
    padding: 0 4px 6px;
  }

  /* 条目头部：标题放第一行，徽标放第二行，右侧按钮紧凑 */
  .bbi-pm-entry-header {
    padding: 6px 8px;
    gap: 6px;
  }

  .bbi-pm-entry-main {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .bbi-pm-entry-name {
    font-size: 13px;
    white-space: normal;
    word-break: break-word;
    line-height: 1.3;
  }

  .bbi-pm-entry-badges {
    gap: 4px;
  }

  .bbi-badge {
    font-size: 9px;
    padding: 0 4px;
    line-height: 1.4;
  }

  .bbi-pm-entry-right-actions {
    gap: 0;
  }

  .bbi-pm-btn-icon {
    width: 24px;
    height: 24px;
    font-size: 11px;
  }

  /* 卡片展开区：字段上下堆叠，避免「当前选项」被折行 */
  .bbi-pm-entry-body {
    padding: 10px 8px;
    gap: 8px;
  }

  .bbi-pm-field-row {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }

  .bbi-pm-field-row .bbi-field-label {
    white-space: nowrap;
  }

  .bbi-pm-field-row select,
  .bbi-pm-field-row input {
    width: 100%;
    max-width: 100%;
  }

  .bbi-pm-macro-chip {
    font-size: 10px;
    padding: 2px 6px;
  }

  .bbi-pm-variant-head {
    flex-wrap: wrap;
    gap: 6px;
  }

  .bbi-pm-variant-actions {
    gap: 4px;
    flex-wrap: wrap;
  }

  .bbi-pm-variant-actions .bbi-btn {
    padding: 3px 6px;
    font-size: 11px;
  }
}
</style>
