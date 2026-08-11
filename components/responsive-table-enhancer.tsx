"use client";

import { useEffect } from "react";

function labelTable(table: HTMLTableElement) {
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>(":scope > thead > tr:last-child > th"))
    .map((header) => header.textContent?.trim().replace(/[↑↓]/g, "").trim() || header.getAttribute("aria-label") || "Value");
  for (const row of table.querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr")) {
    let columnIndex = 0;
    for (const cell of row.querySelectorAll<HTMLTableCellElement>(":scope > td")) {
      if (!cell.dataset.label) cell.dataset.label = headers[columnIndex] || "Details";
      columnIndex += Math.max(1, cell.colSpan);
      if (cell.querySelector("a,button,input,select,textarea,details") || cell.dataset.sensitive === "true") continue;
      const updateDisclosure = () => {
        const truncated = cell.scrollWidth > cell.clientWidth + 1 || cell.scrollHeight > cell.clientHeight + 1;
        if (truncated) {
          cell.tabIndex = 0;
          cell.classList.add("cell-disclosure");
          cell.setAttribute("aria-expanded", String(cell.dataset.expanded === "true"));
        }
      };
      updateDisclosure();
    }
  }
  table.classList.add("responsive-table-ready");
}

export function ResponsiveTableEnhancer() {
  useEffect(() => {
    const enhance = () => document.querySelectorAll<HTMLTableElement>("table.data-table").forEach(labelTable);
    const onKeyDown = (event: KeyboardEvent) => {
      const cell = (event.target as HTMLElement).closest<HTMLTableCellElement>("td.cell-disclosure");
      if (!cell) return;
      if (event.key === "Escape") {
        cell.dataset.expanded = "false";
        cell.setAttribute("aria-expanded", "false");
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const expanded = cell.dataset.expanded !== "true";
        cell.dataset.expanded = String(expanded);
        cell.setAttribute("aria-expanded", String(expanded));
      }
    };
    const onClick = (event: MouseEvent) => {
      const cell = (event.target as HTMLElement).closest<HTMLTableCellElement>("td.cell-disclosure");
      if (!cell || (event.target as HTMLElement).closest("a,button,input,select,textarea,details")) return;
      const expanded = cell.dataset.expanded !== "true";
      cell.dataset.expanded = String(expanded);
      cell.setAttribute("aria-expanded", String(expanded));
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", enhance);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", enhance);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
