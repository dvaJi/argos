import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface UseIpcMutationOptions<TArgs extends unknown[], TResult> {
  mutation: (...args: TArgs) => Promise<TResult> | TResult;
  invalidateQueries?: (result: Awaited<TResult> | undefined, variables: TArgs) => unknown[][];
  onSuccess?: (result: Awaited<TResult> | undefined, variables: TArgs) => void | Promise<void>;
  onError?: (error: Error, variables: TArgs) => void | Promise<void>;
  onSettled?: (result: Awaited<TResult> | undefined, error: Error | null, variables: TArgs) => void | Promise<void>;
}

export function useIpcMutation<TArgs extends unknown[], TResult>(options: UseIpcMutationOptions<TArgs, TResult>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: TArgs) => {
      return await options.mutation(...vars);
    },
    async onSettled(result, error, variables) {
      if (options.onSettled) {
        await options.onSettled(result as Awaited<TResult> | undefined, error || null, variables);
      }
    },
    async onSuccess(result, variables) {
      const resolvedResult = result as Awaited<TResult> | undefined;

      if (options.invalidateQueries) {
        const keys = options.invalidateQueries(resolvedResult, variables);
        for (const key of keys) {
          await queryClient.invalidateQueries({ queryKey: key, exact: false });
        }
      }

      if (options.onSuccess) {
        await options.onSuccess(resolvedResult, variables);
      }
    },
    async onError(error, variables) {
      if (options.onError) {
        await options.onError(error, variables);
      }
    },
  });
}
