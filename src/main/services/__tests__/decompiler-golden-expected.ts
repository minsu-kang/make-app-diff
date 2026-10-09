import type { ExtractedFile } from '../../types'

// Expected output of the decompiler for the golden apps of decompiler-golden-fixtures.ts, content strings exact.

export const CRM_EXPECTED: ExtractedFile[] = [
  {
    path: '.sdk',
    content: `{
    "version": 2
}`
  },
  {
    path: 'base.imljson',
    content: `{
    "baseUrl": "https://api.acme.test/v2",
    "timeout": 30000,
    "headers": {
        "Authorization": "Bearer {{connection.accessToken}}",
        "Accept": "application/json"
    },
    "qs": {
        "apiVersion": "2024-01"
    },
    "log": {
        "sanitize": [
            "request.headers.authorization"
        ]
    },
    "response": {
        "error": {
            "401": {
                "type": "AuthenticationError",
                "message": "{{body.error.message}}"
            },
            "429": {
                "type": "RateLimitError",
                "message": "Rate limit exceeded"
            },
            "default": {
                "message": "{{body.message}}"
            }
        },
        "valid": "{{statusCode < 400}}",
        "temp": {
            "errorMessages": {
                "190": "Invalid OAuth token"
            }
        }
    },
    "temp": {
        "pageSize": 50
    }
}`
  },
  {
    path: 'groups.imljson',
    content: `[
    {
        "name": "contacts",
        "label": "Contacts"
    },
    {
        "name": "companies",
        "label": "Companies"
    }
]`
  },
  {
    path: 'metadata.json',
    content: `{
    "name": "acme-crm",
    "label": "Acme CRM",
    "description": "Manage contacts and companies in Acme CRM",
    "theme": "#2E7D32",
    "version": 2
}`
  },
  {
    path: 'modules/createCompany/api.imljson',
    content: `{
    "url": "/companies",
    "method": "POST",
    "headers": {
        "Content-Type": "application/json"
    },
    "response": {
        "output": "{{body.company}}"
    },
    "body": {
        "name": "{{parameters.name}}"
    }
}`
  },
  {
    path: 'modules/createCompany/expect.imljson',
    content: '[]'
  },
  {
    path: 'modules/createCompany/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/createCompany/metadata.json',
    content: `{
    "name": "createCompany",
    "label": "Create a Company",
    "description": "Create a Company in Acme CRM",
    "connection": "acme-crm-oauth",
    "webhook": null,
    "type": "action"
}`
  },
  {
    path: 'modules/createCompany/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/createCompany/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/createCompany/scope.imljson',
    content: `[
    "companies.write"
]`
  },
  {
    path: 'modules/createContact/api.imljson',
    content: `{
    "url": "/contacts",
    "method": "POST",
    "headers": {
        "Content-Type": "application/json"
    },
    "response": {
        "error": {
            "409": {
                "type": "ConflictError",
                "message": "Contact exists"
            }
        },
        "output": "{{body.contact}}"
    },
    "body": {
        "email": "{{parameters.email}}",
        "pipelineId": "{{parameters.pipelineId}}"
    },
    "temp": {
        "contactDefaults": {
            "source": "api"
        }
    }
}`
  },
  {
    path: 'modules/createContact/expect.imljson',
    content: `[
    {
        "name": "email",
        "type": "email",
        "label": "Email",
        "required": true
    },
    {
        "name": "pipelineId",
        "type": "select",
        "label": "Pipeline",
        "options": {
            "store": "rpc://listPipelines"
        }
    }
]`
  },
  {
    path: 'modules/createContact/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/createContact/metadata.json',
    content: `{
    "name": "createContact",
    "label": "Create a Contact",
    "description": "Create a Contact in Acme CRM",
    "connection": "acme-crm-oauth",
    "webhook": null,
    "type": "action"
}`
  },
  {
    path: 'modules/createContact/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/createContact/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/createContact/scope.imljson',
    content: `[
    "contacts.write"
]`
  },
  {
    path: 'modules/deleteContact/api.imljson',
    content: `{
    "url": "/contacts/{{parameters.id}}",
    "method": "DELETE",
    "headers": {
        "Accept": "application/problem+json"
    },
    "response": {
        "error": {
            "429": {
                "type": "RateLimitError",
                "message": "Slow down"
            }
        },
        "output": "{{body}}"
    }
}`
  },
  {
    path: 'modules/deleteContact/expect.imljson',
    content: `[
    {
        "name": "id",
        "type": "uinteger",
        "required": true
    }
]`
  },
  {
    path: 'modules/deleteContact/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/deleteContact/metadata.json',
    content: `{
    "name": "deleteContact",
    "label": "Delete a Contact",
    "description": "Delete a Contact in Acme CRM",
    "connection": "acme-crm-oauth",
    "webhook": null,
    "type": "action"
}`
  },
  {
    path: 'modules/deleteContact/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/deleteContact/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/deleteContact/scope.imljson',
    content: `[
    "contacts.write"
]`
  },
  {
    path: 'modules/getCompany/api.imljson',
    content: `{
    "url": "/companies/{{parameters.id}}",
    "method": "GET",
    "response": {
        "output": "{{body.company}}"
    }
}`
  },
  {
    path: 'modules/getCompany/expect.imljson',
    content: '[]'
  },
  {
    path: 'modules/getCompany/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/getCompany/metadata.json',
    content: `{
    "name": "getCompany",
    "label": "Get a Company",
    "description": "Get a Company in Acme CRM",
    "connection": "acme-crm-oauth",
    "webhook": null,
    "type": "action"
}`
  },
  {
    path: 'modules/getCompany/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/getCompany/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/getCompany/scope.imljson',
    content: '[]'
  },
  {
    path: 'modules/getContact/api.imljson',
    content: `{
    "url": "/contacts/{{parameters.id}}",
    "method": "GET",
    "qs": {
        "apiVersion": "2023-06"
    },
    "response": {
        "valid": {
            "condition": "{{statusCode == 200}}"
        },
        "output": "{{body.contact}}"
    }
}`
  },
  {
    path: 'modules/getContact/expect.imljson',
    content: '[]'
  },
  {
    path: 'modules/getContact/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/getContact/metadata.json',
    content: `{
    "name": "getContact",
    "label": "Get a Contact",
    "description": "Get a Contact in Acme CRM",
    "connection": "acme-crm-oauth",
    "webhook": null,
    "type": "action"
}`
  },
  {
    path: 'modules/getContact/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/getContact/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/getContact/scope.imljson',
    content: '[]'
  },
  {
    path: 'modules/searchCompanies/api.imljson',
    content: `{
    "url": "/companies/search",
    "method": "GET",
    "baseUrl": "https://search.acme.test/v2",
    "response": {
        "temp": {
            "iterate": "{{body.items}}"
        },
        "output": "{{item}}"
    },
    "pagination": {
        "condition": "{{body.hasMore}}",
        "qs": {
            "cursor": "{{body.next}}"
        }
    }
}`
  },
  {
    path: 'modules/searchCompanies/expect.imljson',
    content: '[]'
  },
  {
    path: 'modules/searchCompanies/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/searchCompanies/metadata.json',
    content: `{
    "name": "searchCompanies",
    "label": "Search Companies",
    "description": "Search Companies in Acme CRM",
    "connection": "acme-crm-oauth",
    "webhook": null,
    "type": "search"
}`
  },
  {
    path: 'modules/searchCompanies/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/searchCompanies/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/searchCompanies/scope.imljson',
    content: '[]'
  },
  {
    path: 'modules/searchContacts/api.imljson',
    content: `{
    "url": "/contacts/search",
    "method": "GET",
    "qs": {
        "q": "{{parameters.query}}",
        "limit": "{{parameters.limit}}"
    },
    "response": {
        "temp": {
            "iterate": "{{body.items}}"
        },
        "output": "{{item}}"
    },
    "pagination": {
        "condition": "{{body.hasMore}}",
        "qs": {
            "cursor": "{{body.next}}"
        }
    },
    "temp": {
        "cursorKey": "next"
    }
}`
  },
  {
    path: 'modules/searchContacts/expect.imljson',
    content: `[
    {
        "name": "query",
        "type": "text",
        "label": "Query"
    }
]`
  },
  {
    path: 'modules/searchContacts/interface.imljson',
    content: `[
    {
        "name": "email",
        "type": "email",
        "label": "Email"
    }
]`
  },
  {
    path: 'modules/searchContacts/metadata.json',
    content: `{
    "name": "searchContacts",
    "label": "Search Contacts",
    "description": "Search Contacts in Acme CRM",
    "connection": "acme-crm-oauth",
    "webhook": null,
    "type": "search"
}`
  },
  {
    path: 'modules/searchContacts/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/searchContacts/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/searchContacts/scope.imljson',
    content: '[]'
  },
  {
    path: 'modules/updateContact/api.imljson',
    content: `{
    "url": "/contacts/{{parameters.id}}",
    "method": "PATCH",
    "headers": {
        "Content-Type": "application/json"
    },
    "response": {
        "output": "{{body.contact}}"
    },
    "body": {
        "email": "{{parameters.email}}"
    }
}`
  },
  {
    path: 'modules/updateContact/expect.imljson',
    content: '[]'
  },
  {
    path: 'modules/updateContact/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/updateContact/metadata.json',
    content: `{
    "name": "updateContact",
    "label": "Update a Contact",
    "description": "Update a Contact in Acme CRM",
    "connection": "acme-crm-oauth",
    "webhook": null,
    "type": "action"
}`
  },
  {
    path: 'modules/updateContact/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/updateContact/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/updateContact/scope.imljson',
    content: `[
    "contacts.write"
]`
  },
  {
    path: 'modules/watchCompanies/api.imljson',
    content: `{
    "url": "/companies",
    "method": "GET",
    "timeout": 45000,
    "response": {
        "temp": {
            "iterate": "{{body.items}}"
        },
        "output": "{{item}}"
    }
}`
  },
  {
    path: 'modules/watchCompanies/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/watchCompanies/metadata.json',
    content: `{
    "name": "watchCompanies",
    "label": "Watch Companies",
    "description": "Watch Companies in Acme CRM",
    "connection": "acme-crm-oauth",
    "webhook": null,
    "type": "trigger"
}`
  },
  {
    path: 'modules/watchCompanies/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/watchCompanies/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/watchCompanies/scope.imljson',
    content: '[]'
  },
  {
    path: 'modules/watchContacts/api.imljson',
    content: `[
    {
        "url": "/contacts",
        "method": "GET",
        "qs": {
            "sort": "updatedAt"
        },
        "response": {
            "temp": {
                "iterate": "{{body.items}}"
            },
            "output": "{{item}}"
        }
    },
    {
        "url": "/contacts/{{item.id}}",
        "method": "GET",
        "headers": {
            "X-Expand": "owner"
        },
        "response": {
            "output": "{{body}}"
        }
    }
]`
  },
  {
    path: 'modules/watchContacts/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/watchContacts/metadata.json',
    content: `{
    "name": "watchContacts",
    "label": "Watch Contacts",
    "description": "Watch Contacts in Acme CRM",
    "connection": "acme-crm-oauth",
    "webhook": null,
    "type": "trigger"
}`
  },
  {
    path: 'modules/watchContacts/parameters.imljson',
    content: `[
    {
        "name": "limit",
        "type": "uinteger",
        "default": 10
    },
    {
        "name": "ownerId",
        "type": "select",
        "options": {
            "store": "rpc://listOwners"
        }
    }
]`
  },
  {
    path: 'modules/watchContacts/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/watchContacts/scope.imljson',
    content: '[]'
  }
]

