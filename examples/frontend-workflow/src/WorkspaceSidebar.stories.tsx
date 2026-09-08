import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceSidebar } from './WorkspaceSidebar';
const meta = { title: 'Workflows/WorkspaceSidebar', component: WorkspaceSidebar } satisfies Meta<typeof WorkspaceSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MappedReuse: Story = {};
