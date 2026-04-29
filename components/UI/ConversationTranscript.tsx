/**
 * ConversationTranscript — Reusable conversation audit viewer
 *
 * Used across all 4 dashboard tiers for compliance/auditing:
 *   - Client: sees their own bot conversations
 *   - Sales Agent: sees their clients' conversations
 *   - Partner: sees all agents' clients' conversations
 *   - Master Admin: sees everything
 *
 * Supports search, filtering by date/bot/sentiment, and export.
 */

import {
  Bot,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Filter,
  MessageSquare,
  Search,
  User,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  botId: string;
  botName?: string;
  messages: Message[];
  sentiment: string;
  timestamp: string;
  sessionId?: string;
  organizationId?: string;
  clientName?: string; // Populated for admin/agent/partner views
}

interface ConversationTranscriptProps {
  conversations: Conversation[];
  loading?: boolean;
  /** Show client name column (for admin/partner/agent views) */
  showClientColumn?: boolean;
  /** Show bot name column */
  showBotColumn?: boolean;
  /** Called when user wants to export conversations */
  onExport?: (conversations: Conversation[]) => void;
  /** Title override */
  title?: string;
}

const SentimentBadge: React.FC<{ sentiment: string }> = ({ sentiment }) => {
  const s = (sentiment || 'neutral').toLowerCase();
  const config = {
    positive: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    negative: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    neutral: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  };
  const c = config[s as keyof typeof config] || config.neutral;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
      {sentiment || 'Neutral'}
    </span>
  );
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const ConversationTranscript: React.FC<ConversationTranscriptProps> = ({
  conversations,
  loading = false,
  showClientColumn = false,
  showBotColumn = true,
  onExport,
  title = 'Conversation Audit Log',
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Filter conversations
  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      // Sentiment filter
      if (sentimentFilter !== 'all') {
        const s = (c.sentiment || 'neutral').toLowerCase();
        if (s !== sentimentFilter) return false;
      }
      // Search filter — searches through message text, bot name, client name
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hasMatch =
          c.messages?.some((m) => m.text.toLowerCase().includes(q)) ||
          c.botName?.toLowerCase().includes(q) ||
          c.clientName?.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q);
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [conversations, sentimentFilter, searchQuery]);

  const handleExport = () => {
    if (onExport) {
      onExport(filtered);
      return;
    }
    // Default CSV export
    const rows = [['Date', 'Bot', 'Sentiment', 'Messages', 'Transcript'].join(',')];
    for (const c of filtered) {
      const transcript = (c.messages || [])
        .map((m) => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.text}`)
        .join(' | ');
      rows.push(
        [
          formatDate(c.timestamp),
          c.botName || c.botId || '-',
          c.sentiment || 'Neutral',
          String(c.messages?.length || 0),
          `"${transcript.replace(/"/g, '""')}"`,
        ].join(','),
      );
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversations-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading conversations...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-600" />
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {filtered.length} conversation{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {/* Filter toggle */}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg border text-sm ${
                showFilters || sentimentFilter !== 'all'
                  ? 'bg-blue-50 border-blue-200 text-blue-600'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Filter size={16} />
            </button>
            {/* Export */}
            <button
              type="button"
              onClick={handleExport}
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              title="Export to CSV"
            >
              <Download size={16} />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
            {['all', 'positive', 'neutral', 'negative'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSentimentFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  sentimentFilter === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s === 'all' ? 'All Sentiments' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Conversation List */}
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          {conversations.length === 0
            ? 'No conversations recorded yet.'
            : 'No conversations match your filters.'}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filtered.map((conv) => {
            const isExpanded = expandedId === conv.id;
            const messageCount = conv.messages?.length || 0;
            const preview =
              conv.messages?.[0]?.text?.slice(0, 80) +
              (conv.messages?.[0]?.text?.length > 80 ? '...' : '') || 'No messages';

            return (
              <div key={conv.id}>
                {/* Row header */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : conv.id)}
                  className="w-full px-4 md:px-6 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar size={12} />
                          {formatDate(conv.timestamp)}
                        </span>
                        <SentimentBadge sentiment={conv.sentiment} />
                        <span className="text-xs text-slate-400">
                          {messageCount} message{messageCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {showBotColumn && conv.botName && (
                          <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                            <Bot size={12} className="text-blue-500" />
                            {conv.botName}
                          </span>
                        )}
                        {showClientColumn && conv.clientName && (
                          <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                            <User size={12} className="text-emerald-500" />
                            {conv.clientName}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1 truncate">{preview}</p>
                    </div>
                  </div>
                </button>

                {/* Expanded transcript */}
                {isExpanded && (
                  <div className="px-4 md:px-6 pb-4 bg-slate-50 border-t border-slate-100">
                    <div className="py-3 space-y-3 max-h-96 overflow-y-auto">
                      {(conv.messages || []).map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex gap-3 ${msg.role === 'model' ? '' : 'flex-row-reverse'}`}
                        >
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                              msg.role === 'model'
                                ? 'bg-blue-100 text-blue-600'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {msg.role === 'model' ? <Bot size={14} /> : <User size={14} />}
                          </div>
                          <div
                            className={`max-w-[75%] rounded-lg px-3 py-2 ${
                              msg.role === 'model'
                                ? 'bg-white border border-slate-200 text-slate-800'
                                : 'bg-blue-600 text-white'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                            {msg.timestamp && (
                              <span
                                className={`text-[10px] mt-1 block ${
                                  msg.role === 'model' ? 'text-slate-400' : 'text-blue-200'
                                }`}
                              >
                                {formatTime(msg.timestamp)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-200 mt-2">
                      <span className="text-[10px] text-slate-400 font-mono">
                        ID: {conv.id}
                      </span>
                      {conv.sessionId && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          Session: {conv.sessionId}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
