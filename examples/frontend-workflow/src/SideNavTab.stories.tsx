import type { Meta, StoryObj } from '@storybook/react-vite';
// RED scaffold. Synthetic reusable components are not implemented yet.
const meta = { title: 'Atoms/SideNavTab', render: () => <div>Existing component fixture pending</div> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = {};
export const Disabled: Story = {};
export const Keyboard: Story = {};