export const BOARD_EXPECTED: ExtractedFile[] = [
  {
    path: '.sdk',
    content: `{
    "version": 2
}`
  },
  {
    path: 'assets/icon.png',
    content: 'data:image/png;base64,iVBORw0KGgo='
  },
  {
    path: 'assets/images/hero.svg',
    content: '<svg xmlns="http://www.w3.org/2000/svg"/>'
  },
  {
    path: 'base.imljson',
    content: `{
    "baseUrl": "https://api.boardly.test/1",
    "headers": {
        "Authorization": "Bearer {{connection.accessToken}}"
    },
    "response": {
        "error": {
            "default": {
                "message": "{{body.message}}"
            }
        }
    }
}`
  },
  {
    path: 'endpoints/getBoardSummary/api.imljson',
    content: `{
    "url": "/boards/{{inputParameters.boardId}}/summary",
    "method": "GET",
    "response": {
        "output": "{{body.summary}}"
    }
}`
  },
  {
    path: 'endpoints/getBoardSummary/context.md',
    content: `---
name: getBoardSummary
---

Summarises a board`
  },
  {
    path: 'endpoints/getBoardSummary/inputParameters.imljson',
    content: `[
    {
        "name": "boardId",
        "type": "text",
        "required": true
    }
]`
  },
  {
    path: 'endpoints/getBoardSummary/metadata.json',
    content: `{
    "name": "getBoardSummary",
    "label": "Get a board summary",
    "description": "Returns the summary of a board.",
    "annotations": {
        "readOnlyHint": true
    },
    "accounts": [
        "boardly-oauth",
        "boardly-key"
    ],
    "schemaVersion": 1
}`
  },
  {
    path: 'endpoints/getBoardSummary/outputParameters.imljson',
    content: `[
    {
        "name": "summary",
        "type": "text"
    }
]`
  },
  {
    path: 'endpoints/getBoardSummary/scope.imljson',
    content: `[
    "boards:read",
    "cards:read"
]`
  },
  {
    path: 'functions/buildFilter/code.js',
    content: 'function buildFilter(parts) { return parts.filter(Boolean).join(" AND "); }'
  },
  {
    path: 'functions/formatDate/code.js',
    content: `function formatDate(date) {
  return new Date(date).toISOString();
}`
  },
  {
    path: 'metadata.json',
    content: `{
    "name": "boardly",
    "label": "Boardly",
    "description": "Boards, lists and cards",
    "theme": "#6D4AFF",
    "version": 2
}`
  },
  {
    path: 'modules/archiveCard/api.imljson',
    content: `{
    "url": "/cards/{{parameters.cardId}}/archive",
    "method": "POST"
}`
  },
  {
    path: 'modules/archiveCard/expect.imljson',
    content: `[
    {
        "name": "cardId",
        "type": "text"
    }
]`
  },
  {
    path: 'modules/archiveCard/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/archiveCard/metadata.json',
    content: `{
    "name": "archiveCard",
    "label": "Archive a Card",
    "connection": "boardly-oauth",
    "webhook": null,
    "type": "action"
}`
  },
  {
    path: 'modules/archiveCard/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/archiveCard/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/archiveCard/scope.imljson',
    content: '[]'
  },
  {
    path: 'modules/getBoard/api.imljson',
    content: `{
    "url": "/boards/{{parameters.boardId}}",
    "method": "GET",
    "response": {
        "output": "{{body}}"
    }
}`
  },
  {
    path: 'modules/getBoard/expect.imljson',
    content: `[
    {
        "name": "boardId",
        "type": "select",
        "options": {
            "store": "rpc://listBoards"
        }
    }
]`
  },
  {
    path: 'modules/getBoard/interface.imljson',
    content: `[
    {
        "name": "name",
        "type": "text"
    }
]`
  },
  {
    path: 'modules/getBoard/metadata.json',
    content: `{
    "name": "getBoard",
    "label": "Get a Board",
    "connection": "boardly-oauth",
    "webhook": null,
    "type": "action"
}`
  },
  {
    path: 'modules/getBoard/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/getBoard/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/getBoard/scope.imljson',
    content: `[
    "boards:read"
]`
  },
  {
    path: 'modules/ghostModule/epoch.imljson',
    content: `{
    "url": "/ghost",
    "method": "GET"
}`
  },
  {
    path: 'modules/moveCard/api.imljson',
    content: `{
    "url": "/cards/{{parameters.cardId}}",
    "method": "PUT",
    "body": {
        "listId": "{{parameters.listId}}"
    }
}`
  },
  {
    path: 'modules/moveCard/expect.imljson',
    content: `[
    {
        "name": "cardId",
        "type": "text"
    }
]`
  },
  {
    path: 'modules/moveCard/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/moveCard/metadata.json',
    content: `{
    "name": "moveCard",
    "label": "Move a Card",
    "connection": "boardly-oauth",
    "webhook": null,
    "type": "action"
}`
  },
  {
    path: 'modules/moveCard/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/moveCard/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/moveCard/scope.imljson',
    content: `[
    "cards:write"
]`
  },
  {
    path: 'modules/orphanModule/attach.imljson',
    content: `{
    "url": "/orphans",
    "method": "POST"
}`
  },
  {
    path: 'modules/searchCards/api.imljson',
    content: `{
    "url": "/search",
    "method": "GET",
    "response": {
        "iterate": "{{body.cards}}",
        "output": "{{item}}"
    },
    "qs": {
        "query": "{{parameters.query}}"
    }
}`
  },
  {
    path: 'modules/searchCards/expect.imljson',
    content: `[
    {
        "name": "query",
        "type": "text"
    }
]`
  },
  {
    path: 'modules/searchCards/interface.imljson',
    content: `[
    {
        "name": "id",
        "type": "text"
    }
]`
  },
  {
    path: 'modules/searchCards/metadata.json',
    content: `{
    "name": "searchCards",
    "label": "Search Cards",
    "connection": "boardly-oauth",
    "webhook": null,
    "type": "search"
}`
  },
  {
    path: 'modules/searchCards/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/searchCards/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/searchCards/scope.imljson',
    content: '[]'
  },
  {
    path: 'modules/watchBoardComments/api.imljson',
    content: `{
    "url": "/boards/{{parameters.boardId}}/comments",
    "method": "GET"
}`
  },
  {
    path: 'modules/watchBoardComments/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/watchBoardComments/metadata.json',
    content: `{
    "name": "watchBoardComments",
    "label": "Watch Board Comments",
    "connection": null,
    "webhook": "boardly-board-hook",
    "type": "instant_trigger"
}`
  },
  {
    path: 'modules/watchBoardComments/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/watchBoardComments/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/watchBoardItems/api.imljson',
    content: `{
    "url": "/boards/{{parameters.boardId}}/items",
    "method": "GET",
    "response": {
        "output": "{{body}}"
    }
}`
  },
  {
    path: 'modules/watchBoardItems/epoch.imljson',
    content: `{
    "response": {
        "iterate": "{{body.items}}"
    },
    "qs": {
        "limit": 1
    }
}`
  },
  {
    path: 'modules/watchBoardItems/interface.imljson',
    content: `[
    {
        "name": "itemId",
        "type": "text"
    }
]`
  },
  {
    path: 'modules/watchBoardItems/metadata.json',
    content: `{
    "name": "watchBoardItems",
    "label": "Watch Board Items",
    "connection": null,
    "webhook": "boardly-board-hook",
    "type": "instant_trigger"
}`
  },
  {
    path: 'modules/watchBoardItems/parameters.imljson',
    content: `[
    {
        "name": "boardId",
        "type": "select",
        "options": {
            "store": "rpc://boardly@3/listBoards"
        }
    }
]`
  },
  {
    path: 'modules/watchBoardItems/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/watchCards/api.imljson',
    content: `[
    {
        "url": "/lists/{{parameters.listId}}/cards",
        "method": "GET",
        "qs": {
            "since": "{{formatDate(now)}}"
        }
    },
    {
        "url": "/cards/{{item.id}}",
        "method": "GET"
    }
]`
  },
  {
    path: 'modules/watchCards/epoch.imljson',
    content: `[
    {
        "qs": {
            "limit": 1
        }
    },
    {
        "qs": {
            "expand": "true"
        }
    }
]`
  },
  {
    path: 'modules/watchCards/interface.imljson',
    content: `[
    {
        "name": "cardId",
        "type": "text",
        "note": "rpc://resolveCard"
    }
]`
  },
  {
    path: 'modules/watchCards/metadata.json',
    content: `{
    "name": "watchCards",
    "label": "Watch Cards",
    "connection": "boardly-oauth",
    "webhook": null,
    "type": "trigger"
}`
  },
  {
    path: 'modules/watchCards/parameters.imljson',
    content: `[
    {
        "name": "listId",
        "type": "select",
        "options": {
            "store": "rpc://getBoardFields"
        }
    }
]`
  },
  {
    path: 'modules/watchCards/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/watchCards/scope.imljson',
    content: `[
    "cards:read"
]`
  },
  {
    path: 'modules/watchChecklists/api.imljson',
    content: `[
    {
        "url": "/checklists",
        "method": "GET"
    },
    {
        "url": "/checklists",
        "method": "GET"
    }
]`
  },
  {
    path: 'modules/watchChecklists/epoch.imljson',
    content: `{
    "qs": {
        "limit": 1
    }
}`
  },
  {
    path: 'modules/watchChecklists/interface.imljson',
    content: `[
    {
        "name": "checklistId",
        "type": "text"
    }
]`
  },
  {
    path: 'modules/watchChecklists/metadata.json',
    content: `{
    "name": "watchChecklists",
    "label": "Watch Checklists",
    "connection": "boardly-oauth",
    "webhook": null,
    "type": "trigger"
}`
  },
  {
    path: 'modules/watchChecklists/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/watchChecklists/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/watchChecklists/scope.imljson',
    content: '[]'
  },
  {
    path: 'modules/watchLists/api.imljson',
    content: `{
    "url": "/boards/{{parameters.boardId}}/lists",
    "method": "GET",
    "qs": {
        "filter": "open"
    }
}`
  },
  {
    path: 'modules/watchLists/epoch.imljson',
    content: `{
    "qs": {
        "limit": 1
    }
}`
  },
  {
    path: 'modules/watchLists/interface.imljson',
    content: `[
    {
        "name": "listId",
        "type": "text"
    }
]`
  },
  {
    path: 'modules/watchLists/metadata.json',
    content: `{
    "name": "watchLists",
    "label": "Watch Lists",
    "connection": "boardly-oauth",
    "webhook": null,
    "type": "trigger"
}`
  },
  {
    path: 'modules/watchLists/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/watchLists/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/watchLists/scope.imljson',
    content: '[]'
  },
  {
    path: 'rpcs/getBoardFields/api.imljson',
    content: `{
    "url": "/boards/{{parameters.boardId}}/fields",
    "method": "GET"
}`
  },
  {
    path: 'rpcs/getBoardFields/metadata.json',
    content: `{
    "name": "getBoardFields",
    "label": "Get Board Fields",
    "connection": null
}`
  },
  {
    path: 'rpcs/getBoardFields/parameters.imljson',
    content: '[]'
  },
  {
    path: 'rpcs/listBoards/api.imljson',
    content: `{
    "url": "/boards",
    "method": "GET",
    "response": {
        "iterate": "{{body}}",
        "output": {
            "label": "{{item.name}}",
            "value": "{{item.id}}"
        }
    }
}`
  },
  {
    path: 'rpcs/listBoards/metadata.json',
    content: `{
    "name": "listBoards",
    "label": "List Boards",
    "connection": null
}`
  },
  {
    path: 'rpcs/listBoards/parameters.imljson',
    content: '[]'
  },
  {
    path: 'webhooks/boardly-board-hook/attach.imljson',
    content: `{
    "url": "/webhooks",
    "method": "POST",
    "body": {
        "callbackUrl": "{{webhook.url}}",
        "model": "rpc://resolveModel"
    }
}`
  },
  {
    path: 'webhooks/boardly-board-hook/detach.imljson',
    content: `{
    "url": "/webhooks/{{webhook.id}}",
    "method": "DELETE"
}`
  },
  {
    path: 'webhooks/boardly-board-hook/update.imljson',
    content: `{
    "url": "/webhooks/{{webhook.id}}",
    "method": "PUT",
    "body": {
        "active": true
    }
}`
  }
]

