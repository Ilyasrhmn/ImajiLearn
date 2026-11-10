"use client";
import {
  Children,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import "./themed-select.css";

function optionText(children) {
  return Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : "",
    )
    .join("");
}

export default function ThemedSelect({
  children,
  value = "",
  onChange,
  id,
  name,
  required,
  disabled,
  className = "",
  form,
  ...props
}) {
  const generated = useId(),
    triggerId = id || `select-${generated}`,
    menuId = `${triggerId}-options`;
  const trigger = useRef(null),
    menu = useRef(null),
    native = useRef(null),
    search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [invalid, setInvalid] = useState(false);
  const options = Children.toArray(children)
    .filter((child) => child?.type === "option")
    .map((child) => ({
      value: String(child.props.value ?? optionText(child.props.children)),
      label: optionText(child.props.children),
      disabled: Boolean(child.props.disabled),
      hidden: Boolean(child.props.hidden),
    }));
  const selected = options.find((option) => option.value === String(value));
  const enabled = options
    .map((option, index) => (!option.disabled && !option.hidden ? index : -1))
    .filter((index) => index >= 0);
  const position = useCallback(() => {
    const button = trigger.current,
      popup = menu.current;
    if (!button || !popup || !popup.matches(":popover-open")) return;
    const rect = button.getBoundingClientRect(),
      viewport = window.visualViewport;
    const top = viewport?.offsetTop || 0,
      left = viewport?.offsetLeft || 0;
    const height = viewport?.height || innerHeight,
      width = viewport?.width || innerWidth,
      gutter = 12,
      gap = 6;
    popup.style.width = `${Math.min(Math.max(rect.width, 160), width - gutter * 2)}px`;
    popup.style.maxHeight = "320px";
    const desired = Math.min(popup.scrollHeight, 320),
      below = top + height - rect.bottom - gutter - gap,
      above = rect.top - top - gutter - gap;
    const down = below >= Math.min(desired, 160) || below >= above;
    const available = Math.max(44, Math.min(320, down ? below : above));
    popup.style.maxHeight = `${available}px`;
    popup.style.left = `${Math.max(left + gutter, Math.min(rect.left, left + width - popup.offsetWidth - gutter))}px`;
    popup.style.top = `${down ? rect.bottom + gap : Math.max(top + gutter, rect.top - gap - Math.min(desired, available))}px`;
  }, []);
  function close(focus = false) {
    if (menu.current?.matches(":popover-open")) menu.current.hidePopover();
    setOpen(false);
    search.current = { text: "", time: 0 };
    if (focus) trigger.current?.focus({ preventScroll: true });
  }
  function reveal(index) {
    if (disabled || !enabled.length) return;
    setActive(
      index ??
        (enabled.includes(
          options.findIndex((option) => option.value === String(value)),
        )
          ? options.findIndex((option) => option.value === String(value))
          : enabled[0]),
    );
    setOpen(true);
    menu.current.showPopover({ source: trigger.current });
    position();
  }
  function choose(index, preserveSearch = false) {
    const typed = search.current;
    const option = options[index];
    if (!option || option.disabled || option.hidden) return;
    const select = native.current;
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    setInvalid(Boolean(required && !option.value));
    close(true);
    if (preserveSearch) search.current = typed;
  }
  function key(event) {
    if (event.key === "Tab") {
      if (open) close();
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!enabled.length) return;
      const index =
        event.key === "Home"
          ? enabled[0]
          : event.key === "End"
            ? enabled.at(-1)
            : enabled[
                (Math.max(0, enabled.indexOf(active)) +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  enabled.length) %
                  enabled.length
              ];
      if (!open)
        reveal(event.key === "Home" || event.key === "End" ? index : undefined);
      else setActive(index);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else reveal();
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const now = Date.now(),
        letter = event.key.toLocaleLowerCase("id");
      const text =
        now - search.current.time < 700 ? search.current.text + letter : letter;
      search.current = { text, time: now };
      const term = [...text].every((char) => char === letter) ? letter : text;
      const start = open
        ? active
        : options.findIndex((option) => option.value === String(value));
      const ordered = [
        ...enabled.filter((index) => index > start),
        ...enabled.filter((index) => index <= start),
      ];
      const index = ordered.find((index) =>
        options[index].label.toLocaleLowerCase("id").startsWith(term),
      );
      if (index !== undefined) {
        if (open) setActive(index);
        else choose(index, true);
      }
    }
  }
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [open, position]);
  useEffect(() => {
    if (!open || !menu.current) return;
    const popup = menu.current,
      item = popup.querySelector(`[data-option-index="${active}"]`);
    if (!item) return;
    if (item.offsetTop < popup.scrollTop) popup.scrollTop = item.offsetTop;
    else if (
      item.offsetTop + item.offsetHeight >
      popup.scrollTop + popup.clientHeight
    )
      popup.scrollTop = item.offsetTop + item.offsetHeight - popup.clientHeight;
  }, [active, open]);
  return (
    <>
      <button
        {...props}
        id={triggerId}
        ref={trigger}
        type="button"
        role="combobox"
        className={`themed-select-trigger ${className}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-activedescendant={open ? `${menuId}-${active}` : undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || props["aria-invalid"]}
        aria-describedby={
          [props["aria-describedby"], invalid ? `${triggerId}-error` : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
        data-value={String(value)}
        data-open={open}
        onKeyDown={key}
        onClick={() => (open ? close() : reveal())}
      >
        <span className="themed-select-value">
          {selected?.label || "Pilih opsi"}
        </span>
        <ChevronDown
          className="themed-select-chevron"
          size={18}
          aria-hidden="true"
        />
      </button>
      <select
        ref={native}
        className="themed-select-native"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        form={form}
        value={value}
        disabled={disabled}
        required={required}
        onChange={onChange}
        onInvalid={(event) => {
          event.preventDefault();
          setInvalid(true);
          trigger.current?.focus();
        }}
      >
        {children}
      </select>
      <div
        id={menuId}
        ref={menu}
        className="themed-select-menu"
        role="listbox"
        aria-labelledby={triggerId}
        popover="auto"
        inert={!open}
        aria-hidden={!open}
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        {options.map(
          (option, index) =>
            !option.hidden && (
              <div
                key={`${option.value}-${index}`}
                id={`${menuId}-${index}`}
                role="option"
                aria-selected={String(value) === option.value}
                aria-disabled={option.disabled || undefined}
                data-option-index={index}
                data-value={option.value}
                tabIndex={-1}
                onKeyDown={key}
                onFocus={() => setActive(index)}
                data-active={active === index}
                className="themed-select-option"
                onPointerMove={(event) => {
                  if (event.pointerType !== "touch" && !option.disabled)
                    setActive(index);
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  choose(index);
                }}
              >
                <span>{option.label}</span>
                {String(value) === option.value && (
                  <Check size={17} aria-hidden="true" />
                )}
              </div>
            ),
        )}
      </div>
      {invalid && (
        <span id={`${triggerId}-error`} className="field-error" role="alert">
          Pilih salah satu pilihan.
        </span>
      )}
    </>
  );
}
