import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

/**
 * Pure helper to generate condensed page number sequence with ellipsis.
 * Guarantees '...' is never shown when no pages are skipped.
 */
export function buildPageNumbers(totalPages, currentPage) {
  const safeTotal = Math.max(1, Number(totalPages) || 1)
  const safeCurrent = Math.max(1, Math.min(Number(currentPage) || 1, safeTotal))

  if (safeTotal <= 7) {
    return Array.from({ length: safeTotal }, (_, i) => i + 1)
  }

  const pageSet = new Set([1, 2, safeTotal - 1, safeTotal])

  if (safeCurrent <= 3) {
    pageSet.add(3)
    pageSet.add(4)
  } else if (safeCurrent >= safeTotal - 2) {
    pageSet.add(safeTotal - 3)
    pageSet.add(safeTotal - 2)
  } else {
    pageSet.add(safeCurrent - 1)
    pageSet.add(safeCurrent)
    pageSet.add(safeCurrent + 1)
  }

  const sorted = Array.from(pageSet)
    .filter(p => p >= 1 && p <= safeTotal)
    .sort((a, b) => a - b)

  const result = []
  for (let i = 0; i < sorted.length; i++) {
    const num = sorted[i]
    const prev = sorted[i - 1]
    if (prev !== undefined) {
      if (num - prev === 2) {
        result.push(prev + 1)
      } else if (num - prev > 2) {
        result.push('...')
      }
    }
    result.push(num)
  }
  return result
}

/**
 * Pure helper to compute pagination slice and metadata from raw state.
 */
export function computePaginationState({
  items = [],
  totalItems: externalTotalItems,
  mode = 'client',
  requestedPage = 1,
  pageSize = 20
}) {
  const totalItemsCount =
    mode === 'server' && typeof externalTotalItems === 'number'
      ? Math.max(0, externalTotalItems)
      : Array.isArray(items)
        ? items.length
        : 0

  const safePageSize = Number(pageSize) > 0 ? Number(pageSize) : 20
  const totalPages = Math.max(1, Math.ceil(totalItemsCount / safePageSize))
  const parsedRequested = parseInt(requestedPage, 10)
  const validRequested = isNaN(parsedRequested) || parsedRequested < 1 ? 1 : parsedRequested
  const currentPage = Math.min(validRequested, totalPages)

  const startItem = totalItemsCount === 0 ? 0 : (currentPage - 1) * safePageSize + 1
  const endItem = Math.min(currentPage * safePageSize, totalItemsCount)

  const paginatedItems =
    mode === 'server'
      ? (Array.isArray(items) ? items : [])
      : Array.isArray(items)
        ? items.slice((currentPage - 1) * safePageSize, currentPage * safePageSize)
        : []

  return {
    currentPage,
    pageSize: safePageSize,
    totalPages,
    totalItems: totalItemsCount,
    startItem,
    endItem,
    isFirstPage: currentPage <= 1,
    isLastPage: currentPage >= totalPages,
    paginatedItems,
    pageNumbers: buildPageNumbers(totalPages, currentPage),
    validRequested
  }
}

/**
 * Custom hook for production-ready pagination with URL sync, module-specific storage,
 * smart page reset on filter changes, keyboard shortcuts, and client/server mode support.
 */
