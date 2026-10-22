import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".wrangler/**", ".sites-runtime/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  { files: ["**/*.mjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
);
