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
    // Capacitor에 복사된 번들은 원본 src에서 검사한다.
    "android/app/src/main/assets/public/**",
    "ios/App/App/public/**",
    "next-env.d.ts",
  ]),
  {
    files: ["scripts/**/*.cjs"],
    // Node CommonJS 검증 스크립트는 require가 정식 모듈 문법이다.
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
