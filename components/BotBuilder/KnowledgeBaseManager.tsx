import {
  AlertCircle,
  CheckCircle,
  Database,
  FileText,
  Globe,
  Link,
  Loader,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import { dbService } from '../../services/dbService';
import type { BotDocument } from '../../types';

interface KnowledgeSource {
  id: string;
  sourceType: 'url' | 'document' | 'manual';
  sourceName: string;
  sourceUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  pagesCrawled?: number;
  chunkCount: number;
  lastCrawledAt?: string;
  createdAt: string;
}

interface KnowledgeStats {
  sources: number;
  chunks: number;
  totalTokens: number;
}

interface KnowledgeBaseManagerProps {
  botId: string;
  documents: BotDocument[];
  onDocumentsChange: (documents: BotDocument[]) => void;
}

export const KnowledgeBaseManager: React.FC<KnowledgeBaseManagerProps> = ({
  botId,
  documents,
  onDocumentsChange,
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [urlInput, setUrlInput] = useState('');
  const [crawlDepth, setCrawlDepth] = useState(3);
  const [scraping, setScraping] = useState(false);

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [stats, setStats] = useState<KnowledgeStats>({
    sources: 0,
    chunks: 0,
    totalTokens: 0,
  });
  const [loadingSources, setLoadingSources] = useState(false);

  const fetchSources = useCallback(async () => {
    if (!botId || botId === 'new') return;

    try {
      const response = await fetch(buildApiUrl(`/knowledge/sources/${botId}`));
      if (response.ok) {
        const data = await response.json();
        setSources(data.sources || []);
        setStats(data.stats || { sources: 0, chunks: 0, totalTokens: 0 });
      }
    } catch (err) {
      console.error('Failed to fetch sources:', err);
    }
  }, [botId]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    const hasProcessing = sources.some((s) => s.status === 'processing');
    if (hasProcessing) {
      const interval = setInterval(fetchSources, 3000);
      return () => clearInterval(interval);
    }
  }, [sources, fetchSources]);

  const handleUrlScrape = async () => {
    if (!urlInput.trim() || !botId || botId === 'new') return;

    try {
      new URL(urlInput);
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    setScraping(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(buildApiUrl(`/knowledge/scrape/${botId}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput, crawlDepth }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuccess(
          `Started crawling ${urlInput}. This may take a few minutes.`,
        );
        setUrlInput('');
        fetchSources();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to start scraping');
      }
    } catch (err) {
      console.error('Scrape error:', err);
      setError('Failed to connect to server');
    } finally {
      setScraping(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleUpload(Array.from(files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(Array.from(e.target.files));
    }
  };

  const handleUpload = async (files: File[]) => {
    if (!botId || botId === 'new') {
      setError('Please save your bot before uploading documents');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentFile(file.name);

      if (file.size > 20 * 1024 * 1024) {
        setError(`${file.name} exceeds 20MB limit`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(
          buildApiUrl(`/knowledge/upload/${botId}`),
          {
            method: 'POST',
            body: formData,
          },
        );

        if (response.ok) {
          setUploadProgress(((i + 1) / files.length) * 100);
        } else {
          const data = await response.json();
          setError(data.error || `Failed to upload ${file.name}`);
        }
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
        setError(`Failed to upload ${file.name}. Please try again.`);
      }
    }

    setSuccess(
      'Documents uploaded successfully. Processing may take a moment.',
    );
    setUploading(false);
    setUploadProgress(0);
    setCurrentFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fetchSources();
  };

  const handleDeleteSource = async (sourceId: string) => {
    try {
      const response = await fetch(
        buildApiUrl(`/knowledge/sources/${sourceId}`),
        {
          method: 'DELETE',
        },
      );

      if (response.ok) {
        setSources(sources.filter((s) => s.id !== sourceId));
        setSuccess('Source deleted successfully');
      } else {
        setError('Failed to delete source');
      }
    } catch (err) {
      console.error('Delete error:', err);
      setError('Failed to delete source');
    }
  };

  const handleRefreshSource = async (sourceId: string) => {
    try {
      const response = await fetch(
        buildApiUrl(`/knowledge/refresh/${sourceId}`),
        {
          method: 'POST',
        },
      );

      if (response.ok) {
        setSuccess('Refresh started');
        fetchSources();
      } else {
        setError('Failed to refresh source');
      }
    } catch (err) {
      console.error('Refresh error:', err);
      setError('Failed to refresh source');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
            Completed
          </span>
        );
      case 'processing':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full flex items-center gap-1">
            <Loader className="animate-spin" size={12} /> Processing
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
            Failed
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Database className="text-white" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Knowledge Base</h3>
            <p className="text-sm text-slate-600">
              {stats.sources} sources | {stats.chunks} chunks | ~
              {Math.round(stats.totalTokens / 1000)}k tokens
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-blue-100">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            <Globe size={16} className="inline mr-2" />
            Add Website URL
          </label>
          <div className="flex gap-3">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={scraping || botId === 'new'}
            />
            <select
              value={crawlDepth}
              onChange={(e) => setCrawlDepth(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={scraping}
            >
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} page{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleUrlScrape}
              disabled={scraping || !urlInput.trim() || botId === 'new'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {scraping ? (
                <Loader className="animate-spin" size={16} />
              ) : (
                <Link size={16} />
              )}
              {scraping ? 'Scraping...' : 'Scrape'}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            We'll crawl the website and extract content for your knowledge base.
          </p>
        </div>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() =>
          !uploading && botId !== 'new' && fileInputRef.current?.click()
        }
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
          ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : uploading
                ? 'border-slate-200 bg-slate-50 cursor-wait'
                : botId === 'new'
                  ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-50'
                  : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading || botId === 'new'}
        />

        {uploading ? (
          <div className="space-y-4">
            <Loader className="animate-spin text-blue-600 mx-auto" size={32} />
            <div>
              <p className="font-medium text-slate-900">
                Uploading {currentFile}...
              </p>
              <div className="mt-3 w-full bg-slate-200 h-2 rounded-full overflow-hidden max-w-md mx-auto">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {Math.round(uploadProgress)}%
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="mx-auto text-slate-400" size={40} />
            <div>
              <p className="font-medium text-slate-900">
                {botId === 'new'
                  ? 'Save your bot first to upload documents'
                  : 'Drop files here or click to upload'}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                PDF, Word, Text, Markdown, or Images (OCR supported) - max 20MB
                each
              </p>
            </div>
          </div>
        )}
      </div>

      {(error || success) && (
        <div
          className={`border rounded-lg p-4 flex items-start gap-3 ${error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}
        >
          {error ? (
            <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
          ) : (
            <CheckCircle className="text-green-600 shrink-0 mt-0.5" size={20} />
          )}
          <div className="flex-1">
            <p
              className={`text-sm ${error ? 'text-red-700' : 'text-green-700'}`}
            >
              {error || success}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSuccess(null);
            }}
            className={
              error
                ? 'text-red-400 hover:text-red-600'
                : 'text-green-400 hover:text-green-600'
            }
          >
            <X size={18} />
          </button>
        </div>
      )}

      {sources.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-slate-900 flex items-center gap-2">
            <Database size={18} />
            Knowledge Sources ({sources.length})
          </h4>
          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${source.sourceType === 'url' ? 'bg-indigo-100' : 'bg-blue-100'}`}
                  >
                    {source.sourceType === 'url' ? (
                      <Globe className="text-indigo-600" size={20} />
                    ) : (
                      <FileText className="text-blue-600" size={20} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {source.sourceName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {source.sourceType === 'url' && source.pagesCrawled
                        ? `${source.pagesCrawled} pages crawled | `
                        : ''}
                      {source.chunkCount} chunks
                      {source.errorMessage && (
                        <span className="text-red-500 ml-2">
                          Error: {source.errorMessage}
                        </span>
                      )}
                    </p>
                  </div>
                  {getStatusBadge(source.status)}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {source.sourceType === 'url' &&
                    source.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => handleRefreshSource(source.id)}
                        className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw size={18} />
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => handleDeleteSource(source.id)}
                    className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
          <Database size={16} />
          How Your Knowledge Base Works
        </h4>
        <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
          <li>Add websites - we'll crawl and extract content automatically</li>
          <li>
            Upload documents - PDF, Word, text files, or images with text (OCR)
          </li>
          <li>
            Content is automatically chunked and indexed for fast AI retrieval
          </li>
          <li>
            Both your chatbot and voice agent use this knowledge to answer
            questions
          </li>
          <li>
            Keep your knowledge base updated by refreshing sources periodically
          </li>
        </ul>
      </div>
    </div>
  );
};
