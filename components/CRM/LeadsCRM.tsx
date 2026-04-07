import {
  ArrowUpRight,
  Check,
  Download,
  Filter,
  Flame,
  GripVertical,
  LayoutGrid,
  List,
  Mail,
  MoreHorizontal,
  Phone,
  Search,
  Send,
  User as UserIcon,
  X,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import type { Lead } from '../../types';

interface LeadsCRMProps {
  leads: Lead[];
  onUpdateLead: (lead: Lead) => void;
}

export const LeadsCRM: React.FC<LeadsCRMProps> = ({ leads, onUpdateLead }) => {
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [filter, setFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  // Drag and Drop State
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);

  // Modal State
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const filteredLeads = leads.filter((lead) => {
    // Only apply status filter in List mode. In Kanban, we show all columns.
    const matchesFilter =
      viewMode === 'kanban' || filter === 'All' || lead.status === filter;
    const matchesSearch =
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New':
        return 'bg-blue-100 text-blue-900 border-blue-200';
      case 'Contacted':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'Qualified':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Closed':
        return 'bg-slate-200 text-slate-600 border-slate-300';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const handleStatusChange = (leadId: string, newStatus: Lead['status']) => {
    const leadToUpdate = leads.find((l) => l.id === leadId);
    if (leadToUpdate) {
      onUpdateLead({ ...leadToUpdate, status: newStatus });
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLeadId(leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, newStatus: Lead['status']) => {
    e.preventDefault();
    if (draggedLeadId) {
      handleStatusChange(draggedLeadId, newStatus);
      setDraggedLeadId(null);
    }
  };

  const openEmailModal = (lead: Lead) => {
    setSelectedLead(lead);
    setEmailSubject(`Follow up: ${lead.name}`);
    setEmailBody(
      `Hi ${lead.name.split(' ')[0]},\n\nThanks for chatting with our AI assistant earlier. I wanted to personally reach out and see if you had any other questions?\n\nBest,\nTeam Apex`,
    );
    setEmailModalOpen(true);
    setEmailSent(false);
  };

  const handleSendEmail = async () => {
    if (!selectedLead) return;
    setEmailSent(true);
    try {
      const res = await fetch(buildApiUrl(`/leads/${selectedLead.id}/email`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject: emailSubject, body: emailBody }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Send failed' }));
        throw new Error(data.error || 'Send failed');
      }
      setTimeout(() => {
        setEmailModalOpen(false);
        handleStatusChange(selectedLead.id, 'Contacted');
      }, 1200);
    } catch (err) {
      console.error('Email send error:', err);
      alert(err instanceof Error ? err.message : 'Failed to send email');
      setEmailSent(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Name', 'Email', 'Phone', 'Score', 'Status', 'Date'];
    const rows = leads.map((l) => [
      l.id,
      l.name,
      l.email,
      l.phone || '',
      l.score,
      l.status,
      l.createdAt,
    ]);
    const csvContent = `data:text/csv;charset=utf-8,${[headers.join(','), ...rows.map((r) => r.join(','))].join('\n')}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `leads_export_${new Date().toISOString().split('T')[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const KanbanColumn: React.FC<{
    status: Lead['status'];
    items: Lead[];
  }> = ({ status, items }) => (
    <div
      onDragOver={handleDragOver}
      onDrop={(e) => handleDrop(e, status)}
      className="bg-slate-50 rounded-xl p-3 md:p-4 border border-slate-200 min-h-[200px] md:min-h-[500px] flex flex-col"
    >
      <div
        className={`flex justify-between items-center mb-4 pb-2 border-b-2 ${
          status === 'New'
            ? 'border-blue-500'
            : status === 'Contacted'
              ? 'border-yellow-500'
              : status === 'Qualified'
                ? 'border-emerald-500'
                : 'border-slate-400'
        }`}
      >
        <h3 className="font-bold text-slate-700">{status}</h3>
        <span className="bg-white px-2 py-0.5 rounded text-xs font-bold text-slate-500 shadow-sm border border-slate-200">
          {items.length}
        </span>
      </div>

      <div className="flex-1 space-y-3">
        {items.map((lead) => (
          <div
            key={lead.id}
            draggable
            onDragStart={(e) => handleDragStart(e, lead.id)}
            className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 cursor-grab hover:shadow-md transition active:cursor-grabbing group relative"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                {lead.score > 75 && (
                  <Flame
                    size={14}
                    className="text-orange-500 fill-orange-500"
                  />
                )}
                <span className="font-bold text-slate-800 text-sm">
                  {lead.name}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${lead.score > 75 ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500'}`}
              >
                {lead.score}
              </span>
            </div>

            <div className="text-xs text-slate-500 space-y-1 mb-3">
              <div className="flex items-center gap-1.5 truncate">
                <Mail size={12} /> {lead.email}
              </div>
              <div className="flex items-center gap-1.5">
                <UserIcon size={12} /> Bot #{lead.sourceBotId}
              </div>
            </div>

            <button
              type="button"
              onClick={() => openEmailModal(lead)}
              className="w-full py-1.5 rounded bg-slate-50 text-blue-900 text-xs font-medium hover:bg-blue-50 border border-slate-100 flex items-center justify-center gap-1.5 transition"
            >
              <ArrowUpRight size={12} /> Email Lead
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="h-24 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-400 text-xs">
            Drop items here
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Email Modal */}
      {emailModalOpen && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center sticky top-0 z-10">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Mail size={18} /> New Message
              </h3>
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X size={22} />
              </button>
            </div>
            {emailSent ? (
              <div className="p-8 md:p-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                  <Check size={32} />
                </div>
                <h4 className="font-bold text-lg text-slate-800">
                  Email Sent!
                </h4>
                <p className="text-slate-500">
                  Lead status updated to 'Contacted'.
                </p>
              </div>
            ) : (
              <div className="p-4 md:p-6 space-y-4">
                <div>
                  <p className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    To
                  </p>
                  <div className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded text-sm text-slate-700 truncate">
                    {selectedLead.email}
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="lead-email-subject"
                    className="block text-xs font-bold text-slate-500 uppercase mb-1"
                  >
                    Subject
                  </label>
                  <input
                    id="lead-email-subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full px-3 py-3 border border-slate-200 rounded text-base md:text-sm focus:ring-blue-900 focus:border-blue-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="lead-email-message"
                    className="block text-xs font-bold text-slate-500 uppercase mb-1"
                  >
                    Message
                  </label>
                  <textarea
                    id="lead-email-message"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full h-36 md:h-32 px-3 py-3 border border-slate-200 rounded text-base md:text-sm focus:ring-blue-900 focus:border-blue-900 resize-none"
                  />
                </div>
                <div className="flex justify-end pt-2 pb-4 sm:pb-0">
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    className="bg-blue-900 text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-blue-950 active:bg-blue-950 flex items-center gap-2 min-h-[48px] w-full sm:w-auto justify-center"
                  >
                    <Send size={16} /> Send Email
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">
            Lead CRM
          </h2>
          <p className="text-sm text-slate-500">
            Manage pipeline and track leads.
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-2.5 rounded min-h-[44px] min-w-[44px] flex items-center justify-center ${viewMode === 'list' ? 'bg-blue-100 text-blue-900' : 'text-slate-400 hover:text-slate-600 active:bg-slate-100'}`}
              title="List View"
            >
              <List size={18} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`p-2.5 rounded min-h-[44px] min-w-[44px] flex items-center justify-center ${viewMode === 'kanban' ? 'bg-blue-100 text-blue-900' : 'text-slate-400 hover:text-slate-600 active:bg-slate-100'}`}
              title="Kanban Board"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 active:bg-slate-100 text-sm font-medium flex items-center gap-2 bg-white shadow-sm min-h-[44px] flex-1 sm:flex-initial justify-center"
          >
            <Download size={16} />{' '}
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <div className="space-y-4">
          <div className="relative w-full max-w-md">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-blue-900 focus:border-blue-900"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 pb-4">
            {(
              ['New', 'Contacted', 'Qualified', 'Closed'] as Lead['status'][]
            ).map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                items={filteredLeads.filter((l) => l.status === status)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-96">
              <Search
                className="absolute left-3 top-2.5 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-blue-900 focus:border-blue-900"
              />
            </div>

            <div className="flex flex-wrap gap-2 w-full md:w-auto pb-2 md:pb-0">
              {['All', 'New', 'Contacted', 'Qualified', 'Closed'].map(
                (status) => (
                  <button
                    type="button"
                    key={status}
                    onClick={() => setFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                      filter === status
                        ? 'bg-blue-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {status}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredLeads.map((lead) => (
              <div key={lead.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-800 font-bold shrink-0">
                      {lead.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">
                        {lead.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {lead.score > 75 && (
                      <Flame
                        size={16}
                        className="text-orange-500 fill-orange-500"
                      />
                    )}
                    <span
                      className={`text-sm font-bold ${lead.score > 75 ? 'text-orange-600' : 'text-slate-600'}`}
                    >
                      {lead.score}
                    </span>
                  </div>
                </div>

                <div className="text-sm text-slate-600 space-y-1">
                  <div className="flex items-center gap-2">
                    <Mail size={14} className="text-slate-400" /> {lead.email}
                  </div>
                  {lead.phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-slate-400" />{' '}
                      {lead.phone}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-slate-500">
                    <UserIcon size={14} className="text-slate-400" /> Bot #
                    {lead.sourceBotId}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <select
                    value={lead.status}
                    onChange={(e) =>
                      handleStatusChange(
                        lead.id,
                        e.target.value as Lead['status'],
                      )
                    }
                    className={`text-xs font-semibold px-3 py-2 rounded-full focus:ring-0 cursor-pointer border w-full sm:w-auto ${getStatusColor(lead.status)}`}
                  >
                    <option value="New">New</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Qualified">Qualified</option>
                    <option value="Closed">Closed</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => openEmailModal(lead)}
                    className="px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition text-xs font-medium flex items-center gap-1 w-full sm:w-auto justify-center"
                  >
                    <Mail size={14} /> Email
                  </button>
                </div>
              </div>
            ))}
            {filteredLeads.length === 0 && (
              <div className="px-6 py-12 text-center text-slate-400">
                <UserIcon size={48} className="mx-auto mb-3 opacity-20" />
                <p>No leads found matching your criteria.</p>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">Lead Name</th>
                  <th className="px-6 py-3 font-semibold">Score</th>
                  <th className="px-6 py-3 font-semibold">Contact Info</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Source</th>
                  <th className="px-6 py-3 font-semibold text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-slate-50/80 transition group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-800 font-bold">
                          {lead.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">
                            {lead.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {new Date(lead.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {lead.score > 75 && (
                          <Flame
                            size={16}
                            className="text-orange-500 fill-orange-500"
                          />
                        )}
                        <span
                          className={`font-bold ${lead.score > 75 ? 'text-orange-600' : 'text-slate-600'}`}
                        >
                          {lead.score}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-slate-600">
                          <Mail size={14} className="text-slate-400" />{' '}
                          {lead.email}
                        </div>
                        {lead.phone && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Phone size={14} className="text-slate-400" />{' '}
                            {lead.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={lead.status}
                        onChange={(e) =>
                          handleStatusChange(
                            lead.id,
                            e.target.value as Lead['status'],
                          )
                        }
                        className={`text-xs font-semibold px-2 py-1 rounded-full focus:ring-0 cursor-pointer border ${getStatusColor(lead.status)}`}
                      >
                        <option value="New">New</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Qualified">Qualified</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      Bot #{lead.sourceBotId}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEmailModal(lead)}
                        className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition text-xs font-medium flex items-center gap-1 ml-auto"
                        title="Send Email"
                      >
                        <Mail size={14} /> Email
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredLeads.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-slate-400"
                    >
                      <UserIcon size={48} className="mx-auto mb-3 opacity-20" />
                      <p>No leads found matching your criteria.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
