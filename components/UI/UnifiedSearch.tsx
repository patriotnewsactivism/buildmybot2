import React, { useState, useEffect, useRef } from 'react';
import { Search, Bot, User, FileText, X, Loader, ArrowRight } from 'lucide-react';

interface SearchResult {
  bots: any[];
  leads: any[];
  knowledge: any[];
}

interface UnifiedSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

export const UnifiedSearch: React.FC<UnifiedSearchProps> = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onClose(); // Toggle logic should be in parent
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleNavigate = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <Search className="text-slate-400" size={20} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search bots, leads, or knowledge..."
            className="flex-1 outline-none text-lg text-slate-800 placeholder:text-slate-400"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && <Loader className="animate-spin text-slate-400" size={18} />}
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-2">
          {!results && !loading && (
            <div className="text-center py-12 text-slate-400">
              <p>Type to search across your entire workspace</p>
            </div>
          )}

          {results && (
            <div className="space-y-6 p-2">
              {/* Bots Section */}
              {results.bots.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">Bots</h3>
                  <div className="space-y-1">
                    {results.bots.map((bot: any) => (
                      <button
                        key={bot.id}
                        onClick={() => handleNavigate(`/app/bots/${bot.id}`)}
                        className="w-full flex items-center gap-3 p-2 hover:bg-blue-50 rounded-lg group text-left"
                      >
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                          <Bot size={18} />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">{bot.name}</div>
                          <div className="text-xs text-slate-500 truncate">{bot.systemPrompt?.substring(0, 60)}...</div>
                        </div>
                        <ArrowRight size={16} className="text-slate-300 group-hover:text-blue-400 opacity-0 group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Leads Section */}
              {results.leads.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">Leads</h3>
                  <div className="space-y-1">
                    {results.leads.map((lead: any) => (
                      <button
                        key={lead.id}
                        onClick={() => handleNavigate(`/app/leads?id=${lead.id}`)}
                        className="w-full flex items-center gap-3 p-2 hover:bg-emerald-50 rounded-lg group text-left"
                      >
                        <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                          <User size={18} />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">{lead.name || lead.email}</div>
                          <div className="text-xs text-slate-500">{lead.email} • Score: {lead.score}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Knowledge Section */}
              {results.knowledge.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">Knowledge Base</h3>
                  <div className="space-y-1">
                    {results.knowledge.map((chunk: any) => (
                      <button
                        key={chunk.id}
                        onClick={() => handleNavigate(`/app/bots/${chunk.botId}/knowledge`)}
                        className="w-full flex items-center gap-3 p-2 hover:bg-amber-50 rounded-lg group text-left"
                      >
                        <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                          <FileText size={18} />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">Match in {chunk.botName}</div>
                          <div className="text-xs text-slate-500 truncate">{chunk.content.substring(0, 80)}...</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.bots.length === 0 && results.leads.length === 0 && results.knowledge.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  No results found for "{query}"
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="p-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
          <div className="flex gap-4">
            <span><kbd className="font-sans bg-white px-1.5 py-0.5 rounded border border-slate-300">↑↓</kbd> to navigate</span>
            <span><kbd className="font-sans bg-white px-1.5 py-0.5 rounded border border-slate-300">↵</kbd> to select</span>
          </div>
          <span><kbd className="font-sans bg-white px-1.5 py-0.5 rounded border border-slate-300">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
};
