import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SideNavTab } from './SideNavTab';
import { Button } from './Button';

const meta = { title: 'Molecules/SideNavTab', component: SideNavTab, args: { label: 'File' } } satisfies Meta<typeof SideNavTab>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = { args: { selected: true } };
export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => <div className="story-actions"><SideNavTab {...args} /><Button label="Continue" /></div>,
};
function KeyboardFixture() {
  const [activations, setActivations] = useState(0);
  return <div className="story-actions">
    <SideNavTab label="File" selected={activations % 2 === 1} onActivate={() => setActivations((value) => value + 1)} />
    <p role="status">Activations: {activations}</p>
  </div>;
}
export const Keyboard: Story = { render: () => <KeyboardFixture /> };
