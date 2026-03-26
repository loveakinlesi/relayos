import { vi } from "vitest";

// Create mocks in hoisted context
export const mocks = vi.hoisted(() => ({
  createPool: vi.fn(),
  createRetryPoller: vi.fn(),
  createEngine: vi.fn(),
  runExecution: vi.fn(),
  findExecutionById: vi.fn(),
  findStepsByExecution: vi.fn(),
  findExecutionsByStatus: vi.fn(),
  findDueRetrySchedules: vi.fn(),
  replayEvent: vi.fn(),
  resumeFailedExecution: vi.fn(),
  updateExecutionStatus: vi.fn(),
  createExecution: vi.fn(),
  findExecutionsByEventId: vi.fn(),
  createStepEvent: vi.fn(),
  getStepReceivedEvent: vi.fn(),
  createStep: vi.fn(),
  getStep: vi.fn(),
  getSteps: vi.fn(),
  createRetrySchedule: vi.fn(),
  deleteRetrySchedule: vi.fn(),
}));

// Mock all modules
vi.mock("../src/persistence/client", () => ({
  createPool: mocks.createPool,
}));

vi.mock("../src/runtime/retry-poller", () => ({
  createRetryPoller: mocks.createRetryPoller,
}));

vi.mock("../src/runtime/engine", () => ({
  createEngine: mocks.createEngine,
}));

vi.mock("../src/runtime/execute", () => ({
  runExecution: mocks.runExecution,
}));

vi.mock("../src/persistence/executions.repo", () => ({
  createExecution: mocks.createExecution,
  findExecutionById: mocks.findExecutionById,
  findExecutionsByEventId: mocks.findExecutionsByEventId,
  findExecutionsByStatus: mocks.findExecutionsByStatus,
  updateExecutionStatus: mocks.updateExecutionStatus,
}));

vi.mock("../src/persistence/steps.repo", () => ({
  createStepEvent: mocks.createStepEvent,
  getStepReceivedEvent: mocks.getStepReceivedEvent,
  createStep: mocks.createStep,
  getStep: mocks.getStep,
  getSteps: mocks.getSteps,
  findStepsByExecution: mocks.findStepsByExecution,
}));

vi.mock("../src/persistence/retry-schedules.repo", () => ({
  createRetrySchedule: mocks.createRetrySchedule,
  deleteRetrySchedule: mocks.deleteRetrySchedule,
  findDueRetrySchedules: mocks.findDueRetrySchedules,
}));

vi.mock("../src/replay/replay", () => ({
  replayEvent: mocks.replayEvent,
}));

vi.mock("../src/replay/resume", () => ({
  resumeFailedExecution: mocks.resumeFailedExecution,
}));
