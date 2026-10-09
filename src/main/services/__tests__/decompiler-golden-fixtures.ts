import type { ExtractedFile } from '../../types'

export type Api = Record<string, unknown>

const IML_LINE = "if (api) api.iml = {functions: require('./functions')};"
const DEFINE_LINE = "Object.defineProperty(this, 'api', {get: () => api, set: () => null});"

function classSource(className: string, parent: string, api: unknown): string {
  return `
      class ${className} extends ${parent} {
        constructor() {
          super();
          const api = ${JSON.stringify(api)};
          ${IML_LINE}
          ${DEFINE_LINE}
        }
      }`
}

/** lib/app.js, lib/rpc.js or lib/endpoints.js shape: one class per export key, `module.exports = { key: Class }` */
export function compiledJs(apis: Record<string, unknown>, parent = 'ExecuteAction'): string {
  const keys = Object.keys(apis)
  const classes = keys.map((key, i) => classSource(`C${i}`, parent, apis[key]))
  const exportsMap = keys.map((key, i) => `${JSON.stringify(key)}: C${i}`).join(', ')
  return `${classes.join('\n')}\n      module.exports = { ${exportsMap} };\n`
}

/** lib/account.js or lib/hook.js shape: a single class, `module.exports = Class` */
export function singleClassJs(api: unknown, parent: string): string {
  return `${classSource('Component', parent, api)}\n      module.exports = Component;\n`
}

/** lib/functions.js shape: every export is the function source as a string literal */
export function functionsJs(functions: Record<string, string>): string {
  const entries = Object.entries(functions).map(
    ([name, source]) => `${JSON.stringify(name)}: ${JSON.stringify(source)}`
  )
  return `module.exports = {\n  ${entries.join(',\n  ')}\n};\n`
}

export function manifestFile(manifest: unknown): ExtractedFile {
  return { path: 'manifest.json', content: JSON.stringify(manifest) }
}

export function jsFile(path: string, content: string): ExtractedFile {
  return { path, content }
}

// ---- Golden app 1: acme-crm, ten modules sharing base fields, with per-module overrides ----

const CRM_ERRORS = {
  '401': { type: 'AuthenticationError', message: '{{body.error.message}}' },
  '429': { type: 'RateLimitError', message: 'Rate limit exceeded' },
  default: { message: '{{body.message}}' }
}

const CRM_AUTH = { Authorization: 'Bearer {{connection.accessToken}}', Accept: 'application/json' }

function crmApi(url: string, method: string, tweaks: Api = {}): Api {
  return {
    url,
    method,
    baseUrl: 'https://api.acme.test/v2',
    timeout: 30000,
    headers: { ...CRM_AUTH },
    qs: { apiVersion: '2024-01' },
    response: {
      valid: '{{statusCode < 400}}',
      error: { ...CRM_ERRORS },
      temp: { errorMessages: { '190': 'Invalid OAuth token' } },
      output: '{{body}}'
    },
    log: { sanitize: ['request.headers.authorization'] },
    ...tweaks
  }
}

function crmResponse(output: string, errorOverrides: Api = {}, extraTemp: Api = {}): Api {
  return {
    valid: '{{statusCode < 400}}',
    error: { ...CRM_ERRORS, ...errorOverrides },
    temp: { errorMessages: { '190': 'Invalid OAuth token' }, ...extraTemp },
    output
  }
}

function crmItem(name: string, label: string, extra: Api = {}): Api {
  return {
    name,
    label,
    description: `${label} in Acme CRM`,
    parameters: [{ name: '__IMTCONN__', type: 'account:acme-crm-oauth' }],
    ...extra
  }
}

const CRM_JSON_HEADERS = { ...CRM_AUTH, 'Content-Type': 'application/json' }

