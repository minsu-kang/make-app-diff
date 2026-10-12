import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import prettierConfig from 'eslint-config-prettier'

const RENDERER = 'src/renderer'
const featuresDir = fileURLToPath(new URL('./src/renderer/features', import.meta.url))
const FEATURES = existsSync(featuresDir)
  ? readdirSync(featuresDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : []

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const layerPattern = (names, message) => ({
  regex: `^(?:\\.\\./)+(?:features/)?(?:${names.map(escapeRegex).join('|')})(?:/|$)`,
  message
})
const restrictImports = (...patterns) => ['error', { patterns }]
const preloadOrMain = {
  regex: '^(?:\\.\\./)+(?:preload|main)(?:/|$)',
  message: 'Import preload and main types through shared/types.'
}
const bridgeGetter = String.raw`/^get(Api|MenuEvents|AppVersion)$/`
const preloadOrMainPath = String.raw`/^(\.\.\/)+(preload|main)(\/|$)/`
const rendererSyntax = [
  {
    selector: `CallExpression[callee.name=${bridgeGetter}]:not(:function *)`,
    message: 'Call the shared/api getter where it is used.'
  },
  {
    selector: `CallExpression[callee.property.name=${bridgeGetter}]:not(:function *)`,
    message: 'Call the shared/api getter where it is used.'
  },
  {
    selector: `ImportExpression[source.value=${preloadOrMainPath}]`,
    message: 'Import preload and main types through shared/types.'
  },
  {
    selector: `CallExpression[callee.name='require'][arguments.0.value=${preloadOrMainPath}]`,
    message: 'Import preload and main types through shared/types.'
  }
]
const windowBridge = ['api', 'onMenu', 'appVersion'].map((property) => ({
  object: 'window',
  property,
  message: 'Use shared/api.'
}))
const sharedOnly = layerPattern(['app', 'features', 'monaco'], 'shared imports nothing from app, features or monaco.')

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin
    },
    settings: {
      react: { version: 'detect' }
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    // Playwright fixtures name their callback `use`, which the hooks rule mistakes for a React hook
    files: ['src/e2e/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'no-empty-pattern': 'off'
    }
  },
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },
  {
    files: [`${RENDERER}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-properties': ['error', ...windowBridge],
      'no-restricted-imports': restrictImports(preloadOrMain),
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': ['error', ...rendererSyntax]
    }
  },
  {
    files: [`${RENDERER}/shared/**/*.{ts,tsx}`],
    rules: { 'no-restricted-imports': restrictImports(preloadOrMain, sharedOnly) }
  },
  {
    files: [`${RENDERER}/shared/types/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': restrictImports(sharedOnly),
      'no-restricted-syntax': [
        'error',
        ...rendererSyntax,
        { selector: "ExportNamedDeclaration[source][exportKind='value']", message: 'Use export type in shared/types.' },
        { selector: "ExportAllDeclaration[exportKind='value']", message: 'Use export type in shared/types.' }
      ]
    }
  },
  {
    files: [`${RENDERER}/shared/api/**/*.{ts,tsx}`],
    rules: { 'no-restricted-properties': 'off' }
  },
  {
    files: [`${RENDERER}/monaco/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': restrictImports(
        preloadOrMain,
        layerPattern(['app', 'features'], 'monaco imports nothing from app or features.')
      )
    }
  },
  ...FEATURES.map((feature) => ({
    files: [`${RENDERER}/features/${feature}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': restrictImports(
        preloadOrMain,
        layerPattern(
          ['app', 'features', ...FEATURES.filter((other) => other !== feature)],
          `features/${feature} imports other features only through shared.`
        )
      )
    }
  })),
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}'],
    rules: { 'no-restricted-properties': 'off' }
  },
  {
    ignores: ['out/', 'dist/', 'node_modules/', '*.config.*']
  }
)
