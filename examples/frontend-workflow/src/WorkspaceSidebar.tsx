import { useState } from 'react';
import { SideNavTab } from './SideNavTab';

/** Synthetic workflow organism: consumes the mapped catalog export unchanged. */
export function WorkspaceSidebar() {
  const [selected, setSelected] = useState(false);
  return <div className="story-actions">
    <nav aria-label="Workspace" className="workspace-nav">
      <SideNavTab label="File" selected={selected} onActivate={() => setSelected(true)} />
      <SideNavTab label="Archive" disabled />
    </nav>
    <p role="status">Selected: {selected ? 'File' : 'none'}</p>
  </div>;
}
