import { randomUUID } from "node:crypto";
import { resolveDeploymentEnvironment } from "@/lib/deployment-environment";
import { redactSensitiveText } from "@/lib/safe-error-text.mjs";

export { redactSensitiveText };

type ServerOperationContext = {
  route: string;
  operation: string;
};

type ErrorWithMetadata = Error & {
  code?: string;
  digest?: string;
};

export class ServerOperationFailure extends Error {
  readonly incidentId: string;

  constructor(incidentId: string, cause: unknown) {
    super(`A server operation failed. Incident ${incidentId}.`, { cause });
    this.name = "ServerOperationFailure";
    this.incidentId = incidentId;
  }
}

export function logServerFailure(context: ServerOperationContext, error: unknown): string {
  const candidate = error instanceof Error ? error as ErrorWithMetadata : null;
  const incidentId = candidate?.digest?.trim() || randomUUID();
  console.error(JSON.stringify({
    event: "coursetrack_server_failure",
    route: context.route,
    operation: context.operation,
    environment: resolveDeploymentEnvironment(),
    incidentId,
    errorName: candidate?.name ?? "UnknownError",
    errorCode: candidate?.code ?? null,
    errorMessage: redactSensitiveText(candidate?.message ?? "Unknown server error"),
  }));
  return incidentId;
}

export async function withServerOperation<T>(
  context: ServerOperationContext,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const incidentId = logServerFailure(context, error);
    throw new ServerOperationFailure(incidentId, error);
  }
}
