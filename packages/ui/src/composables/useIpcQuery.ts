import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

export interface UseIpcQueryOptions<TResult> extends Pick<
  UseQueryOptions<Awaited<TResult>>,
  "enabled" | "staleTime" | "gcTime"
> {
  key: unknown[];
  query: () => Promise<TResult> | TResult;
}

export function useIpcQuery<TResult>(options: UseIpcQueryOptions<TResult>) {
  return useQuery({
    queryKey: options.key,
    queryFn: () => options.query() as Promise<Awaited<TResult>>,
    enabled: options.enabled,
    staleTime: options.staleTime,
    gcTime: options.gcTime,
  });
}
