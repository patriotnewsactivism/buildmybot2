import {
  ChevronLeft,
  Clock,
  Download,
  Filter,
  Frown,
  Meh,
  Menu,
  MessageSquare,
  Search,
  Smile,
  User,
  X,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { Conversation } from '../../types';

interface ChatLogsProps {
  conversations: Conversation[];
}

export const ChatLogs: React.FC<ChatLogsProps> = ({ conversations }) => {
  const [selectedConversationId, setSelectedConversationId] = useState<string>(
    conversations[0]?.id || '',
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileList, setShowMobileList] = useState(true);

  const activeConversation =
    conversations.find((c) => c.id === selectedConversationId) ||
    conversations[0];

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'Positive':
        return <Smile className="text-emerald-500" size={16} />;
      case 'Negative':
        return <Frown className="text-red-500" size={16} />;
      default:
        return <Meh className="text-yellow-500" size={16} />;
    }
  };

  const filteredConversations = conversations.filter(
    (c) =>
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.messages.some((m) =>
        m.text.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
  );

  const handleSelectConversation = (convId: string) => {
    setSelectedConversationId(convId);
    setShowMobileList(false);
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-4 md:gap-6 animate-fade-in">
      {/* Mobile Toggle Header */}
      <div className="md:hidden flex items-center justify-between bg-white rounded-xl p-3 border border-slate-200 shadow-sm">
        <button
          type="button"
          onClick={() => setShowMobileList(!showMobileList)}
          className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-700 min-h-[44px]"
        >
          {showMobileList ? <X size={18} /> : <Menu size={18} />}
          {showMobileList ? 'Hide List' : 'Show Conversations'}
        </button>
        {!showMobileList && activeConversation && (
          <span className="text-sm text-slate-500">
            Visitor #{activeConversation.id.substring(0, 4)}
          </span>
        )}
      </div>

      {/* Sidebar List */}
      <div
        className={`w-full md:w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden ${showMobileList ? 'max-h-[50vh] md:max-h-none' : 'hidden md:flex'}`}
      >
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-semibold text-slate-800 mb-3">Conversations</h3>
          <div className="relative">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border-slate-200 text-base md:text-sm focus:ring-blue-900 focus:border-blue-900"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => handleSelectConversation(conv.id)}
              className={`p-4 border-b border-slate-50 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition min-h-[72px] ${
                selectedConversationId === conv.id
                  ? 'bg-blue-50 border-l-4 border-l-blue-900'
                  : ''
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-slate-700 text-sm">
                  Visitor #{conv.id.substring(0, 4)}
                </span>
                <span className="text-[10px] text-slate-400">
                  {new Date(conv.timestamp).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate mb-2">
                {conv.messages[conv.messages.length - 1].text}
              </p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-medium text-slate-600">
                  {getSentimentIcon(conv.sentiment)} {conv.sentiment}
                </div>
                <div className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                  {conv.messages.length} msgs
                </div>
              </div>
            </div>
          ))}
          {filteredConversations.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              No conversations found.
            </div>
          )}
        </div>
      </div>

      {/* Main Chat View */}
      {activeConversation ? (
        <div
          className={`flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden ${showMobileList ? 'hidden md:flex' : ''}`}
        >
          {/* Header */}
          <div className="min-h-[64px] border-b border-slate-100 px-4 md:px-6 py-3 flex items-center justify-between bg-white gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setShowMobileList(true)}
                className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-900 flex-shrink-0">
                <User size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-800 truncate">
                  Visitor #{activeConversation.id.substring(0, 4)}
                </h3>
                <div className="flex flex-wrap items-center gap-1 md:gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />{' '}
                    {new Date(
                      activeConversation.timestamp,
                    ).toLocaleDateString()}
                  </span>
                  <span className="hidden sm:inline mx-1">•</span>
                  <span className="flex items-center gap-1">
                    {getSentimentIcon(activeConversation.sentiment)}{' '}
                    <span className="hidden sm:inline">
                      {activeConversation.sentiment}
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-1 md:gap-2 flex-shrink-0">
              <button
                type="button"
                className="p-2 text-slate-400 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Filter size={18} />
              </button>
              <button
                type="button"
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition min-h-[44px]"
              >
                <Download size={16} />{' '}
                <span className="hidden md:inline">Export JSON</span>
              </button>
              <button
                type="button"
                className="sm:hidden p-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Download size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 bg-slate-50/50">
            {activeConversation.messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[85%] md:max-w-[70%] ${msg.role === 'user' ? 'order-2 ml-2 md:ml-3' : 'order-1 mr-2 md:mr-3'}`}
                >
                  <div
                    className={`rounded-2xl px-4 md:px-5 py-3 text-sm shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-white text-slate-700 border border-slate-200 rounded-tl-none'
                        : 'bg-blue-900 text-white rounded-tr-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <p
                    className={`text-[10px] text-slate-400 mt-1 ${msg.role === 'user' ? 'text-left' : 'text-right'}`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <div
                  className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user'
                      ? 'order-1 bg-slate-200 text-slate-500'
                      : 'order-2 bg-blue-100 text-blue-900'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User size={14} />
                  ) : (
                    <MessageSquare size={14} />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Analytics Footer */}
          <div className="bg-slate-900 text-slate-300 p-3 md:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
            <div className="flex flex-wrap gap-3 md:gap-6">
              <span>
                Tokens: <span className="text-white font-mono">452</span>
              </span>
              <span>
                Time: <span className="text-white font-mono">1.2s</span>
              </span>
              <span>
                Cost: <span className="text-white font-mono">$0.002</span>
              </span>
            </div>
            <div className="text-blue-400 truncate max-w-full">
              ID: {activeConversation.id.substring(0, 12)}...
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-slate-400">
          Select a conversation to view details
        </div>
      )}
    </div>
  );
};
