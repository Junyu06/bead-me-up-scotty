import parent from "../eslint.config.mjs";

const config = [
  ...parent,
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
];

export default config;