export const crmApps: Record<string, Api> = {
  createContact: crmApi('/contacts', 'POST', {
    headers: { ...CRM_JSON_HEADERS },
    body: { email: '{{parameters.email}}', pipelineId: '{{parameters.pipelineId}}' },
    response: crmResponse('{{body.contact}}', { '409': { type: 'ConflictError', message: 'Contact exists' } }),
    temp: { pageSize: 50, contactDefaults: { source: 'api' } }
  }),
  updateContact: crmApi('/contacts/{{parameters.id}}', 'PATCH', {
    headers: { ...CRM_JSON_HEADERS },
    body: { email: '{{parameters.email}}' },
    response: crmResponse('{{body.contact}}'),
    temp: { pageSize: 50 }
  }),
  deleteContact: crmApi('/contacts/{{parameters.id}}', 'DELETE', {
    headers: { ...CRM_AUTH, Accept: 'application/problem+json' },
    response: crmResponse('{{body}}', { '429': { type: 'RateLimitError', message: 'Slow down' } })
  }),
  getContact: crmApi('/contacts/{{parameters.id}}', 'GET', {
    qs: { apiVersion: '2023-06' },
    response: {
      valid: { condition: '{{statusCode == 200}}' },
      error: { ...CRM_ERRORS },
      temp: { errorMessages: { '190': 'Invalid OAuth token' } },
      output: '{{body.contact}}'
    }
  }),
  getCompany: crmApi('/companies/{{parameters.id}}', 'GET', {
    metadata: { author: 'acme' },
    response: crmResponse('{{body.company}}')
  }),
  createCompany: crmApi('/companies', 'POST', {
    headers: { ...CRM_JSON_HEADERS },
    body: { name: '{{parameters.name}}' },
    response: crmResponse('{{body.company}}')
  }),
  searchContacts: crmApi('/contacts/search', 'GET', {
    qs: { apiVersion: '2024-01', q: '{{parameters.query}}', limit: '{{parameters.limit}}' },
    pagination: { condition: '{{body.hasMore}}', qs: { cursor: '{{body.next}}' } },
    response: crmResponse('{{item}}', {}, { iterate: '{{body.items}}' }),
    temp: { pageSize: 50, cursorKey: 'next' }
  }),
  searchCompanies: crmApi('/companies/search', 'GET', {
    baseUrl: 'https://search.acme.test/v2',
    pagination: { condition: '{{body.hasMore}}', qs: { cursor: '{{body.next}}' } },
    response: crmResponse('{{item}}', {}, { iterate: '{{body.items}}' })
  }),
  watchContacts: {
    communication: [
      crmApi('/contacts', 'GET', {
        qs: { apiVersion: '2024-01', sort: 'updatedAt' },
        response: crmResponse('{{item}}', {}, { iterate: '{{body.items}}' }),
        metadata: { step: 1 }
      }),
      {
        url: '/contacts/{{item.id}}',
        method: 'GET',
        baseUrl: 'https://api.acme.test/v2',
        timeout: 30000,
        headers: { ...CRM_AUTH, 'X-Expand': 'owner' },
        qs: { apiVersion: '2024-01' },
        response: { valid: '{{statusCode < 400}}', error: { ...CRM_ERRORS }, output: '{{body}}' },
        log: { sanitize: ['request.headers.authorization'] }
      }
    ]
  },
  watchCompanies: crmApi('/companies', 'GET', {
    timeout: 45000,
    response: crmResponse('{{item}}', {}, { iterate: '{{body.items}}' })
  })
}

const CRM_RPC_STORE = (rpc: string): Api => ({ options: { store: `rpc://acme-crm@2/${rpc}` } })

