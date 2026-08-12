export interface CourseExportListItem {
  id: string;
}

export interface CourseExportPage<T extends CourseExportListItem> {
  items: T[];
  total: number;
}

export interface CourseExportStreamDependencies<TQuery, TItem extends CourseExportListItem> {
  columns: readonly string[];
  csvCell: (value: string) => string;
  getPage: (query: TQuery & { page: number; pageSize: number }) => Promise<CourseExportPage<TItem>>;
  getBatch: (appIds: string[]) => Promise<string[][]>;
  pageSize?: number;
}

export function createCourseExportCsvStream<TQuery, TItem extends CourseExportListItem>(
  query: TQuery,
  dependencies: CourseExportStreamDependencies<TQuery, TItem>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const pageSize = dependencies.pageSize ?? 200;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(`${dependencies.columns.map(dependencies.csvCell).join(",")}\r\n`));
        for (let page = 1; ; page += 1) {
          const result = await dependencies.getPage({ ...query, page, pageSize });
          if (result.items.length === 0) break;
          const rows = await dependencies.getBatch(result.items.map((course) => course.id));
          for (const row of rows) controller.enqueue(encoder.encode(`${row.map(dependencies.csvCell).join(",")}\r\n`));
          if (page * pageSize >= result.total) break;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
