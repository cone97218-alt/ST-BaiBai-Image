import { describe, expect, it } from 'vitest';
import {
  BUILTIN_COMFY_SINGLE_PRESET,
  BUILTIN_NAI_COMIC_PRESET,
  BUILTIN_NAI_SINGLE_PRESET,
  clonePromptPreset,
  isBuiltinPromptPreset,
  newPromptPreset,
  normalizePromptPresets,
  resolveActivePromptPreset,
} from './promptPresets';

describe('promptPresets', () => {
  it('identifies builtin prompt presets', () => {
    expect(isBuiltinPromptPreset(BUILTIN_NAI_SINGLE_PRESET.id)).toBe(true);
    expect(isBuiltinPromptPreset(BUILTIN_NAI_COMIC_PRESET.id)).toBe(true);
    expect(isBuiltinPromptPreset(BUILTIN_COMFY_SINGLE_PRESET.id)).toBe(true);
    expect(isBuiltinPromptPreset('custom_foo')).toBe(false);
  });

  it('resolves active preset based on backend and comicMode', () => {
    // ComfyUI -> BUILTIN_COMFY_SINGLE_PRESET
    const comfy = resolveActivePromptPreset([], undefined, 'comfyui', false);
    expect(comfy.id).toBe(BUILTIN_COMFY_SINGLE_PRESET.id);

    // NAI single -> BUILTIN_NAI_SINGLE_PRESET
    const naiSingle = resolveActivePromptPreset([], undefined, 'nai', false);
    expect(naiSingle.id).toBe(BUILTIN_NAI_SINGLE_PRESET.id);

    // NAI comic -> BUILTIN_NAI_COMIC_PRESET
    const naiComic = resolveActivePromptPreset([], undefined, 'nai', true);
    expect(naiComic.id).toBe(BUILTIN_NAI_COMIC_PRESET.id);
  });

  it('resolves active preset by ID if matching backend and mode', () => {
    const custom = newPromptPreset('我的单图', 'nai', 'single');
    const resolved = resolveActivePromptPreset([custom], custom.id, 'nai', false);
    expect(resolved.id).toBe(custom.id);
    expect(resolved.name).toBe('我的单图');
  });

  it('falls back to default preset if active ID has mismatched mode', () => {
    const comicPreset = newPromptPreset('我的漫画', 'nai', 'comic');
    // If comicMode is false, comicPreset should not be used as fallback
    const resolved = resolveActivePromptPreset([comicPreset], comicPreset.id, 'nai', false);
    expect(resolved.id).toBe(BUILTIN_NAI_SINGLE_PRESET.id);
  });

  it('creates and clones presets properly', () => {
    const p1 = newPromptPreset('新漫画', 'nai', 'comic');
    expect(p1.backend).toBe('nai');
    expect(p1.mode).toBe('comic');
    expect(p1.entries.length).toBeGreaterThan(5);

    const clone = clonePromptPreset(p1, '克隆预设');
    expect(clone.name).toBe('克隆预设');
    expect(clone.id).not.toBe(p1.id);
    expect(clone.entries.length).toBe(p1.entries.length);
  });

  it('migrates legacy custom prompts into a user preset when presets list is empty', () => {
    const legacy = {
      jailbreak: '自定义破限词',
      naiV5Spec: '自定义 NAI 规范',
    };
    const { presets, activePresetId } = normalizePromptPresets(
      [],
      undefined,
      'nai',
      false,
      legacy,
    );

    expect(presets.length).toBe(1);
    expect(presets[0].name).toBe('我的 NAI 单图预设');
    const jbEntry = presets[0].entries.find(e => e.id === 'jb');
    expect(jbEntry?.content).toBe('自定义破限词');
    const specEntry = presets[0].entries.find(e => e.id === 'spec');
    expect(specEntry?.content).toBe('自定义 NAI 规范');
    expect(activePresetId).toBe(presets[0].id);
  });

  it('remembers independent active preset per backend and mode via activePresetMap', () => {
    const naiCustom = newPromptPreset('NAI定制', 'nai', 'single');
    const comicCustom = newPromptPreset('漫画定制', 'nai', 'comic');
    const comfyCustom = newPromptPreset('Comfy定制', 'comfyui', 'single');
    const presets = [naiCustom, comicCustom, comfyCustom];

    const map = {
      'nai:single': naiCustom.id,
      'nai:comic': comicCustom.id,
      'comfyui:single': comfyCustom.id,
    };

    // Under NAI single mode, resolves NAI定制
    expect(resolveActivePromptPreset(presets, undefined, 'nai', false, map).id).toBe(naiCustom.id);
    // Under NAI comic mode, resolves 漫画定制
    expect(resolveActivePromptPreset(presets, undefined, 'nai', true, map).id).toBe(comicCustom.id);
    // Under ComfyUI single mode, resolves Comfy定制
    expect(resolveActivePromptPreset(presets, undefined, 'comfyui', false, map).id).toBe(comfyCustom.id);
  });

  it('preserves customized builtin presets in normalizePromptPresets', () => {
    const customBuiltin = clonePromptPreset(BUILTIN_NAI_SINGLE_PRESET, '官方内置预设修改版');
    customBuiltin.id = BUILTIN_NAI_SINGLE_PRESET.id;
    customBuiltin.entries[0].content = '修改后的破限词';

    const { presets } = normalizePromptPresets([customBuiltin], customBuiltin.id, 'nai', false);
    expect(presets.length).toBe(1);
    expect(presets[0].id).toBe(BUILTIN_NAI_SINGLE_PRESET.id);
    expect(presets[0].builtin).toBe(true);
    expect(presets[0].entries[0].content).toBe('修改后的破限词');
  });
});
