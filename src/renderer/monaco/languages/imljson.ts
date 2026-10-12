import type { languages } from 'monaco-editor'

export const imljsonLanguage: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.imljson',

  keywords: ['true', 'false', 'null'],
  builtins: [
    'item',
    'body',
    'connection',
    'parameters',
    'response',
    'headers',
    'temp',
    'oauth',
    'common',
    'query',
    'data',
    'undefined',
    'emptyarray',
    'emptystring'
  ],

  escapes: /\\(?:["\\/bfnrt{}]|u[0-9a-fA-F]{4})/,

  tokenizer: {
    root: [
      // Whitespace
      { include: '@whitespace' },

      // JSON key
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'type.identifier'],

      // String (may contain IML expressions and rpc://)
      [/"/, 'string', '@string'],

      // Number
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],

      // Literals
      [/\b(?:true|false|null)\b/, 'keyword'],

      // Delimiters
      [/[{}[\],:]/, 'delimiter']
    ],

    string: [
      // IML mustache expression
      [/\{\{/, 'variable', '@imlExpression'],

      // RPC reference
      [/rpc:\/\/\w+/, 'tag'],

      // Escape sequence
      [/@escapes/, 'string.escape'],

      // End of string
      [/"/, 'string', '@pop'],

      // String content
      [/[^"\\{]+/, 'string'],
      [/./, 'string']
    ],

    imlExpression: [
      // Builtin variables
      [
        /\b(?:item|body|connection|parameters|response|headers|temp|oauth|common|query|data|undefined|emptyarray|emptystring)\b/,
        'variable.predefined'
      ],

      // Function call
      [/\b\w+(?=\s*\()/, 'identifier'],

      // Single-quoted string inside IML
      [/'[^']*'/, 'string'],

      // End of IML expression
      [/\}\}/, 'variable', '@pop'],

      // Other content
      [/./, 'variable']
    ],

    whitespace: [
      [/\s+/, 'white'],
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment']
    ],

    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/./, 'comment']
    ]
  }
}

export const imljsonLanguageConfig: languages.LanguageConfiguration = {
  brackets: [
    ['{', '}'],
    ['[', ']']
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: '{{', close: '}}' }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '"', close: '"' }
  ],
  folding: {
    markers: {
      start: /^\s*[{[]/,
      end: /^\s*[}\]]/
    }
  }
}
