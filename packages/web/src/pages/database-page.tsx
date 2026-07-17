import { useEffect, useState, useRef } from 'react';
import { Database, Download, HardDrive, RefreshCw, Table2, Upload, Trash2 } from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';
import { api, exportDatabase, exportDatabaseCsv, exportDatabaseJson, importDatabase } from '../utils/api';
import { useToast } from '../components/ToastProvider';
import { Card, CardHeader, CardTitle, Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui';
import { LocalDatabaseInspector } from '../components/LocalDatabaseInspector';
import { SourceAlignmentSummary } from '../components/SourceAlignmentPanel';

interface BackupInfo {
  fileSize: number;
  fileSizeFormatted: string;
  tableCounts: Record<string, number>;
  tableMeta: Record<string, { lastUpdate: string | null; source: string }>;
  dbPath: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

export function DatabasePage() {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchInfo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: BackupInfo }>('/backup/info');
      setInfo(res.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchInfo();
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportDatabase();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await exportDatabaseCsv();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJson = async () => {
    setIsExporting(true);
    try {
      await exportDatabaseJson();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    setIsImporting(true);
    setError(null);
    try {
      const res = await importDatabase(file);
      addToast('success', res.message ?? t('database.importSuccess'));
      await fetchInfo();
    } catch (err) {
      setError((err as Error).message);
      addToast('error', (err as Error).message);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCleanupWal = async () => {
    setIsCleaning(true);
    setError(null);
    try {
      const res = await api.post<{ data: { before: number; after: number; freedBytes: number } }>('/backup/cleanup');
      const { freedBytes } = res.data;
      addToast('success', t('database.walCleaned', { freed: formatBytes(freedBytes) }));
      await fetchInfo();
    } catch (err) {
      setError((err as Error).message);
      addToast('error', (err as Error).message);
    } finally {
      setIsCleaning(false);
    }
  };

  const tableEntries = info ? Object.entries(info.tableCounts).sort(([a], [b]) => a.localeCompare(b)) : [];
  const totalRows = tableEntries.reduce((sum, [, count]) => sum + count, 0);

  function formatLastUpdate(value: string | null): string {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">{t('database.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchInfo()} disabled={isLoading}>
            <RefreshCw className={cn('mr-1 h-3.5 w-3.5', isLoading && 'animate-spin')} />
            {t('common.refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={isExporting || !info}>
            <Download className="mr-1 h-3.5 w-3.5" />
            {t('database.exportCsv')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJson} disabled={isExporting || !info}>
            <Download className="mr-1 h-3.5 w-3.5" />
            {t('database.exportJson')}
          </Button>
          <Button size="sm" onClick={handleExport} disabled={isExporting || !info}>
            <Download className="mr-1 h-3.5 w-3.5" />
            {isExporting ? t('database.exporting') : t('database.export')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            {isImporting ? t('database.importing') : t('database.import')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCleanupWal} disabled={isCleaning || !info}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {isCleaning ? t('database.cleaning') : t('database.cleanupWal')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,application/octet-stream"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
          />
        </div>
      </div>

      {error && <div className="rounded-lg border border-red/20 bg-red/5 p-4 text-sm text-red">{error}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <HardDrive className="h-4 w-4" />
            <span className="text-xs">{t('database.fileName')}</span>
          </div>
          <div className="mt-1 text-lg font-semibold">{info?.dbPath ?? '-'}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Database className="h-4 w-4" />
            <span className="text-xs">{t('database.fileSize')}</span>
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {info ? formatBytes(info.fileSize) : '-'}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Table2 className="h-4 w-4" />
            <span className="text-xs">{t('database.totalRows')}</span>
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{info ? totalRows.toLocaleString() : '-'}</div>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('database.localTables')}</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">{t('database.tableCount', { count: tableEntries.length })}</span>
        </CardHeader>
        <div className="p-0">
          {tableEntries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">{t('database.empty')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 py-2 text-xs">{t('database.tableName')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('database.tableSource')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('database.tableLastUpdate')}</TableHead>
                  <TableHead className="px-4 py-2 text-right text-xs">{t('database.rowCount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableEntries.map(([name, count]) => {
                  const meta = info?.tableMeta?.[name];
                  return (
                    <TableRow key={name}>
                      <TableCell className="px-4 py-2 text-xs font-medium">{name}</TableCell>
                      <TableCell className="px-4 py-2 text-xs text-muted-foreground">{meta?.source ?? '-'}</TableCell>
                      <TableCell className="px-4 py-2 text-xs text-muted-foreground tabular-nums">{formatLastUpdate(meta?.lastUpdate ?? null)}</TableCell>
                      <TableCell className="px-4 py-2 text-right text-xs tabular-nums">{count.toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      <SourceAlignmentSummary />

      <LocalDatabaseInspector tableNames={tableEntries.map(([name]) => name)} />
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
