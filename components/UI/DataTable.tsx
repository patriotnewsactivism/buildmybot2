import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

export interface Column<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  onRowClick,
  searchable = false,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No data available',
  loading = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');

  const getItemValue = (item: T, key: Column<T>['key']) =>
    (item as Record<string, unknown>)[String(key)];

  const handleRowKeyDown = (event: React.KeyboardEvent, item: T) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick?.(item);
    }
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const filteredData = searchable
    ? data.filter((item) =>
        Object.values(item).some((value) =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase()),
        ),
      )
    : data;

  const sortedData = sortKey
    ? [...filteredData].sort((a, b) => {
        const aVal = getItemValue(a, sortKey);
        const bVal = getItemValue(b, sortKey);
        if (aVal === bVal) return 0;

        const aComparable =
          typeof aVal === 'number' ? aVal : String(aVal ?? '');
        const bComparable =
          typeof bVal === 'number' ? bVal : String(bVal ?? '');
        const comparison = aComparable > bComparable ? 1 : -1;
        return sortDirection === 'asc' ? comparison : -comparison;
      })
    : filteredData;

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-slate-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {searchable && (
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
              size={20}
            />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="block md:hidden">
        {sortedData.length === 0 ? (
          <div className="p-6 text-center text-slate-500">{emptyMessage}</div>
        ) : (
          <div className="space-y-3 p-3">
            {sortedData.map((item) => (
              <div
                key={item.id}
                onClick={() => onRowClick?.(item)}
                onKeyDown={(event) => handleRowKeyDown(event, item)}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={`bg-white rounded-lg shadow-sm border border-slate-200 p-4 ${
                  onRowClick
                    ? 'cursor-pointer hover:bg-slate-50 active:bg-slate-100'
                    : ''
                }`}
              >
                {columns.map((column) => (
                  <div
                    key={String(column.key)}
                    className="py-2 first:pt-0 last:pb-0 border-b border-slate-100 last:border-b-0"
                  >
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                      {column.label}
                    </div>
                    <div className="text-sm text-slate-900">
                      {column.render
                        ? column.render(item)
                        : String(getItemValue(item, column.key) || '-')}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={`px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:bg-slate-100' : ''
                  }`}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(String(column.key))}
                      className="flex items-center space-x-1"
                    >
                      <span>{column.label}</span>
                      {sortKey === column.key && (
                        <span>
                          {sortDirection === 'asc' ? (
                            <ChevronUp size={16} />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                        </span>
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center space-x-1">
                      <span>{column.label}</span>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => onRowClick?.(item)}
                  onKeyDown={(event) => handleRowKeyDown(event, item)}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={`${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                >
                  {columns.map((column) => (
                    <td
                      key={String(column.key)}
                      className="px-6 py-4 whitespace-nowrap text-sm text-slate-900"
                    >
                      {column.render
                        ? column.render(item)
                        : String(getItemValue(item, column.key) || '-')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
