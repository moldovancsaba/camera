export function buildE2ERunId(): string {
  const token = Math.random().toString(36).slice(2, 10);
  return `run-${Date.now().toString(36)}-${token}`;
}

function readMongoDatabaseName(): string | null {
  return process.env.MONGODB_DB?.trim() ?? null;
}

export function isDisposableE2EDatabaseName(value: string): boolean {
  const normalized = value.toLowerCase();
  const candidates = [
    'e2e',
    'test',
    'dev',
    'local',
    'sandbox',
    'staging',
  ];

  return candidates.some((candidate) => {
    const pattern = new RegExp(`(^|[-_])${candidate}([-_]|$)`, 'i');
    return pattern.test(normalized) || normalized.includes(candidate);
  });
}

export function assertDisposableE2EDatabase(operationName = 'E2E operation'): string {
  const dbName = readMongoDatabaseName();
  if (!dbName) {
    throw new Error(`${operationName} blocked: MONGODB_DB is not configured.`);
  }

  if (isDisposableE2EDatabaseName(dbName)) {
    return dbName;
  }

  throw new Error(
    `${operationName} blocked: MONGODB_DB "${dbName}" is not a disposable environment for e2e cleanup/bootstrap. Use a database containing e2e/test/dev/local/sandbox/staging.`
  );
}
