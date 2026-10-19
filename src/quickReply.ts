import { openPanel } from '@/state/ui';
import { ensureIconFallback } from '@/st/iconFallback';

export const QR_BTN_ID = 'bbi-qr-button';
export const QR_STYLE_ID = 'bbi-qr-style';

function ensureStyle(): void {
  // 美化主题可能清空图标字形,用高特异性选择器强制还原
  ensureIconFallback(QR_STYLE_ID, `#${QR_BTN_ID} .fa-solid`);
}

export function buildQrButton(): HTMLElement {
  const btn = document.createElement('div');
  btn.id = QR_BTN_ID;
  btn.className = 'qr--button qr-button menu_button interactable';
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.title = '柏宝绘';
  btn.innerHTML = '<i class="qr--button-icon fa-solid fa-palette fa-fw"></i>';

  btn.style.setProperty('display', 'inline-flex', 'important');
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';

  const activate = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    openPanel();
  };

  btn.addEventListener('click', activate);
  btn.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      activate(e);
    }
  });

  return btn;
}

export function findQrContainer(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#qr--bar > .qr--buttons') ??
    document.querySelector<HTMLElement>('#qr--bar .qr--buttons')
  );
}

/**
 * 尝试把按钮挂入快速回复栏(#qr--bar > .qr--buttons)。
 * 成功挂载或已在目标容器内返回 true;容器未就绪返回 false。
 */
export function tryInjectQuickReply(): boolean {
  const container = findQrContainer();
  if (!container) return false;

  ensureStyle();
  let btn = document.getElementById(QR_BTN_ID);
  if (btn) {
    if (!container.contains(btn)) {
      container.appendChild(btn);
    }
    return true;
  }

  btn = buildQrButton();
  container.appendChild(btn);
  return true;
}

export function removeQuickReplyButton(): void {
  document.getElementById(QR_BTN_ID)?.remove();
}

let sendFormObserver: MutationObserver | null = null;
let currentObservedSendForm: HTMLElement | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let scheduled = false;

function scheduleSync(): void {
  if (scheduled) return;
  scheduled = true;
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16);
  raf(() => {
    scheduled = false;
    tryInjectQuickReply();
  });
}

function attachSendFormObserver(): boolean {
  const sendForm = document.getElementById('send_form');
  if (!sendForm) return false;
  if (currentObservedSendForm === sendForm && sendFormObserver) return true;

  if (sendFormObserver) {
    sendFormObserver.disconnect();
    sendFormObserver = null;
  }

  if (typeof MutationObserver !== 'undefined') {
    sendFormObserver = new MutationObserver(() => {
      scheduleSync();
    });
    sendFormObserver.observe(sendForm, { childList: true, subtree: true });
    currentObservedSendForm = sendForm;
  }
  return true;
}

/**
 * 按开关同步快速回复栏按钮。
 * 开:尝试注入 + MutationObserver 监控 #send_form(防止宿主重绘输入栏时冲掉按钮)。
 * 关:断开观察器并移除按钮。
 */
export function syncQuickReplyButton(enabled: boolean): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (!enabled) {
    if (sendFormObserver) {
      sendFormObserver.disconnect();
      sendFormObserver = null;
    }
    currentObservedSendForm = null;
    scheduled = false;
    removeQuickReplyButton();
    return;
  }

  // 1. 尝试监听 #send_form
  const observed = attachSendFormObserver();
  // 2. 尝试挂载按钮
  const injected = tryInjectQuickReply();

  // 若 #send_form 或 QR 容器尚未就绪,起有限轮询兜底(最多约 20s),就绪即停
  if (!observed || !injected) {
    let attempts = 0;
    pollTimer = setInterval(() => {
      const ready = attachSendFormObserver();
      const done = tryInjectQuickReply();
      if ((ready && done) || ++attempts > 40) {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 500);
  }
}
