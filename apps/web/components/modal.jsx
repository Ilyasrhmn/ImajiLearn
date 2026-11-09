"use client";
import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import Icon from "./icon";

const swaps = new WeakMap();

// Keep native top-layer content out of document-wide snapshot transitions.
export async function swapModalContent(update, focusSelector) {
  const dialog = Array.from(document.querySelectorAll("dialog[open]")).at(-1);
  const content = dialog?.querySelector(".modal-content");
  if (!content || dialog.dataset.closing) return;
  const previous = swaps.get(dialog);
  const oldHeight = dialog.getBoundingClientRect().height;
  const opacity = getComputedStyle(content).opacity;
  const restore = previous?.restore || { height: dialog.style.height, overflow: dialog.style.overflow };
  const job = { animations: [], restore };
  swaps.set(dialog, job);
  previous?.animations.forEach(animation => animation.cancel());
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const current = () => swaps.get(dialog) === job && dialog.isConnected && !dialog.dataset.closing;
  const animate = (element, frames, duration) => {
    const animation = element.animate(frames, { duration, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
    job.animations.push(animation);
    return animation;
  };
  try {
    if (!reduced) {
      dialog.style.height = `${oldHeight}px`;
      dialog.style.overflow = "hidden";
      content.inert = true;
      await animate(content, [{ opacity }, { opacity: 0 }], 100).finished;
    }
    if (!current()) return;
    flushSync(update);
    dialog.scrollTop = 0;
    content.scrollTop = 0;
    content.inert = false;
    const style = getComputedStyle(dialog);
    const natural = content.scrollHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const height = Math.min(natural, parseFloat(style.maxHeight) || natural);
    job.animations.forEach(animation => animation.cancel());
    if (focusSelector && !content.contains(document.activeElement)) dialog.querySelector(focusSelector)?.focus({ preventScroll: true });
    if (!reduced) await Promise.all([
      animate(dialog, [{ height: `${oldHeight}px` }, { height: `${height}px` }], 240).finished,
      animate(content, [{ opacity: 0 }, { opacity: 1 }], 180).finished,
    ]);
  } catch {
    // A new switch or closing the dialog interrupts the current animation.
  } finally {
    if (swaps.get(dialog) === job) {
      job.animations.forEach(animation => animation.cancel());
      dialog.style.height = restore.height;
      dialog.style.overflow = restore.overflow;
      content.inert = false;
      swaps.delete(dialog);
    }
  }
}

export function closeModal(onClose) {
  const dialog = Array.from(document.querySelectorAll("dialog[open]")).at(-1);
  if (!dialog || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onClose(); return; }
  if (dialog.dataset.closing) return;
  const swap = swaps.get(dialog);
  if (swap) {
    const content = dialog.querySelector(".modal-content");
    const height = dialog.getBoundingClientRect().height;
    const opacity = getComputedStyle(content).opacity;
    swaps.delete(dialog);
    swap.animations.forEach(animation => animation.cancel());
    dialog.style.height = `${height}px`;
    dialog.style.overflow = "hidden";
    content.style.opacity = opacity;
  }
  const { transform } = getComputedStyle(dialog);
  dialog.style.setProperty("--backdrop-opacity", getComputedStyle(dialog, "::backdrop").opacity);
  dialog.getAnimations().forEach(animation => animation.cancel());
  dialog.dataset.closing = "true";
  dialog.inert = true;
  const animation = dialog.animate([
    { transform }, { transform: "translateY(10px) scale(.985)" },
  ], { duration: 160, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
  animation.finished.catch(() => {}).then(onClose);
}

export default function Modal({ title, children, onClose, wide = false, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      const swap = swaps.get(dialog);
      swaps.delete(dialog);
      swap?.animations.forEach(animation => animation.cancel());
      dialog.close();
      document.body.style.overflow = before;
      queueMicrotask(() => {
        if (previous?.isConnected) previous.focus?.();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`modal${wide ? " modal-wide" : ""}${className ? ` ${className}` : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        closeModal(onClose);
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            closeModal(onClose);
        }
      }}
    >
      <button
        className="icon-button modal-close"
        aria-label="Tutup dialog"
        onClick={() => closeModal(onClose)}
      >
        <Icon name="close" />
      </button>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
