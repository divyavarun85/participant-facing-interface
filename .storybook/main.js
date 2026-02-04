// .storybook/main.js
export default {
  framework: { name: '@storybook/vue3-vite', options: {} },
  stories: [
    '../stories/**/*.stories.@(js|mdx)',
    '../src/**/*.stories.@(js|mdx)',
  ],
  addons: ['@storybook/addon-essentials'],
  staticDirs: ['../public'],
  features: {
    buildStoriesJson: false,
  },
  async viteFinal(config) {
    config.define = { ...(config.define ?? {}), 'process.env': {} };
    return config;
  },
};
