import { useCallback, useId, useRef } from "react";

const HEX_6 = /^#[0-9A-Fa-f]{6}$/;
const HEX_3 = /^#[0-9A-Fa-f]{3}$/;

export function normalizeHexColor(input: string, fallback: string): string {
  let value = input.trim();
  if (!value) {
    return fallback;
  }
  if (!value.startsWith("#")) {
    value = `#${value}`;
  }
  if (HEX_3.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    value = `#${r}${r}${g}${g}${b}${b}`;
  }
  if (HEX_6.test(value)) {
    return value.toLowerCase();
  }
  return fallback;
}

function hexBody(value: string): string {
  return value.replace(/^#/, "").replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
}

function isValidHex(value: string): boolean {
  return HEX_6.test(value) || HEX_3.test(value);
}

type Props = {
  label: string;
  hint?: string;
  value: string;
  onChange: (hex: string) => void;
  presets?: string[];
};

export function WidgetColorField({
  label,
  hint,
  value,
  onChange,
  presets = [],
}: Props) {
  const inputId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const lastValidRef = useRef("#000000");

  if (isValidHex(value)) {
    lastValidRef.current = normalizeHexColor(value, lastValidRef.current);
  }

  const pickerValue = normalizeHexColor(value, lastValidRef.current);
  const swatchColor = isValidHex(value) ? pickerValue : lastValidRef.current;
  const hexDisplay = hexBody(value);

  const openPicker = useCallback(() => {
    pickerRef.current?.click();
  }, []);

  const handleHexInput = useCallback(
    (raw: string) => {
      const next = raw.replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
      onChange(next ? `#${next}` : "#");
    },
    [onChange]
  );

  const commitHex = useCallback(() => {
    const normalized = normalizeHexColor(value, lastValidRef.current);
    lastValidRef.current = normalized;
    if (value !== normalized) {
      onChange(normalized);
    }
  }, [onChange, value]);

  const handlePickerChange = useCallback(
    (hex: string) => {
      const normalized = normalizeHexColor(hex, lastValidRef.current);
      lastValidRef.current = normalized;
      onChange(normalized);
    },
    [onChange]
  );

  return (
    <div className="vton-color-picker">
      <div className="vton-color-picker__head">
        <label className="vton-color-picker__label" htmlFor={inputId}>
          {label}
        </label>
        {hint ? <p className="vton-color-picker__hint">{hint}</p> : null}
      </div>

      <div className="vton-color-picker__main">
        <button
          type="button"
          className="vton-color-picker__swatch"
          onClick={openPicker}
          aria-label={`${label} — open color picker`}
          style={{ backgroundColor: swatchColor }}
        >
          <input
            ref={pickerRef}
            id={inputId}
            type="color"
            className="vton-color-picker__native"
            value={pickerValue}
            onChange={(e) => handlePickerChange(e.target.value)}
            tabIndex={-1}
          />
        </button>

        <div className="vton-color-picker__hex-wrap">
          <span className="vton-color-picker__hex-prefix" aria-hidden="true">
            #
          </span>
          <input
            type="text"
            className="vton-color-picker__hex-input"
            value={hexDisplay}
            onChange={(e) => handleHexInput(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitHex();
                (e.target as HTMLInputElement).blur();
              }
            }}
            spellCheck={false}
            autoComplete="off"
            maxLength={6}
            aria-label={`${label} hex code`}
          />
        </div>
      </div>

      {presets.length > 0 ? (
        <div className="vton-color-picker__presets" role="list" aria-label={`${label} presets`}>
          {presets.map((preset) => {
            const normalized = normalizeHexColor(preset, preset);
            const selected =
              normalizeHexColor(value, value) === normalized ||
              (!isValidHex(value) &&
                normalizeHexColor(lastValidRef.current, lastValidRef.current) ===
                  normalized);
            return (
              <button
                key={preset}
                type="button"
                role="listitem"
                className={
                  "vton-color-picker__preset" + (selected ? " is-selected" : "")
                }
                style={{ backgroundColor: normalized }}
                onClick={() => handlePickerChange(normalized)}
                aria-label={`Use ${normalized}`}
                aria-pressed={selected}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export type WidgetColorPairing = {
  id: string;
  name: string;
  bg: string;
  text: string;
};

export const WIDGET_COLOR_PAIRINGS: WidgetColorPairing[] = [
  { id: "classic", name: "Classic", bg: "#111827", text: "#ffffff" },
  { id: "ivory", name: "Ivory", bg: "#faf8f5", text: "#1a1a1a" },
  { id: "navy", name: "Navy", bg: "#1e3a5f", text: "#f8fafc" },
  { id: "forest", name: "Forest", bg: "#14532d", text: "#ecfdf5" },
  { id: "wine", name: "Wine", bg: "#7f1d1d", text: "#fef2f2" },
  { id: "violet", name: "Violet", bg: "#5b21b6", text: "#f5f3ff" },
];

const BG_PRESETS = [
  "#111827",
  "#000000",
  "#ffffff",
  "#1e3a5f",
  "#5b21b6",
  "#be123c",
  "#047857",
  "#d97706",
];

const TEXT_PRESETS = [
  "#ffffff",
  "#111827",
  "#000000",
  "#f8fafc",
  "#fef3c7",
  "#ecfdf5",
];

type PairingsProps = {
  pairings?: WidgetColorPairing[];
  currentBg: string;
  currentText: string;
  onApply: (bg: string, text: string) => void;
};

export function WidgetColorPairings({
  pairings = WIDGET_COLOR_PAIRINGS,
  currentBg,
  currentText,
  onApply,
}: PairingsProps) {
  const bgNorm = normalizeHexColor(currentBg, "#000000");
  const textNorm = normalizeHexColor(currentText, "#ffffff");

  return (
    <div className="vton-color-pairings">
      <p className="vton-color-pairings__title">Quick styles</p>
      <div className="vton-color-pairings__grid">
        {pairings.map((pair) => {
          const selected =
            normalizeHexColor(pair.bg, pair.bg) === bgNorm &&
            normalizeHexColor(pair.text, pair.text) === textNorm;
          return (
            <button
              key={pair.id}
              type="button"
              className={
                "vton-color-pairing" + (selected ? " is-selected" : "")
              }
              onClick={() => onApply(pair.bg, pair.text)}
              aria-pressed={selected}
            >
              <span
                className="vton-color-pairing__chip"
                style={{ backgroundColor: pair.bg, color: pair.text }}
              >
                Aa
              </span>
              <span className="vton-color-pairing__name">{pair.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { BG_PRESETS, TEXT_PRESETS };
