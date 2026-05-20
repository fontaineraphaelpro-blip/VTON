type TryOnToggleProps = {
  checked: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  label?: string;
};

export function TryOnToggle({
  checked,
  onChange,
  disabled = false,
  label = "Try-on enabled",
}: TryOnToggleProps) {
  return (
    <button
      type="button"
      className={`vton-tryon-toggle ${checked ? "is-on" : "is-off"}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="vton-tryon-toggle__box" aria-hidden="true">
        {checked ? <span className="vton-tryon-toggle__mark">×</span> : null}
      </span>
    </button>
  );
}
