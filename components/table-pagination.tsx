"use client";

import { useEffect, useMemo, useState } from "react";

export const TABLE_PAGE_SIZES = [25, 50, 100, 200] as const;

export function useLocalTablePagination<T>(items: T[], storageKey: string) {
  const restored = () => {
    if (typeof window === "undefined") return {} as { page?: number; pageSize?: number };
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as { page?: number; pageSize?: number };
    } catch { return {}; }
  };
  const [page, setPageState] = useState(() => { const value = restored().page; return Number.isInteger(value) && value! > 0 ? value! : 1; });
  const [pageSize, setPageSizeState] = useState<number>(() => { const value = restored().pageSize; return TABLE_PAGE_SIZES.includes(value as (typeof TABLE_PAGE_SIZES)[number]) ? value! : 25; });
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  useEffect(() => { sessionStorage.setItem(storageKey, JSON.stringify({ page: clampedPage, pageSize })); }, [clampedPage, pageSize, storageKey]);
  const pageItems = useMemo(() => items.slice((clampedPage - 1) * pageSize, clampedPage * pageSize), [clampedPage, items, pageSize]);
  const setPage = (value: number) => setPageState(Math.max(1, Math.min(value, pageCount)));
  const setPageSize = (value: number) => { setPageSizeState(value); setPageState(1); };
  return { page: clampedPage, pageSize, pageCount, pageItems, setPage, setPageSize };
}

export function TablePagination({ page, pageSize, total, onPageChange, onPageSizeChange, noun = "rows" }: {
  page: number; pageSize: number; total: number; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void; noun?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return <div className="pagination-row table-pagination"><span>Page {page} of {pageCount} · {total.toLocaleString()} {noun}</span><div><label className="page-size-control">Rows per page<select aria-label="Rows per page" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>{TABLE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label><button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button><button disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button></div></div>;
}
