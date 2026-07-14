import type { Execution, ExecutionLog, ExecutionStep, ExecutionStore } from '../types';

export function createMemoryExecutionStore(): ExecutionStore {
  const executions = new Map<string, Execution>();
  const steps: ExecutionStep[] = [];
  const logs: ExecutionLog[] = [];

  return {
    async create(execution) {
      // No await between the check and the set, so nothing can interleave -
      // this is atomic against other concurrent calls in this process.
      const conflict = Array.from(executions.values()).some(
        (existing) => existing.eventId === execution.eventId,
      );
      if (conflict) return false;
      executions.set(execution.id, execution);
      return true;
    },
    async update(id, patch) {
      const existing = executions.get(id);
      if (!existing) return;
      executions.set(id, { ...existing, ...patch });
    },
    async list() {
      return Array.from(executions.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async get(id) {
      return executions.get(id);
    },
    async findByEventId(eventId) {
      return Array.from(executions.values()).find((execution) => execution.eventId === eventId);
    },
    async getStep(executionId, name) {
      const matches = steps.filter(
        (step) => step.executionId === executionId && step.name === name,
      );
      return matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    },
    async saveStep(step) {
      steps.push(step);
    },
    async listSteps(executionId) {
      return steps
        .filter((step) => step.executionId === executionId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async saveLog(log) {
      logs.push(log);
    },
    async listLogs(executionId) {
      return logs.filter((log) => log.executionId === executionId);
    },
  };
}