export const crmManifest = {
  name: 'acme-crm',
  label: 'Acme CRM',
  description: 'Manage contacts and companies in Acme CRM',
  theme: '#2E7D32',
  version: 3,
  groups: [
    { name: 'contacts', label: 'Contacts' },
    { name: 'companies', label: 'Companies' }
  ],
  actions: [
    crmItem('createContact', 'Create a Contact', {
      expect: [
        { name: 'email', type: 'email', label: 'Email', required: true },
        { name: 'pipelineId', type: 'select', label: 'Pipeline', ...CRM_RPC_STORE('listPipelines') }
      ],
      scope: ['contacts.write']
    }),
    crmItem('updateContact', 'Update a Contact', { scope: ['contacts.write'] }),
    crmItem('deleteContact', 'Delete a Contact', {
      parameters: [
        {
          name: '__IMTCONN__',
          type: 'account:acme-crm-oauth',
          options: { nested: { store: [{ name: 'id', type: 'uinteger', required: true }] } }
        }
      ],
      expect: [],
      scope: ['contacts.write']
    }),
    crmItem('getContact', 'Get a Contact'),
    crmItem('getCompany', 'Get a Company'),
    crmItem('createCompany', 'Create a Company', { scope: ['companies.write'] })
  ],
  searches: [
    crmItem('searchContacts', 'Search Contacts', {
      expect: [{ name: 'query', type: 'text', label: 'Query' }],
      interface: [{ name: 'email', type: 'email', label: 'Email' }]
    }),
    crmItem('searchCompanies', 'Search Companies')
  ],
  triggers: [
    crmItem('watchContacts', 'Watch Contacts', {
      parameters: [
        {
          name: '__IMTCONN__',
          type: 'account:acme-crm-oauth',
          options: {
            nested: [
              { name: 'limit', type: 'uinteger', default: 10 },
              { name: 'ownerId', type: 'select', ...CRM_RPC_STORE('listOwners') }
            ]
          }
        }
      ]
    }),
    crmItem('watchCompanies', 'Watch Companies')
  ]
}

export function crmFiles(): ExtractedFile[] {
  return [manifestFile(crmManifest), jsFile('lib/app.js', compiledJs(crmApps)), jsFile('readme.md', '# Acme CRM')]
}

// ---- Golden app 2: boardly, RPCs, webhooks, epochs, endpoints, functions and assets ----

const BOARD_BASE_URL = 'https://api.boardly.test/1'

function boardResponse(extra: Api = {}): Api {
  return { error: { default: { message: '{{body.message}}' } }, ...extra }
}

function boardApi(url: string, method = 'GET', tweaks: Api = {}): Api {
  return {
    url,
    method,
    baseUrl: BOARD_BASE_URL,
    headers: { Authorization: 'Bearer {{connection.accessToken}}' },
    response: boardResponse(),
    ...tweaks
  }
}

export const boardModules: Record<string, Api> = {
  getBoard: boardApi('/boards/{{parameters.boardId}}', 'GET', { response: boardResponse({ output: '{{body}}' }) }),
  moveCard: boardApi('/cards/{{parameters.cardId}}', 'PUT', { body: { listId: '{{parameters.listId}}' } }),
  archiveCard: boardApi('/cards/{{parameters.cardId}}/archive', 'POST'),
  searchCards: boardApi('/search', 'GET', {
    qs: { query: '{{parameters.query}}' },
    response: boardResponse({ iterate: '{{body.cards}}', output: '{{item}}' })
  }),
  watchBoardItems: boardApi('/boards/{{parameters.boardId}}/items', 'GET', {
    response: boardResponse({ output: '{{body}}' })
  }),
  watchBoardComments: boardApi('/boards/{{parameters.boardId}}/comments', 'GET'),
  watchCards: {
    communication: [
      boardApi('/lists/{{parameters.listId}}/cards', 'GET', { qs: { since: '{{formatDate(now)}}' } }),
      boardApi('/cards/{{item.id}}', 'GET')
    ]
  },
  watchLists: boardApi('/boards/{{parameters.boardId}}/lists', 'GET', { qs: { filter: 'open' } }),
  watchChecklists: {
    communication: [boardApi('/checklists', 'GET'), boardApi('/checklists', 'GET')]
  }
}

