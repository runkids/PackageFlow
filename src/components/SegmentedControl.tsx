import { radius } from '../design';

interface Option<T extends string> {
  id: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
}: SegmentedControlProps<T>) {
  return (
    <div
      className="ss-segmented ss-segmented-connected inline-flex items-center gap-0.5 p-1 border border-muted bg-muted/40"
      style={{ borderRadius: radius.sm }}
    >
      {options.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`
              ss-segmented-item inline-flex items-center ${sizeClasses[size]} transition-colors cursor-pointer font-medium
              ${isActive
                ? 'bg-surface text-pencil shadow-sm border border-muted'
                : 'text-pencil-light hover:text-pencil border border-transparent'
              }
            `}
            style={{ borderRadius: radius.sm }}
            aria-pressed={isActive}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
