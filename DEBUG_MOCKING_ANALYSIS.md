# VI.Mock Debugging Analysis - relayos/core

## CRITICAL ERROR FOUND (Confirmed by Test Execution)

**Test Output Shows Real Function Being Called:**
```
error: database "relayos" does not exist
 ❯ findExecutionsByStatus src/persistence/executions.repo.ts:119:18
 ❯ recoverRunningExecutions src/index.ts:123:25
 ❯ Object.start src/index.ts:140:7
 ❯ __tests__/index.spec.ts:145:5
```

The real `findExecutionsByStatus` SQL query is executing instead of the mock being used. This means **the vi.mock declarations are NOT intercepting the imports properly**.

---

## Root Cause Analysis

### Why This Happens

The vi.mock system in vitest works by:
1. Detecting vi.mock() declarations
2. Hoisting them before module imports
3. Intercepting module resolution for specified paths
4. Returning the mock factory function result instead of the real module

When this fails, the **real module is imported and used instead**.

---

## Findings

### ✅ CORRECT: Module Structure & Pool Instantiation

1. **Single Pool Creation Point** - Pool is ONLY instantiated in one place:
   - File: [src/persistence/client.ts](src/persistence/client.ts#L1-L8)
   - Only source of `new Pool()` calls

2. **Proper Dependency Injection** - All other modules receive pool as a parameter
   - All repo files (executions.repo.ts, steps.repo.ts, etc.) use `pool: Pool` function parameters
   - No global Pool instances or module-level Pool creation

3. **No Dynamic Imports** - Core package has no dynamic `import()` calls
   - All imports are static ES modules
   - No circular dependency risk

4. **Correct File Extensions** - All imports use `.js` extensions:
   - Test file vi.mock declarations: `"../../src/persistence/client.js"`
   - Source file imports: `from "./persistence/client.js"`

---

## Root Cause Identified

### 🔴 ISSUE #1: Vi.Mock Declarations Are Not Intercepting Imports (CONFIRMED)

**Severity: CRITICAL**

The vi.mock declarations are **correctly written and hoisted**, but they are **NOT being used by vitest**. Instead, the real modules are being imported and used.

**Evidence**:
- Test creates `mocks.findExecutionsByStatus` as a vi.fn()
- Test registers `vi.mock("../../src/persistence/executions.repo.js", ...` with the mocks
- Test calls `createRelayOS()` which calls `recoverRunningExecutions()`
- `recoverRunningExecutions()` calls `findExecutionsByStatus(pool, schema, [...])` 
- **Real SQL code executes** instead of mock returning []

**Why This Matters**: This is a vitest configuration or module resolution issue, NOT a test code issue.

### Possible Causes

#### Hypothesis A: Module Resolution Path Mismatch
When the test uses:
```typescript
vi.mock("../../src/persistence/executions.repo.js", ...)
```

And src/index.ts imports:
```typescript
import { findExecutionsByStatus } from "./persistence/executions.repo.js"
```

These paths might resolve to different canonical paths due to:
- `.js` vs `.ts` resolution
- Symlinks or path normalization
- TypeScript module resolution settings
- Vitest resolver configuration

**Check**: Log actual resolved paths to verify they're identical

#### Hypothesis B: Compiled Dist Version Is Being Used
The package.json exports point to built files:
```json
"main": "./dist/index.cjs",
"module": "./dist/index.js",
```

If vitest is somehow loading from `dist/` instead of `src/`, the vi.mock declarations won't apply because they reference `src/` paths.

**Check**: Verify vitest loads from source, not compiled output

#### Hypothesis C: Vi.Mock Factory Function Not Returning Correct Shape
The mock factory returns a plain object:
```typescript
vi.mock("../../src/persistence/executions.repo.js", () => ({
  findExecutionsByStatus: mocks.findExecutionsByStatus,
  // ...
}))
```

But module resolution might expect named exports or default exports in a specific way.

**Check**: Try using `{ default: ... }` or wrap differently

---

### 🔴 ISSUE #2: Missing Mocks for Other Repo Functions

Several repository functions are **not mocked but ARE used** in the codebase:

#### Missing from vi.mock declarations:
- `insertEvent()` - used in [src/runtime/engine.ts](src/runtime/engine.ts#L40)
- `upsertStep()` - used in [src/runtime/execute.ts](src/runtime/execute.ts)  
- `findStepByName()` - potentially used
- `getStepReceivedEvent()` - mocked but may have issues
- `createRetrySchedule()` - mocked but should verify it's in executions.repo
- All persistence functions from `execution-logs.repo.ts` - **NOT MOCKED AT ALL**

---

### 🟡 ISSUE #3: vitest.config.ts vs vitest.integration.config.ts

**Files:**
- [vitest.config.ts](vitest.config.ts) - excludes integration tests, has mocks configured
- [vitest.integration.config.ts](vitest.integration.config.ts) - includes ONLY integration tests, **NO mocks defined**

**Problem**: The integration config file is completely bare:
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.integration.spec.ts"],
  },
});
```

If a test runner misinterprets which config to use, mocks won't be applied.

---

### 🟡 ISSUE #4: Events.repo Functions Not Fully Exported/Mocked

Check [src/persistence/events.repo.ts](src/persistence/events.repo.ts) to verify:
1. Are all database-accessing functions exported?
2. Is `insertEvent()` properly exported?
3. Does insertEvent call `pool.query()`?

These functions are called from `engine.ts` and must be mocked to prevent DB hits.

---

### 🟡 ISSUE #5: Mocked Module Initialization Order

The test uses vi.hoisted() correctly, BUT verify:
1. When `src/index.ts` imports are evaluated, do they see the mocked modules?
2. Are the vi.mock declarations truly hoisted before imports?

This works correctly IF vitest processes:
```typescript
const mocks = vi.hoisted(() => ({ ... }));  // First
vi.mock("...", () => ({ ... }));             // Second  
import { createRelayOS } from "...";         // Third
```

If anything is out of order, mocks won't apply.

---

## Root Cause Hypothesis

**Most Likely**: `createExecution()` is being called but NOT mocked.

When tests call methods that trigger internal event processing (like `runtime.ingestEvent()` or `poller.start()`), the real `createExecution` function executes, which calls:

```typescript
const result = await pool.query<DbExecution>(
  `INSERT INTO ${schema}.executions ...`,
  [eventId, ExecutionStatus.Pending, attempt],
);
```

This reaches the real database because:
1. The pool might be created (if not mocked properly)
2. `createExecution` isn't being intercepted
3. No mock returns a value for this database insert

---

## Likely Fixes

### Fix #1: Try Using `.ts` Extension Instead of `.js` ✅ FIRST TRY THIS
```typescript
// Change from:
vi.mock("../../src/persistence/executions.repo.js", () => ({
// To:
vi.mock("../../src/persistence/executions.repo.ts", () => ({
```

vitest might be resolving .ts files differently. Try this for all vi.mock declarations.

### Fix #2: Ensure Mocks Are in Vi.hoisted() Block
Verify all mocks are defined in the hoisted block BEFORE being used in vi.mock():

```typescript
const mocks = vi.hoisted(() => ({
  // ALL of these must be defined here:
  findExecutionsByStatus: vi.fn(),
  findExecutionById: vi.fn(),
  // Etc... (check that ALL referenced mocks are present)
}));

// Then all vi.mock use mocks from the hoisted object
vi.mock("../../src/persistence/executions.repo.ts", () => ({ // .ts not .js
  findExecutionsByStatus: mocks.findExecutionsByStatus, // ✓ exists in hoisted
  // ...
}));
```

### Fix #3: Check Vitest Version & Module Settings
The issue might be in [vitest.config.ts](vitest.config.ts). Add these settings:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.spec.ts"],
    exclude: ["__tests__/**/*.integration.spec.ts"],
    // Force TypeScript module resolution
    testTimeout: 5000,
    // IMPORTANT: Ensure proper module mocking
    mockReset: true,  // Reset mocks between tests
    restoreMocks: true,  // Restore mocks between tests
  },
});
```

---

## Diagnostic Steps (Do This First)

### Step 1: Add Mock Verification 
Add this test to confirm mocks are working:

```typescript
it("mocks are properly applied to imports", async () => {
  // This should use the mocked pool, NOT create a real one
  const runtime = createRelayOS({
    database: {
      connectionString: "postgres://localhost:5432/relayos",
      schema: "relayos",
    },
    retry: { maxAttempts: 3, backoffBaseMs: 100, backoffMultiplier: 2, backoffMaxMs: 1000 },
    concurrency: { maxConcurrent: 1 },
    retryPollIntervalMs: 1000,
    plugins: [],
  });

  // Verify createPool was called with mock
  expect(mocks.createPool).toHaveBeenCalled();
  console.log("createPool mock called:", mocks.createPool.mock.calls);
  
  // Verify findExecutionsByStatus is the mock function
  console.log("findExecutionsByStatus is Function:", typeof findExecutionsByStatus === 'function');
  console.log("findExecutionsByStatus is mock:", findExecutionsByStatus._isMockFunction === true);
});
```

### Step 2: Enable Debug Logging
Add to [vitest.config.ts](vitest.config.ts):
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.spec.ts"],
    exclude: ["__tests__/**/*.integration.spec.ts"],
    // DEBUG: Log module resolution
    reporter: ["verbose"],
  },
});
```

### Step 3: Check Module Extensions
Verify that .ts files are being resolved correctly. The key issue might be:
- Test uses `.js` extension in vi.mock: `"../../src/persistence/executions.repo.js"`
- But vitest might resolve `.ts` files differently

Try changing ALL vi.mock declarations to use `.ts` instead of `.js`.
