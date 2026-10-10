import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";
import pluginJsxA11y from "eslint-plugin-jsx-a11y";

export default [
  {
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      "src/api/**/*.{js,mjs,cjs,jsx}",
      "src/hooks/**/*.{js,mjs,cjs,jsx}",
      "src/App.jsx",
      "src/Layout.jsx",
    ],
    ignores: ["src/lib/**/*", "src/components/ui/**/*"],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      // The `rules` key replaces the spread recommended rule sets above, so
      // re-enable the checks that catch runtime ReferenceErrors (e.g. bare
      // `{{token}}` text in JSX, or reading a const before its declaration).
      "no-undef": "error",
      "react/jsx-no-undef": "error",
      "no-use-before-define": [
        "error",
        { functions: false, classes: false, variables: false },
      ],
      "no-unused-vars": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    // Accessibility. The app's own form and button components count as the
    // native elements they render, so unlabeled inputs and icon-only buttons
    // are caught too. Autofocus is allowed (dialogs and inline editors the
    // user just opened); label-has-for is deprecated.
    files: ["src/components/**/*.jsx", "src/pages/**/*.jsx", "src/App.jsx", "src/Layout.jsx"],
    ignores: ["src/components/ui/**/*"],
    plugins: { "jsx-a11y": pluginJsxA11y },
    settings: {
      "jsx-a11y": {
        components: {
          Input: "input",
          Textarea: "textarea",
          Button: "button",
          Label: "label",
          SelectTrigger: "button",
          Checkbox: "input",
          Switch: "button",
        },
      },
    },
    rules: {
      ...Object.fromEntries(Object.keys(pluginJsxA11y.configs.recommended.rules).map((rule) => [rule, "error"])),
      "jsx-a11y/label-has-for": "off",
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/control-has-associated-label": ["error", { ignoreElements: ["td", "th", "tr", "li"], depth: 3 }],
    },
  },
];
