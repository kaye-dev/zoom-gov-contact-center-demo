import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "plans/**",
    ".local/**",
    "tools/prototype-runtime/**",
    "test/fixtures/next-prototype/**",
  ]),
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["**/plans/**", "**/.local/**", "**/tools/prototype-runtime/**", "**/test/fixtures/**", "@prototype/**"],
          message: "本番から計画資料・prototype runtimeを参照せず、採用した表示コンポーネントを本番へ移してください。",
        }],
      }],
    },
  },
  {
    files: ["app/**/*.tsx"],
    ignores: ["app/components/Checkbox.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='input']:has(JSXAttribute[name.name='type'][value.value='checkbox'])",
          message:
            "生のチェックボックスではなく app/components/Checkbox.tsx の Checkbox を使用してください。",
        },
        {
          selector:
            "JSXOpeningElement[name.name='input']:has(JSXAttribute[name.name='type'] > JSXExpressionContainer > Literal[value='checkbox'])",
          message:
            "生のチェックボックスではなく app/components/Checkbox.tsx の Checkbox を使用してください。",
        },
      ],
    },
  },
]);

export default eslintConfig;
