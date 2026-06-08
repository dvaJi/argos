import { useMemo } from 'react'

interface SearchDefaults {
  forced?: boolean
  strategy?: 'turbo' | 'max'
}

interface UseSearchConfigOptions {
  supportsSearch: boolean | null
  searchDefaults: SearchDefaults | null
}

export function useSearchConfig(options: UseSearchConfigOptions) {
  const showSearchConfig = useMemo(() => options.supportsSearch === true, [options.supportsSearch])

  const hasForcedSearchOption = useMemo(
    () => showSearchConfig && typeof options.searchDefaults?.forced === 'boolean',
    [showSearchConfig, options.searchDefaults]
  )

  const hasSearchStrategyOption = useMemo(
    () => showSearchConfig && typeof options.searchDefaults?.strategy === 'string',
    [showSearchConfig, options.searchDefaults]
  )

  return {
    showSearchConfig,
    hasForcedSearchOption,
    hasSearchStrategyOption
  }
}
