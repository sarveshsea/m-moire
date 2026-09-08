/** Synthetic fixture atom. Created as catalog setup, before the mapped reuse task. */
export interface ButtonProps {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
  onActivate?: () => void;
}
export function Button({ label, disabled = false, pressed, className = '', onActivate }: ButtonProps) {
  return <button type="button" className={`button ${className}`} disabled={disabled}
    aria-pressed={pressed} onClick={onActivate}>{label}</button>;
}
