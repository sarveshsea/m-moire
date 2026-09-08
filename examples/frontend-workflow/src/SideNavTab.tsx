import { Button } from './Button';

/** Synthetic fixture molecule. This catalog export is reused by the later workflow task. */
export interface SideNavTabProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onActivate?: () => void;
}
export function SideNavTab({ label, selected = false, disabled = false, onActivate }: SideNavTabProps) {
  return <Button label={label} className="side-nav-tab" pressed={selected}
    disabled={disabled} onActivate={onActivate} />;
}
