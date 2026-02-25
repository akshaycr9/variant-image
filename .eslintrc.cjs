/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  ignorePatterns: [
    "build/**",
    "extensions/**/dist/**",
  ],
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "@remix-run/eslint-config/jest-testing-library",
    "prettier",
  ],
  globals: {
    shopify: "readonly"
  },
};
