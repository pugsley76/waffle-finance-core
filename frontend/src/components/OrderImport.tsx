/**
 * OrderImport
 *
 * Allows users to import their order history from a CSV or JSON file.
 *
 * Features:
 *  - File upload input (drag-and-drop or click)
 *  - Preview table showing the first N valid rows before confirmation
 *  - Validates file structure (required columns / fields)
 *  - Shows row-level error details for malformed data
 *  - Allows partial import: skips invalid rows, imports valid ones
 *  - Stores imported orders in localStorage
 *  - Displays a storage quota warning when > 5 MB
 *  - Lets the user clear all imported orders
 */

import { useCallback, useRef, useState } from 'react';
import {
  Upload,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Trash2,
  Loader2,
  FileText,
} from 'lucide-react';
import type { Transaction } from '../hooks/useTransactionHistoryCache';
import {
  useOrderExportImport,
  type ImportRow,
  type RowValidationError,
} from '../hooks/useOrderExportImport';

interface OrderImportProps {
  /** Called with the updater function when the user confirms an import. */
  onMerge: (updater: (prev: Transaction[]) => Transaction[]) => void;
}

const PREVIEW_ROWS = 5;
const ACCEPTED_TYPES = '.csv,.json,text/csv,application/json';

type ImportPhase = 'idle' | 'parsed' | 'success';

