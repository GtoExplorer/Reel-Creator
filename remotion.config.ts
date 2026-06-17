import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setConcurrency(null);

// The source uses ESM-style ".js" import specifiers (required by the Node/tsx
// orchestrator). Teach webpack to resolve them to the real .ts/.tsx files.
Config.overrideWebpackConfig((conf) => ({
  ...conf,
  resolve: {
    ...conf.resolve,
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
}));
