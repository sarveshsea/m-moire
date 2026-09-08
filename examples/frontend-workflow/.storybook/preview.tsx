import type { Preview } from '@storybook/react-vite';
const preview: Preview = {
  globalTypes: { theme: { toolbar: { title: 'Theme', items: ['dark', 'light'] } } },
  initialGlobals: { theme: 'dark' },
  decorators: [(Story, context) => <div className="fixture-panel" data-theme={context.globals.theme}><Story /></div>],
};
export default preview;