export default function OrderImport({ onMerge }: OrderImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<RowValidationError[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [overQuota, setOverQuota] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    parseImportFile,
    confirmImport,
    isImporting,
    importError,
    importedStorageBytes,
    clearImported,
  } = useOrderExportImport();

  const storedMb = (importedStorageBytes() / (1024 * 1024)).toFixed(2);

  const resetState = () => {
    setPhase('idle');
    setFileName(null);
    setPreview([]);
    setValidationErrors([]);
    setTotalRows(0);
    setImportedCount(0);
    setOverQuota(false);
    setShowAllErrors(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setPhase('idle');

      try {
        const result = await parseImportFile(file);
        setPreview(result.preview);
        setValidationErrors(result.validationErrors);
        setTotalRows(result.totalRows);
        setPhase('parsed');
      } catch {
        // importError from hook is already set
      }
    },
    [parseImportFile],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handleConfirm = () => {
    const result = confirmImport(preview, onMerge);
    setImportedCount(result.imported.length);
    setOverQuota(result.overQuota);
    setPhase('success');
  };

  const handleClearImported = () => {
    clearImported();
    resetState();
  };

  const visibleErrors = showAllErrors
    ? validationErrors
    : validationErrors.slice(0, 3);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
      {/* Header / Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={isOpen}
        aria-controls="order-import-panel"
      >
        <div className="flex items-center gap-2.5">
          <Upload className="h-4 w-4 text-indigo-400/80" />
          <span className="text-sm font-semibold text-white">Import Orders</span>
          {parseFloat(storedMb) > 0 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.68rem] text-slate-400">
              {storedMb} MB stored
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          id="order-import-panel"
          className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-4"
        >
          {/* Drop zone */}
          {phase === 'idle' && (
            <div
              role="button"
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              aria-label="Upload CSV or JSON order history file"
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                isDragging
                  ? 'border-indigo-400/60 bg-indigo-400/[0.08]'
                  : 'border-white/15 bg-white/[0.02] hover:border-indigo-400/35 hover:bg-indigo-400/[0.05]'
              }`}
            >
              {isImporting ? (
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              ) : (
                <FileText className="h-8 w-8 text-slate-400" />
              )}
              <div>
                <p className="text-sm font-semibold text-white">
                  {isImporting ? 'Parsing file…' : 'Drop a file or click to browse'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">CSV or JSON — exported from WaffleFinance</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                onChange={handleFileInput}
                className="sr-only"
                aria-hidden="true"
              />
            </div>
          )}

          {/* Parse error */}
          {importError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="font-semibold">Could not read file</p>
                <p className="mt-0.5 text-red-300/80">{importError}</p>
              </div>
            </div>
          )}

          {/* Parsed — preview + errors */}
          {phase === 'parsed' && (
            <>
              {/* File summary */}
              <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-mono text-slate-300 truncate max-w-[12rem]">{fileName}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="text-white">{preview.length}</span> valid
                  {validationErrors.length > 0 && (
                    <span className="text-amber-300">, {validationErrors.length} skipped</span>
                  )}
                  <span>/ {totalRows} total rows</span>
                </div>
              </div>

              {/* Row-level validation errors */}
              {validationErrors.length > 0 && (
                <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2">
                  <p className="mb-1.5 text-xs font-semibold text-amber-300">
                    {validationErrors.length} row{validationErrors.length !== 1 ? 's' : ''} skipped
                  </p>
                  <ul className="space-y-1">
                    {visibleErrors.map((e) => (
                      <li key={e.rowIndex} className="text-[0.68rem] text-amber-200/80">
                        <span className="font-semibold">Row {e.rowIndex}:</span>{' '}
                        {e.messages.join('; ')}
                      </li>
                    ))}
                  </ul>
                  {validationErrors.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAllErrors((v) => !v)}
                      className="mt-1.5 text-[0.68rem] text-amber-400 underline hover:no-underline"
                    >
                      {showAllErrors
                        ? 'Show less'
                        : `Show ${validationErrors.length - 3} more`}
                    </button>
                  )}
                </div>
              )}

              {/* Preview table */}
              {preview.length > 0 && (
                <div>
                  <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Preview (first {Math.min(PREVIEW_ROWS, preview.length)} rows)
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="min-w-full text-xs" aria-label="Import preview">
                      <thead>
                        <tr className="border-b border-white/[0.06] bg-white/[0.03]">
                          {['Order ID', 'Direction', 'From', 'To', 'Status', 'Date'].map(
                            (h) => (
                              <th
                                key={h}
                                scope="col"
                                className="whitespace-nowrap px-3 py-2 text-left text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500"
                              >
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {preview.slice(0, PREVIEW_ROWS).map((row, i) => (
                          <tr key={i} className="hover:bg-white/[0.025]">
                            <td className="px-3 py-2 font-mono text-slate-300">
                              {row.orderId.length > 14
                                ? `${row.orderId.slice(0, 6)}…${row.orderId.slice(-6)}`
                                : row.orderId}
                            </td>
                            <td className="px-3 py-2 text-slate-300">{row.direction}</td>
                            <td className="px-3 py-2 text-slate-300">
                              {row.sourceAmount} ({row.sourceChain})
                            </td>
                            <td className="px-3 py-2 text-slate-300">
                              {row.destAmount} ({row.destChain})
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`rounded-full px-2 py-0.5 font-semibold ${
                                  row.status === 'completed'
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : row.status === 'failed' || row.status === 'expired'
                                    ? 'bg-red-500/15 text-red-300'
                                    : row.status === 'refunded'
                                    ? 'bg-indigo-500/15 text-indigo-300'
                                    : 'bg-white/10 text-slate-300'
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-400">
                              {new Date(row.timestamp).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.length > PREVIEW_ROWS && (
                    <p className="mt-1.5 text-[0.68rem] text-slate-500">
                      +{preview.length - PREVIEW_ROWS} more rows not shown
                    </p>
                  )}
                </div>
              )}

              {/* No valid rows */}
              {preview.length === 0 && totalRows > 0 && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>No valid rows found. Check that the file uses the WaffleFinance export format.</span>
                </div>
              )}

              {/* Action row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={resetState}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-400 transition-colors hover:border-white/20 hover:text-white"
                >
                  Choose different file
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={preview.length === 0}
                  className="flex items-center gap-2 rounded-full border border-indigo-400/35 bg-indigo-400/[0.14] px-4 py-2 text-sm font-semibold text-indigo-200 transition-colors hover:bg-indigo-400/[0.22] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Import {preview.length} order{preview.length !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}

          {/* Success state */}
          {phase === 'success' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.08] px-4 py-3">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-emerald-300">
                    {importedCount} order{importedCount !== 1 ? 's' : ''} imported
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-300/70">
                    Imported orders are stored locally and marked as "imported" in your history.
                  </p>
                  {overQuota && (
                    <p className="mt-1 text-xs text-amber-300">
                      Warning: imported orders are approaching the 5 MB storage limit.
                      Consider clearing old imports to free space.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={resetState}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-400 transition-colors hover:border-white/20 hover:text-white"
                >
                  Import another file
                </button>
                <button
                  type="button"
                  onClick={handleClearImported}
                  className="flex items-center gap-2 rounded-full border border-red-400/25 bg-red-400/[0.08] px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-400/[0.15]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear imported orders
                </button>
              </div>
            </div>
          )}

          {/* Persistent clear button when there are stored imports and we are in idle */}
          {phase === 'idle' && parseFloat(storedMb) > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <p className="text-xs text-slate-400">
                {storedMb} MB of imported orders in local storage
              </p>
              <button
                type="button"
                onClick={handleClearImported}
                className="flex items-center gap-1.5 rounded-full border border-red-400/25 bg-red-400/[0.08] px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-400/[0.15]"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