export const TINY_EXPECTED: ExtractedFile[] = [
  {
    path: '.sdk',
    content: `{
    "version": 2
}`
  },
  {
    path: 'metadata.json',
    content: `{
    "name": "tiny",
    "label": "Tiny",
    "version": 2
}`
  },
  {
    path: 'modules/ping/api.imljson',
    content: `{
    "url": "/ping",
    "method": "GET"
}`
  },
  {
    path: 'modules/ping/expect.imljson',
    content: '[]'
  },
  {
    path: 'modules/ping/interface.imljson',
    content: '[]'
  },
  {
    path: 'modules/ping/metadata.json',
    content: `{
    "name": "ping",
    "label": "Ping",
    "connection": null,
    "webhook": null,
    "type": "action"
}`
  },
  {
    path: 'modules/ping/parameters.imljson',
    content: '[]'
  },
  {
    path: 'modules/ping/samples.imljson',
    content: '{}'
  },
  {
    path: 'modules/ping/scope.imljson',
    content: '[]'
  }
]

export const BOARD_ACCOUNT_EXPECTED: ExtractedFile[] = [
  {
    path: 'metadata.json',
    content: `{
    "name": "boardly-oauth",
    "label": "Boardly OAuth",
    "type": "oauth"
}`
  },
  {
    path: 'parameters.imljson',
    content: `[
    {
        "name": "clientId",
        "type": "text",
        "label": "Client ID",
        "required": true
    },
    {
        "name": "clientSecret",
        "type": "password",
        "label": "Client Secret",
        "required": true
    }
]`
  },
  {
    path: 'scope.imljson',
    content: `[
    "boards:read",
    "cards:read"
]`
  },
  {
    path: 'scopes.imljson',
    content: `{
    "boards:read": "Read boards",
    "cards:read": "Read cards"
}`
  },
  {
    path: 'api.imljson',
    content: `{
    "authorize": {
        "url": "https://boardly.test/oauth/authorize",
        "qs": {
            "client_id": "{{parameters.clientId}}"
        }
    },
    "token": {
        "url": "https://boardly.test/oauth/token",
        "method": "POST"
    },
    "info": {
        "url": "https://api.boardly.test/1/me",
        "response": {
            "uid": "{{body.id}}",
            "metadata": {
                "value": "{{body.name}}"
            }
        }
    },
    "scopeSeparator": " "
}`
  }
]

export const BOARD_HOOK_EXPECTED: ExtractedFile[] = [
  {
    path: 'metadata.json',
    content: `{
    "name": "boardly-board-hook",
    "label": "Boardly board hook",
    "connection": "boardly-oauth",
    "type": "web"
}`
  },
  {
    path: 'parameters.imljson',
    content: `[
    {
        "name": "boardId",
        "type": "select",
        "options": {
            "store": "rpc://boardly@3/listBoards"
        }
    }
]`
  },
  {
    path: 'scope.imljson',
    content: `[
    "webhooks:write"
]`
  },
  {
    path: 'api.imljson',
    content: `{
    "url": "/webhooks/incoming",
    "method": "POST",
    "log": {
        "sanitize": [
            "request.headers.signature"
        ]
    }
}`
  },
  {
    path: 'attach.imljson',
    content: '{}'
  },
  {
    path: 'detach.imljson',
    content: '{}'
  },
  {
    path: 'update.imljson',
    content: '{}'
  }
]
