import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QR_BTN_ID,
  QR_STYLE_ID,
  buildQrButton,
  findQrContainer,
  removeQuickReplyButton,
  syncQuickReplyButton,
  tryInjectQuickReply,
} from './quickReply';
import * as uiModule from '@/state/ui';

class MockElement {
  id: string = '';
  className: string = '';
  title: string = '';
  innerHTML: string = '';
  style = {
    setProperty: vi.fn(),
    alignItems: '',
    justifyContent: '',
  };
  attributes: Record<string, string> = {};
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  listeners: Record<string, ((e: any) => void)[]> = {};

  get classList() {
    return {
      contains: (c: string) => this.className.split(' ').includes(c),
      add: (c: string) => {
        const parts = this.className ? this.className.split(' ') : [];
        if (!parts.includes(c)) parts.push(c);
        this.className = parts.join(' ');
      },
    };
  }

  setAttribute(k: string, v: string) {
    this.attributes[k] = v;
  }
  getAttribute(k: string) {
    return this.attributes[k] ?? null;
  }
  addEventListener(event: string, cb: (e: any) => void) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(cb);
  }
  dispatchEvent(event: { type: string; key?: string; preventDefault?: () => void; stopPropagation?: () => void }) {
    if (!event.preventDefault) event.preventDefault = vi.fn();
    if (!event.stopPropagation) event.stopPropagation = vi.fn();
    for (const cb of this.listeners[event.type] || []) {
      cb(event);
    }
  }
  click() {
    this.dispatchEvent({ type: 'click' });
  }
  appendChild(child: MockElement) {
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    this.children.push(child);
    child.parentElement = this;
    return child;
  }
  removeChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
  }
  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }
  contains(child: MockElement | null): boolean {
    if (!child) return false;
    if (child === this) return true;
    for (const c of this.children) {
      if (c.contains(child)) return true;
    }
    return false;
  }
}

