import type { editor } from 'monaco-editor'

export const makediffDark: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'type.identifier', foreground: '89b4fa' },
    { token: 'string', foreground: 'a6e3a1' },
    { token: 'string.escape', foreground: '94e2d5' },
    { token: 'number', foreground: 'fab387' },
    { token: 'keyword', foreground: 'cba6f7' },
    { token: 'delimiter', foreground: 'a6adc8' },
    { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
    { token: 'variable', foreground: 'fab387', fontStyle: 'bold' },
    { token: 'variable.predefined', foreground: 'f9e2af' },
    { token: 'identifier', foreground: '89dceb' },
    { token: 'tag', foreground: 'f38ba8' }
  ],
  colors: {
    'editor.background': '#1e1e2e',
    'editor.foreground': '#cdd6f4',
    'editor.lineHighlightBackground': '#252538',
    'editorLineNumber.foreground': '#6c708680',
    'editorLineNumber.activeForeground': '#a6adc8',
    'editor.selectionBackground': '#89b4fa30',
    'editor.inactiveSelectionBackground': '#89b4fa15',
    'editorGutter.addedBackground': '#a6e3a140',
    'editorGutter.deletedBackground': '#f38ba840',
    'editorGutter.modifiedBackground': '#89b4fa40',
    'diffEditor.insertedTextBackground': '#a6e3a120',
    'diffEditor.removedTextBackground': '#f38ba820',
    'diffEditor.insertedLineBackground': '#a6e3a110',
    'diffEditor.removedLineBackground': '#f38ba810',
    'editorWidget.background': '#181825',
    'editorWidget.border': '#313147',
    'input.background': '#252538',
    'input.border': '#313147',
    'input.foreground': '#cdd6f4',
    focusBorder: '#89b4fa',
    'scrollbarSlider.background': '#31314780',
    'scrollbarSlider.hoverBackground': '#6c7086'
  }
}

export const makediffMake: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'type.identifier', foreground: 'c85aff' },
    { token: 'string', foreground: '6fdd8b' },
    { token: 'string.escape', foreground: '6fdd8b' },
    { token: 'number', foreground: 'ffc46b' },
    { token: 'keyword', foreground: 'd77fff' },
    { token: 'delimiter', foreground: 'b8a0d8' },
    { token: 'comment', foreground: '7a5fa0', fontStyle: 'italic' },
    { token: 'variable', foreground: 'ffc46b', fontStyle: 'bold' },
    { token: 'variable.predefined', foreground: 'ffc46b' },
    { token: 'identifier', foreground: 'c85aff' },
    { token: 'tag', foreground: 'ff6b8a' }
  ],
  colors: {
    'editor.background': '#1a0a2e',
    'editor.foreground': '#f0e6ff',
    'editor.lineHighlightBackground': '#2a1448',
    'editorLineNumber.foreground': '#7a5fa080',
    'editorLineNumber.activeForeground': '#b8a0d8',
    'editor.selectionBackground': '#c85aff30',
    'editor.inactiveSelectionBackground': '#c85aff15',
    'editorGutter.addedBackground': '#6fdd8b40',
    'editorGutter.deletedBackground': '#ff6b8a40',
    'editorGutter.modifiedBackground': '#c85aff40',
    'diffEditor.insertedTextBackground': '#6fdd8b20',
    'diffEditor.removedTextBackground': '#ff6b8a20',
    'diffEditor.insertedLineBackground': '#6fdd8b10',
    'diffEditor.removedLineBackground': '#ff6b8a10',
    'editorWidget.background': '#140823',
    'editorWidget.border': '#3a1d5e',
    'input.background': '#2a1448',
    'input.border': '#3a1d5e',
    'input.foreground': '#f0e6ff',
    focusBorder: '#c85aff',
    'scrollbarSlider.background': '#3a1d5e80',
    'scrollbarSlider.hoverBackground': '#7a5fa0'
  }
}

export const makediffLight: editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'type.identifier', foreground: '0071e3' },
    { token: 'string', foreground: '248a3d' },
    { token: 'string.escape', foreground: '248a3d' },
    { token: 'number', foreground: 'b25000' },
    { token: 'keyword', foreground: '7928a1' },
    { token: 'delimiter', foreground: '6e6e73' },
    { token: 'comment', foreground: '999999', fontStyle: 'italic' },
    { token: 'variable', foreground: 'b25000', fontStyle: 'bold' },
    { token: 'variable.predefined', foreground: '8a6d00' },
    { token: 'identifier', foreground: '7928a1' },
    { token: 'tag', foreground: 'd70015' }
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#1d1d1f',
    'editor.lineHighlightBackground': '#f5f5f7',
    'editorLineNumber.foreground': '#99999980',
    'editorLineNumber.activeForeground': '#6e6e73',
    'editor.selectionBackground': '#0071e330',
    'editor.inactiveSelectionBackground': '#0071e315',
    'editorGutter.addedBackground': '#248a3d40',
    'editorGutter.deletedBackground': '#d7001540',
    'editorGutter.modifiedBackground': '#0071e340',
    'diffEditor.insertedTextBackground': '#248a3d18',
    'diffEditor.removedTextBackground': '#d7001518',
    'diffEditor.insertedLineBackground': '#248a3d0c',
    'diffEditor.removedLineBackground': '#d700150c',
    'editorWidget.background': '#f5f5f7',
    'editorWidget.border': '#d2d2d7',
    'input.background': '#ffffff',
    'input.border': '#d2d2d7',
    'input.foreground': '#1d1d1f',
    focusBorder: '#0071e3',
    'scrollbarSlider.background': '#d2d2d780',
    'scrollbarSlider.hoverBackground': '#999999'
  }
}