export const boardRpcs: Record<string, Api> = {
  listBoards: boardApi('/boards', 'GET', {
    response: boardResponse({ iterate: '{{body}}', output: { label: '{{item.name}}', value: '{{item.id}}' } })
  }),
  getBoardFields: boardApi('/boards/{{parameters.boardId}}/fields', 'GET'),
  'attach:boardly-board-hook': boardApi('/webhooks', 'POST', {
    body: { callbackUrl: '{{webhook.url}}', model: 'rpc://boardly@3/resolveModel' }
  }),
  'detach:boardly-board-hook': boardApi('/webhooks/{{webhook.id}}', 'DELETE'),
  'update:boardly-board-hook': boardApi('/webhooks/{{webhook.id}}', 'PUT', { body: { active: true } }),
  'attach:orphanModule': boardApi('/orphans', 'POST'),
  'epoch:watchBoardItems': boardApi('/boards/{{parameters.boardId}}/items', 'GET', {
    qs: { limit: 1 },
    response: boardResponse({ output: '{{body}}', iterate: '{{body.items}}' })
  }),
  'epoch:watchLists': boardApi('/boards/{{parameters.boardId}}/lists', 'GET', { qs: { filter: 'open', limit: 1 } }),
  'epoch:watchCards': {
    communication: [
      boardApi('/lists/{{parameters.listId}}/cards', 'GET', { qs: { since: '{{formatDate(now)}}', limit: 1 } }),
      boardApi('/cards/{{item.id}}', 'GET', { qs: { expand: 'true' } })
    ]
  },
  'epoch:watchChecklists': {
    communication: [
      boardApi('/checklists', 'GET', { qs: { limit: 1 } }),
      boardApi('/checklists', 'GET', { qs: { limit: 1 } })
    ]
  },
  'epoch:ghostModule': boardApi('/ghost', 'GET')
}

export const boardEndpoints: Record<string, Api> = {
  getBoardSummary: boardApi('/boards/{{inputParameters.boardId}}/summary', 'GET', {
    response: boardResponse({ output: '{{body.summary}}' })
  })
}

export const boardFunctions: Record<string, string> = {
  formatDate: 'function formatDate(date) {\n  return new Date(date).toISOString();\n}',
  buildFilter: 'function buildFilter(parts) { return parts.filter(Boolean).join(" AND "); }'
}

export const boardManifest = {
  name: 'boardly',
  label: 'Boardly',
  description: 'Boards, lists and cards',
  theme: '#6D4AFF',
  actions: [
    {
      name: 'getBoard',
      label: 'Get a Board',
      parameters: [{ name: '__IMTCONN__', type: 'account:boardly-oauth' }],
      expect: [{ name: 'boardId', type: 'select', ...{ options: { store: 'rpc://boardly@3/listBoards' } } }],
      interface: [{ name: 'name', type: 'text' }],
      scope: ['boards:read']
    },
    {
      name: 'moveCard',
      label: 'Move a Card',
      parameters: [
        {
          name: '__IMTCONN__',
          type: 'account:boardly-oauth',
          options: { nested: { store: [{ name: 'cardId', type: 'text' }] } }
        }
      ],
      expect: [],
      interface: [],
      scope: ['cards:write']
    },
    {
      name: 'archiveCard',
      label: 'Archive a Card',
      parameters: [{ name: '__IMTCONN__', type: 'account:boardly-oauth' }],
      expect: [{ name: 'cardId', type: 'text' }]
    }
  ],
  searches: [
    {
      name: 'searchCards',
      label: 'Search Cards',
      parameters: [{ name: '__IMTCONN__', type: 'account:boardly-oauth' }],
      expect: [{ name: 'query', type: 'text' }],
      interface: [{ name: 'id', type: 'text' }]
    }
  ],
  triggers: [
    {
      name: 'watchBoardItems',
      label: 'Watch Board Items',
      parameters: [
        {
          name: '__IMTHOOK__',
          type: 'hook:boardly-board-hook',
          options: { nested: [{ name: 'boardId', type: 'select', options: { store: 'rpc://boardly@3/listBoards' } }] }
        }
      ],
      interface: [{ name: 'itemId', type: 'text' }]
    },
    {
      name: 'watchBoardComments',
      label: 'Watch Board Comments',
      parameters: [{ name: '__IMTHOOK__', type: 'hook:boardly-board-hook', options: { nested: [] } }],
      interface: []
    },
    {
      name: 'watchCards',
      label: 'Watch Cards',
      parameters: [
        {
          name: '__IMTCONN__',
          type: 'account:boardly-oauth',
          options: {
            nested: [{ name: 'listId', type: 'select', options: { store: 'rpc://boardly@3/getBoardFields' } }]
          }
        }
      ],
      interface: [{ name: 'cardId', type: 'text', note: 'rpc://boardly@3/resolveCard' }],
      scope: ['cards:read']
    },
    {
      name: 'watchLists',
      label: 'Watch Lists',
      parameters: [{ name: '__IMTCONN__', type: 'account:boardly-oauth' }],
      interface: [{ name: 'listId', type: 'text' }]
    },
    {
      name: 'watchChecklists',
      label: 'Watch Checklists',
      parameters: [{ name: '__IMTCONN__', type: 'account:boardly-oauth', options: { nested: {} } }],
      interface: [{ name: 'checklistId', type: 'text' }]
    }
  ],
  endpoints: [
    {
      name: 'getBoardSummary',
      label: 'Get a board summary',
      description: 'Returns the summary of a board.',
      context: '---\nname: getBoardSummary\n---\n\nSummarises a board',
      annotations: { readOnlyHint: true },
      accounts: {
        'boardly-oauth': { scope: ['boards:read'] },
        'boardly-key': { scope: ['boards:read', 'cards:read'] }
      },
      schemaVersion: 1,
      inputParameters: [{ name: 'boardId', type: 'text', required: true }],
      outputParameters: [{ name: 'summary', type: 'text' }]
    }
  ]
}

