# PAWvax API Testing Guide

## Overview

You have two ways to test:

1. Manual testing with `test.http` (VS Code REST Client)
2. Automated testing with Jest (`tests/api.test.js`)

Use manual tests for fast debugging and API flow checks.
Use Jest for regression safety before deployment.

---

## Option 1: Manual testing with test.http

### Install REST Client extension

1. Open VS Code
2. Open Extensions
3. Search for `REST Client`
4. Install `REST Client` by Huachao Mao

### Open and run

```bash
cd server
code test.http
```

Run requests with:
- `Send Request` above each request
- or `Ctrl+Alt+R`

### Important: variable handling in this file

This project uses response-based chaining (not manual token copy):

```http
# @name Login
POST {{apiHost}}/auth/login
...

GET {{apiHost}}/accounts/me
Authorization: Bearer {{Login.response.body.token}}
```

The current `test.http` flow already chains IDs and tokens, for example:
- `{{Login.response.body.token}}`
- `{{CreateAnimal.response.body.id}}`
- `{{UploadDocument.response.body.id}}`
- `{{CreateSharingLink.response.body.share_id}}`

---

## Visibility model to test (important)

The sharing model changed:

1. Role `readonly` was renamed to `guest`.
2. Document visibility is now controlled only per document via `allowed_roles`.
3. Global document toggles in sharing settings are no longer the source of truth.
4. If a document should be public, it must include `guest` in `allowed_roles`.

### Practical checks

1. Upload/scan a document with role `guest` selected.
2. Call public endpoint (`/api/public/tag/:tagId` or `/api/public/share/:shareId`).
3. Confirm document is visible.
4. Remove `guest` in document detail (or PATCH document).
5. Confirm document is no longer visible publicly.

---

## Option 2: Automated tests with Jest

### Install dependencies

```bash
cd server
npm install
```

### Run tests

Run all tests:

```bash
npm test
```

This command now starts a dedicated local API server automatically with:
- a temporary isolated SQLite database
- a separate temporary uploads directory
- a free local port

That means the default test flow no longer touches your working database.

Run one suite/group:

```bash
npm test -- --testNamePattern="Authentication"
```

Run with coverage:

```bash
npm test:coverage
```

Watch mode:

```bash
npm test:watch
```

Raw Jest only (without managed local server) remains available for advanced debugging:

```bash
npm run test:jest
```

---

## Run server for local tests

For normal API test runs, no second terminal is needed:

```bash
cd server
npm test
```

If you want to debug the app manually, you can still start the server yourself:

```bash
cd server
npm run dev
```

---

## Test environment

File: `.env.test`

```env
API_URL=http://localhost:3000/api
TEST_TIMEOUT=15000
NODE_ENV=test
```

Remote or production-like API checks are blocked by default because the suite performs write/delete operations.
If you intentionally need a remote target, you must opt in explicitly:

```env
ALLOW_REMOTE_API_TESTS=1
CONFIRM_REMOTE_API_TESTS=I_UNDERSTAND_THIS_CAN_MODIFY_REAL_DATA
```

---

## Debug failing tests

Verbose output:

```bash
npm test -- --verbose
```

Run a specific test case:

```bash
npm test -- --testNamePattern="Create Animal"
```

Server logs (Hetzner):

```bash
journalctl --user-instance -u paw-api.service -f
```

---

## Recommended smoke-test order

In `test.http`, run in sequence:

1. Register
2. Login
3. Get Profile
4. Create Animal
5. Get All Animals
6. Upload Document
7. Create Sharing Link
8. Public Share/Public Tag checks

Then test visibility change:

1. Ensure uploaded document includes `guest`
2. Verify public endpoint returns document
3. Remove `guest` from document visibility
4. Verify public endpoint no longer returns that document

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ECONNREFUSED` | Start server in a second terminal |
| `401 Unauthorized` | Login again and retry flow |
| `404 Not Found` | Verify `API_URL` (`local` vs `production`) |
| Jest ESM/module issues | Use Node 18+ |
| Timeouts | Increase Jest timeout in config |

---

## Best practices

Do:
- Run manual flow after every API change
- Run Jest before deployment
- Keep logs open during debugging
- Validate guest/public document visibility explicitly

Do not:
- Test on production with real personal data
- Store secrets in test files
- Leave stale test data in shared environments
