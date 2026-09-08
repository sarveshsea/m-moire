import type { StorybookConfig } from '@storybook/react-vite';
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: [],
  core: { disableTelemetry: true },
  viteFinal: (config) => ({ ...config, optimizeDeps: { ...config.optimizeDeps,
    include: [...(config.optimizeDeps?.include ?? []), 'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  } }),
};
export default config;
