import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
const meta = { title: 'Atoms/Button', component: Button, args: { label: 'Continue' } } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
