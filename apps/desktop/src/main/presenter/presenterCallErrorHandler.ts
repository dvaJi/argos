interface PresenterCallErrorContext {
  webContentsId: number;
  presenterName: string;
  methodName: string;
}

const isPromiseLike = <T>(value: unknown): value is Promise<T> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Promise<T>).then === "function" &&
  typeof (value as Promise<T>).catch === "function";

const formatPresenterCallError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }

  return String(error);
};

const reportPresenterCallError = (
  error: unknown,
  { webContentsId, presenterName, methodName }: PresenterCallErrorContext,
): { error: string } => {
  console.error(`[IPC Error] WebContents:${webContentsId} ${presenterName}.${methodName}:`, error);

  return { error: formatPresenterCallError(error) };
};

export const handlePresenterCallError = (error: unknown, context: PresenterCallErrorContext): { error: string } =>
  reportPresenterCallError(error, context);

export const releasePresenterCallErrorStateForWebContents = (_webContentsId: number): void => {
  // No-op: the desktop no longer tracks per-webcontents database repair state.
};

export const handlePresenterCallResult = <T>(
  result: T | Promise<T>,
  context: PresenterCallErrorContext,
): T | Promise<T> => {
  if (!isPromiseLike<T>(result)) {
    return result;
  }

  return result.catch((error) => {
    reportPresenterCallError(error, context);
    throw error;
  });
};

export const resetPresenterCallErrorStateForTests = (): void => {};
