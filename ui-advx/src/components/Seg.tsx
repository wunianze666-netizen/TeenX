interface SegOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

export function Seg<TValue extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly SegOption<TValue>[];
  value: TValue;
  onChange: (v: TValue) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={o.value === value ? "is-on" : ""}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