export function boardFiles(): ExtractedFile[] {
  return [
    manifestFile(boardManifest),
    jsFile('lib/app.js', compiledJs(boardModules)),
    jsFile('lib/rpc.js', compiledJs(boardRpcs, 'ExecuteRpc')),
    jsFile('lib/endpoints.js', compiledJs(boardEndpoints, 'ExecuteRpc')),
    jsFile('lib/functions.js', functionsJs(boardFunctions)),
    jsFile('assets/icon.png', 'data:image/png;base64,iVBORw0KGgo='),
    jsFile('assets/images/hero.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'),
    jsFile('lib/other.js', 'module.exports = {};'),
    jsFile('readme.md', '# Boardly')
  ]
}

export const boardAccountManifest = {
  name: 'boardly-oauth',
  label: 'Boardly OAuth',
  type: 'oauth',
  parameters: [
    { name: 'clientId', type: 'text', label: 'Client ID', required: true },
    { name: 'clientSecret', type: 'password', label: 'Client Secret', required: true }
  ],
  scope: ['boards:read', 'cards:read'],
  scopes: { 'boards:read': 'Read boards', 'cards:read': 'Read cards' }
}

export const boardAccountApi: Api = {
  authorize: { url: 'https://boardly.test/oauth/authorize', qs: { client_id: '{{parameters.clientId}}' } },
  token: { url: 'https://boardly.test/oauth/token', method: 'POST' },
  info: {
    url: 'https://api.boardly.test/1/me',
    response: { uid: '{{body.id}}', metadata: { value: '{{body.name}}' } }
  },
  scopeSeparator: ' '
}

export function boardAccountFiles(): ExtractedFile[] {
  return [
    manifestFile(boardAccountManifest),
    jsFile('lib/account.js', singleClassJs(boardAccountApi, 'Account')),
    jsFile('lib/functions.js', 'module.exports = {};')
  ]
}

export const boardHookManifest = {
  name: 'boardly-board-hook',
  label: 'Boardly board hook',
  type: 'web',
  parameters: [
    {
      name: '__IMTCONN__',
      type: 'account:boardly-oauth',
      options: {
        nested: [{ name: 'boardId', type: 'select', options: { store: 'rpc://boardly@3/listBoards' } }],
        scope: ['webhooks:write']
      }
    }
  ]
}

export const boardHookApi: Api = {
  url: '/webhooks/incoming',
  method: 'POST',
  log: { sanitize: ['request.headers.signature'] }
}

export function boardHookFiles(): ExtractedFile[] {
  return [manifestFile(boardHookManifest), jsFile('lib/hook.js', singleClassJs(boardHookApi, 'Base'))]
}

// ---- Golden app 3: tiny, the smallest app the decompiler accepts ----

export function tinyFiles(): ExtractedFile[] {
  return [
    manifestFile({ name: 'tiny', label: 'Tiny', actions: [{ name: 'ping', label: 'Ping' }] }),
    jsFile('lib/app.js', compiledJs({ ping: { url: '/ping', method: 'GET' } }))
  ]
}
