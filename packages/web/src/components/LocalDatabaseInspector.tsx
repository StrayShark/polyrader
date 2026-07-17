import { ChevronLeft, ChevronRight, Database, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardHeader, CardTitle, Input, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { api } from '../utils/api';
import { useDebounce } from '../hooks/use-debounce';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

interface TableRowsResponse {
  tableName: string;
  columns: Array<{ name: string; type: string }>;
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  search: string;
}

interface LocalDatabaseInspectorProps {
  tableNames: string[];
}

const PAGE_SIZE = 25;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') {
    return JSON.stringify(value).slice(0, 160);
  }
  return String(value).slice(0, 160);
}

export function LocalDatabaseInspector({ tableNames }: LocalDatabaseInspectorProps) {
  const { t } = useI18n();
  const [selectedTable, setSelectedTable] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<TableRowsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tableNames.length === 0) {
      setSelectedTable('');
      return;
    }
    if (!selectedTable || !tableNames.includes(selectedTable)) {
      setSelectedTable(tableNames[0]);
    }
  }, [selectedTable, tableNames]);

  useEffect(() => {
    setOffset(0);
  }, [selectedTable, debouncedSearch]);

  useEffect(() => {
    if (!selectedTable) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (debouncedSearch) query.set('search', debouncedSearch);

    api.get<{ data: TableRowsResponse }>(`/backup/tables/${encodeURIComponent(selectedTable)}?${query.toString()}`)
      .then((res) => {
        if (!controller.signal.aborted) setData(res.data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError((err as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [selectedTable, debouncedSearch, offset]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const visibleColumns = useMemo(() => data?.columns.slice(0, 8) ?? [], [data?.columns]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">{t('database.inspectorTitle')}</CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedTable}
            onChange={(event) => setSelectedTable(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            aria-label={t('database.selectedTable')}
          >
            {tableNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('database.searchPlaceholder')}
              className="h-8 w-48 pl-7 text-xs"
            />
          </div>
        </div>
      </CardHeader>

      {tableNames.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">{t('database.empty')}</div>
      ) : error ? (
        <div className="m-4 rounded-md border border-red/20 bg-red/5 p-4 text-sm text-red">{error}</div>
      ) : isLoading && !data ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.map((column) => (
                    <TableHead key={column.name} className="min-w-32 px-4 py-2 text-xs">
                      <div className="truncate">{column.name}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">{column.type}</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={Math.max(1, visibleColumns.length)} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      {t('database.noRows')}
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.rows.map((row, rowIndex) => (
                    <TableRow key={`${selectedTable}-${offset}-${rowIndex}`}>
                      {visibleColumns.map((column) => (
                        <TableCell key={column.name} className="max-w-64 px-4 py-2 text-xs">
                          <span className="block truncate" title={formatCell(row[column.name])}>
                            {formatCell(row[column.name])}
                          </span>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <div className="text-xs text-muted-foreground">
              {t('database.rowsShowing', {
                from: data && data.total > 0 ? offset + 1 : 0,
                to: Math.min(offset + PAGE_SIZE, data?.total ?? 0),
                total: data?.total ?? 0,
              })}
              {data && data.columns.length > visibleColumns.length && (
                <span className="ml-2">
                  {t('database.columnLimit', { shown: visibleColumns.length, total: data.columns.length })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">{page} / {pageCount}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={offset <= 0}
                title={offset <= 0 ? t('database.firstPageDisabled') : t('database.previousPage')}
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={cn('h-7 w-7', isLoading && 'opacity-70')}
                disabled={offset + PAGE_SIZE >= (data?.total ?? 0)}
                title={offset + PAGE_SIZE >= (data?.total ?? 0) ? t('database.lastPageDisabled') : t('database.nextPage')}
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