describe('quickReply', () => {
  let openPanelSpy: ReturnType<typeof vi.spyOn>;
  let sendFormEl: MockElement;
  let qrBarEl: MockElement;
  let qrButtonsEl: MockElement;
  let headEl: MockElement;
  let bodyEl: MockElement;
  let createdElements: MockElement[] = [];
  let observerCallbacks: (() => void)[] = [];

  class MockMutationObserver {
    callback: () => void;
    constructor(cb: () => void) {
      this.callback = cb;
      observerCallbacks.push(cb);
    }
    observe = vi.fn();
    disconnect = vi.fn(() => {
      observerCallbacks = observerCallbacks.filter(c => c !== this.callback);
    });
  }

  function findElementById(id: string): MockElement | null {
    if (sendFormEl.id === id && bodyEl.contains(sendFormEl)) return sendFormEl;
    if (qrBarEl.id === id && bodyEl.contains(qrBarEl)) return qrBarEl;
    for (const el of createdElements) {
      if (el.id === id && (bodyEl.contains(el) || headEl.contains(el))) return el;
    }
    return null;
  }

  beforeEach(() => {
    createdElements = [];
    observerCallbacks = [];
    openPanelSpy = vi.spyOn(uiModule, 'openPanel').mockImplementation(() => {});

    headEl = new MockElement();
    bodyEl = new MockElement();

    sendFormEl = new MockElement();
    sendFormEl.id = 'send_form';

    qrBarEl = new MockElement();
    qrBarEl.id = 'qr--bar';

    qrButtonsEl = new MockElement();
    qrButtonsEl.className = 'qr--buttons';

    qrBarEl.appendChild(qrButtonsEl);
    sendFormEl.appendChild(qrBarEl);
    bodyEl.appendChild(sendFormEl);

    const docMock = {
      head: headEl,
      body: bodyEl,
      createElement: vi.fn((tag: string) => {
        const el = new MockElement();
        createdElements.push(el);
        return el;
      }),
      getElementById: vi.fn((id: string) => findElementById(id)),
      querySelector: vi.fn((selector: string) => {
        if (selector === '#qr--bar > .qr--buttons' || selector === '#qr--bar .qr--buttons') {
          return bodyEl.contains(qrBarEl) && qrBarEl.children.includes(qrButtonsEl) ? qrButtonsEl : null;
        }
        return null;
      }),
    };

    vi.stubGlobal('document', docMock);
    vi.stubGlobal('MutationObserver', MockMutationObserver);
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => fn());
  });

  afterEach(() => {
    syncQuickReplyButton(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('findQrContainer 能正确命中 #qr--bar > .qr--buttons', () => {
    const container = findQrContainer();
    expect(container).toBe(qrButtonsEl);
  });

  it('找不到容器时 findQrContainer 返回 null 且 tryInjectQuickReply 返回 false', () => {
    qrBarEl.remove();
    expect(findQrContainer()).toBeNull();
    expect(tryInjectQuickReply()).toBe(false);
  });

  it('buildQrButton 构造具有正确属性、样式和事件监听的按钮', () => {
    const btn = buildQrButton();
    expect(btn.id).toBe(QR_BTN_ID);
    expect(btn.classList.contains('qr--button')).toBe(true);
    expect(btn.classList.contains('menu_button')).toBe(true);
    expect(btn.classList.contains('interactable')).toBe(true);
    expect(btn.getAttribute('role')).toBe('button');
    expect(btn.getAttribute('tabindex')).toBe('0');
    expect(btn.title).toBe('柏宝绘');
    expect(btn.innerHTML).toContain('fa-palette');

    // 点击事件触发 openPanel
    btn.click();
    expect(openPanelSpy).toHaveBeenCalledTimes(1);

    // 回车和空格键触发 openPanel
    btn.dispatchEvent({ type: 'keydown', key: 'Enter' } as unknown as Event);
    expect(openPanelSpy).toHaveBeenCalledTimes(2);

    btn.dispatchEvent({ type: 'keydown', key: ' ' } as unknown as Event);
    expect(openPanelSpy).toHaveBeenCalledTimes(3);

    // 其它按键不触发
    btn.dispatchEvent({ type: 'keydown', key: 'Escape' } as unknown as Event);
    expect(openPanelSpy).toHaveBeenCalledTimes(3);
  });

  it('tryInjectQuickReply 成功挂载按钮并确保样式兜底', () => {
    expect(tryInjectQuickReply()).toBe(true);

    const btn = findElementById(QR_BTN_ID);
    expect(btn).not.toBeNull();
    expect(qrButtonsEl.contains(btn!)).toBe(true);
    // 图标兜底 style
    expect(findElementById(QR_STYLE_ID)).not.toBeNull();

    // 再次调用具备幂等性
    expect(tryInjectQuickReply()).toBe(true);
    expect(qrButtonsEl.children.filter(c => c.id === QR_BTN_ID).length).toBe(1);
  });

  it('当按钮被外部冲掉时,重新调用 tryInjectQuickReply 能恢复挂载', () => {
    tryInjectQuickReply();
    const btn = findElementById(QR_BTN_ID)!;
    btn.remove();

    expect(qrButtonsEl.contains(btn)).toBe(false);
    expect(tryInjectQuickReply()).toBe(true);
    expect(qrButtonsEl.contains(findElementById(QR_BTN_ID)!)).toBe(true);
  });

  it('removeQuickReplyButton 能从 DOM 移除按钮', () => {
    tryInjectQuickReply();
    expect(findElementById(QR_BTN_ID)).not.toBeNull();
    removeQuickReplyButton();
    expect(findElementById(QR_BTN_ID)).toBeNull();
  });

  it('syncQuickReplyButton(true) 启用并监听 #send_form,宿主重绘时自动恢复按钮', () => {
    syncQuickReplyButton(true);

    const btn = findElementById(QR_BTN_ID)!;
    expect(qrButtonsEl.contains(btn)).toBe(true);

    // 模拟宿主/快速回复插件清空并重绘 .qr--buttons (冲掉所有子节点)
    qrButtonsEl.removeChild(btn);
    expect(qrButtonsEl.contains(btn)).toBe(false);

    // 触发 MutationObserver 回调
    for (const cb of observerCallbacks) {
      cb();
    }

    // 验证按钮已被自愈恢复
    const restoredBtn = findElementById(QR_BTN_ID)!;
    expect(restoredBtn).not.toBeNull();
    expect(qrButtonsEl.contains(restoredBtn)).toBe(true);
  });

  it('syncQuickReplyButton(false) 关闭功能,断开观察器并移除按钮', () => {
    syncQuickReplyButton(true);
    expect(findElementById(QR_BTN_ID)).not.toBeNull();

    syncQuickReplyButton(false);
    expect(findElementById(QR_BTN_ID)).toBeNull();
    expect(observerCallbacks.length).toBe(0);
  });
});