export function usePagination({
  items = [],
  totalItems: externalTotalItems,
  moduleKey = 'default',
  initialPageSize = 20,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  mode = 'client',
  filterDependencies = [],
  containerRef = null
}) {
  const [searchParams, setSearchParams] = useSearchParams()

  // 1. Module-specific page size storage key
  const storageKey = `vf_${moduleKey}_page_size`

  const isValidPageSize = useCallback(
    (val) => Number.isInteger(val) && val > 0 && pageSizeOptions.includes(val),
    [pageSizeOptions]
  )

  // 2. Read initial page size from sessionStorage or default
  const getSavedPageSize = useCallback(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (isValidPageSize(parsed)) return parsed
      }
    } catch {
      // Fallback if sessionStorage is disabled or errors
    }
    return initialPageSize
  }, [storageKey, initialPageSize, isValidPageSize])

  const [pageSizeState, setPageSizeState] = useState(getSavedPageSize)

  // Sync pageSize from URL if present
  const pageSizeParam = searchParams.get('pageSize')
  const pageSize = useMemo(() => {
    if (pageSizeParam) {
      const parsed = parseInt(pageSizeParam, 10)
      if (isValidPageSize(parsed)) return parsed
    }
    return pageSizeState
  }, [pageSizeParam, pageSizeState, isValidPageSize])

  // 3. Read requested page from URL params (default to 1)
  const pageParam = searchParams.get('page')
  const rawPageFromUrl = pageParam ? parseInt(pageParam, 10) : 1
  const validPageFromUrl = isNaN(rawPageFromUrl) || rawPageFromUrl < 1 ? 1 : rawPageFromUrl

  // 4. Compute derived pagination slice & metadata cleanly
  const {
    currentPage,
    totalPages,
    totalItems: totalItemsCount,
    startItem,
    endItem,
    isFirstPage,
    isLastPage,
    paginatedItems,
    pageNumbers
  } = useMemo(() => computePaginationState({
    items,
    totalItems: externalTotalItems,
    mode,
    requestedPage: validPageFromUrl,
    pageSize
  }), [items, externalTotalItems, mode, validPageFromUrl, pageSize])

  // Helper to update URL search params cleanly
  const updateUrlParams = useCallback((newPage, newPageSize) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (newPage > 1) {
        next.set('page', String(newPage))
      } else {
        next.delete('page')
      }

      if (newPageSize !== initialPageSize) {
        next.set('pageSize', String(newPageSize))
      } else {
        next.delete('pageSize')
      }
      return next
    }, { replace: true })
  }, [setSearchParams, initialPageSize])

  // 5. Reset to page 1 when search/filter/sort dependencies actually change
  const prevFilterDepsRef = useRef(filterDependencies)
  useEffect(() => {
    const prev = prevFilterDepsRef.current
    const changed =
      prev.length !== filterDependencies.length ||
      filterDependencies.some((val, idx) => !Object.is(val, prev[idx]))

    prevFilterDepsRef.current = filterDependencies

    if (changed && pageParam !== null) {
      updateUrlParams(1, pageSize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...filterDependencies, pageParam, pageSize, updateUrlParams])

  // 6. Clamp stale out-of-range ?page=N in URL once dataset has loaded (e.g. after deleting last row on last page)
  useEffect(() => {
    if (totalItemsCount > 0 && validPageFromUrl > totalPages) {
      updateUrlParams(totalPages, pageSize)
    }
  }, [totalItemsCount, validPageFromUrl, totalPages, pageSize, updateUrlParams])

  // 7. Smooth Scroll to Top of Table Container on Page Change
  const scrollToTop = useCallback(() => {
    if (containerRef?.current && typeof containerRef.current.scrollTo === 'function') {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [containerRef])

  // 8. Navigation Actions
  const goToPage = useCallback((targetPage) => {
    const numeric = parseInt(targetPage, 10)
    if (isNaN(numeric)) return
    const clamped = Math.max(1, Math.min(numeric, totalPages))
    updateUrlParams(clamped, pageSize)
    scrollToTop()
  }, [totalPages, pageSize, updateUrlParams, scrollToTop])

  const nextPage = useCallback(() => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1)
    }
  }, [currentPage, totalPages, goToPage])

  const prevPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1)
    }
  }, [currentPage, goToPage])

  const firstPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(1)
    }
  }, [currentPage, goToPage])

  const lastPage = useCallback(() => {
    if (currentPage < totalPages) {
      goToPage(totalPages)
    }
  }, [currentPage, totalPages, goToPage])

  const handleSetPageSize = useCallback((newSize) => {
    const size = parseInt(newSize, 10)
    if (!isValidPageSize(size)) return

    try {
      sessionStorage.setItem(storageKey, String(size))
    } catch {
      // Storage unavailable fallback
    }

    setPageSizeState(size)
    updateUrlParams(1, size)
    scrollToTop()
  }, [storageKey, isValidPageSize, updateUrlParams, scrollToTop])

  // 9. API Ready Helper
  const getQueryParams = useCallback(() => ({
    page: currentPage,
    pageSize,
    limit: pageSize,
    skip: (currentPage - 1) * pageSize
  }), [currentPage, pageSize])

  return {
    currentPage,
    pageSize,
    totalPages,
    totalItems: totalItemsCount,
    startItem,
    endItem,
    isFirstPage,
    isLastPage,
    paginatedItems,
    pageNumbers,
    pageSizeOptions,
    // Action names & standard on* aliases expected by <Pagination />
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    setPageSize: handleSetPageSize,
    onPageChange: goToPage,
    onNextPage: nextPage,
    onPrevPage: prevPage,
    onFirstPage: firstPage,
    onLastPage: lastPage,
    onPageSizeChange: handleSetPageSize,
    getQueryParams
  }
}
