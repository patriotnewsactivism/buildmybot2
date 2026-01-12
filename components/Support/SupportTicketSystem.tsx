import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Filter,
  Headphones,
  MessageCircle,
  Plus,
  Search,
  Send,
  Shield,
  Ticket,
  User,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { PlanType, type User as UserType } from '../../types';

interface Message {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string;
  senderType: 'customer' | 'staff';
  content: string;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: 'billing' | 'technical' | 'feature_request' | 'other';
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

interface SupportTicketSystemProps {
  user?: UserType;
}

const SLA_CONFIG: Record<
  PlanType,
  { responseHours: number; resolutionHours: number; label: string }
> = {
  [PlanType.FREE]: {
    responseHours: 72,
    resolutionHours: 168,
    label: 'Community',
  },
  [PlanType.STARTER]: {
    responseHours: 48,
    resolutionHours: 120,
    label: 'Email',
  },
  [PlanType.PROFESSIONAL]: {
    responseHours: 24,
    resolutionHours: 72,
    label: 'Priority',
  },
  [PlanType.EXECUTIVE]: {
    responseHours: 8,
    resolutionHours: 48,
    label: 'Priority+',
  },
  [PlanType.ENTERPRISE]: {
    responseHours: 4,
    resolutionHours: 24,
    label: 'Enterprise SLA',
  },
};

const PremiumCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}
  >
    {children}
  </div>
);

const StatusBadge: React.FC<{ status: SupportTicket['status'] }> = ({
  status,
}) => {
  const styles = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    resolved: 'bg-emerald-100 text-emerald-700',
    closed: 'bg-slate-100 text-slate-600',
  };
  const labels = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
  };
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
};

const PriorityBadge: React.FC<{ priority: SupportTicket['priority'] }> = ({
  priority,
}) => {
  const styles = {
    low: 'bg-slate-100 text-slate-600 border-slate-200',
    normal: 'bg-blue-50 text-blue-600 border-blue-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    urgent: 'bg-red-100 text-red-700 border-red-200',
  };
  const icons = {
    low: null,
    normal: null,
    high: <AlertTriangle size={12} />,
    urgent: <AlertCircle size={12} />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${styles[priority]}`}
    >
      {icons[priority]}
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
};

const SLAIndicator: React.FC<{
  ticket: SupportTicket;
  slaConfig: { responseHours: number };
}> = ({ ticket, slaConfig }) => {
  const createdAt = new Date(ticket.createdAt);
  const now = new Date();
  const hoursElapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  const slaDeadline = slaConfig.responseHours;

  const hasResponse = ticket.messages.some((m) => m.senderType === 'staff');

  if (
    hasResponse ||
    ticket.status === 'closed' ||
    ticket.status === 'resolved'
  ) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-medium">
        <CheckCircle size={12} />
        Within SLA
      </span>
    );
  }

  const percentUsed = (hoursElapsed / slaDeadline) * 100;

  if (percentUsed >= 100) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium animate-pulse">
        <XCircle size={12} />
        Breached
      </span>
    );
  }

  if (percentUsed >= 75) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-medium">
        <AlertTriangle size={12} />
        At Risk
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-medium">
      <CheckCircle size={12} />
      Within SLA
    </span>
  );
};

const SLACountdown: React.FC<{
  ticket: SupportTicket;
  slaConfig: { responseHours: number };
}> = ({ ticket, slaConfig }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const createdAt = new Date(ticket.createdAt);
      const deadline = new Date(
        createdAt.getTime() + slaConfig.responseHours * 60 * 60 * 1000,
      );
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('Overdue');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${hours}h ${minutes}m remaining`);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 60000);
    return () => clearInterval(interval);
  }, [ticket.createdAt, slaConfig.responseHours]);

  const hasResponse = ticket.messages.some((m) => m.senderType === 'staff');
  if (
    hasResponse ||
    ticket.status === 'closed' ||
    ticket.status === 'resolved'
  ) {
    return (
      <div className="flex items-center gap-2 text-emerald-600 text-sm">
        <CheckCircle size={16} />
        <span>Response received</span>
      </div>
    );
  }

  const isOverdue = timeLeft === 'Overdue';

  return (
    <div
      className={`flex items-center gap-2 text-sm ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}
    >
      <Clock size={16} className={isOverdue ? 'animate-pulse' : ''} />
      <span>{timeLeft}</span>
    </div>
  );
};

export const SupportTicketSystem: React.FC<SupportTicketSystemProps> = ({
  user,
}) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(
    null,
  );
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [newTicket, setNewTicket] = useState({
    subject: '',
    priority: 'normal' as SupportTicket['priority'],
    category: 'technical' as SupportTicket['category'],
    message: '',
  });

  const currentPlan = user?.plan || PlanType.FREE;
  const slaConfig = SLA_CONFIG[currentPlan];
  const subjectId = 'support-ticket-subject';
  const priorityId = 'support-ticket-priority';
  const categoryId = 'support-ticket-category';
  const messageId = 'support-ticket-message';

  useEffect(() => {
    const mockTickets: SupportTicket[] = [
      {
        id: '1',
        subject: 'Cannot integrate with my website',
        status: 'open',
        priority: 'high',
        category: 'technical',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        messages: [
          {
            id: 'm1',
            ticketId: '1',
            senderId: user?.id || 'user1',
            senderName: user?.name || 'Customer',
            senderType: 'customer',
            content:
              "I'm trying to embed the chatbot on my WordPress site but the widget isn't appearing. I've followed all the instructions in the documentation.",
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
      {
        id: '2',
        subject: 'Billing question about Pro plan',
        status: 'in_progress',
        priority: 'normal',
        category: 'billing',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        messages: [
          {
            id: 'm2',
            ticketId: '2',
            senderId: user?.id || 'user1',
            senderName: user?.name || 'Customer',
            senderType: 'customer',
            content:
              'I was charged twice for my subscription this month. Can you help?',
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: 'm3',
            ticketId: '2',
            senderId: 'staff1',
            senderName: 'Sarah (Support)',
            senderType: 'staff',
            content:
              "Hi there! I'm sorry to hear about the duplicate charge. I've looked into your account and can confirm there was a billing error. I've initiated a refund for the extra charge which should appear in 3-5 business days.",
            createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
      {
        id: '3',
        subject: 'Feature request: Slack integration',
        status: 'resolved',
        priority: 'low',
        category: 'feature_request',
        createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        messages: [
          {
            id: 'm4',
            ticketId: '3',
            senderId: user?.id || 'user1',
            senderName: user?.name || 'Customer',
            senderType: 'customer',
            content:
              'Would love to see a Slack integration for lead notifications!',
            createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: 'm5',
            ticketId: '3',
            senderId: 'staff2',
            senderName: 'Mike (Product)',
            senderType: 'staff',
            content:
              "Great suggestion! I've added this to our product roadmap. Slack integration is planned for Q2. Thanks for your feedback!",
            createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
    ];
    setTickets(mockTickets);
  }, [user]);

  const filteredTickets = tickets.filter((ticket) => {
    const matchesStatus =
      filterStatus === 'all' || ticket.status === filterStatus;
    const matchesSearch =
      searchQuery === '' ||
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleCreateTicket = () => {
    if (!newTicket.subject.trim() || !newTicket.message.trim()) return;

    setIsLoading(true);

    setTimeout(() => {
      const ticket: SupportTicket = {
        id: `ticket-${Date.now()}`,
        subject: newTicket.subject,
        status: 'open',
        priority: newTicket.priority,
        category: newTicket.category,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: `msg-${Date.now()}`,
            ticketId: `ticket-${Date.now()}`,
            senderId: user?.id || 'user1',
            senderName: user?.name || 'Customer',
            senderType: 'customer',
            content: newTicket.message,
            createdAt: new Date().toISOString(),
          },
        ],
      };

      setTickets([ticket, ...tickets]);
      setShowCreateModal(false);
      setNewTicket({
        subject: '',
        priority: 'normal',
        category: 'technical',
        message: '',
      });
      setIsLoading(false);
    }, 500);
  };

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedTicket) return;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      ticketId: selectedTicket.id,
      senderId: user?.id || 'user1',
      senderName: user?.name || 'Customer',
      senderType: 'customer',
      content: replyText,
      createdAt: new Date().toISOString(),
    };

    const updatedTicket = {
      ...selectedTicket,
      messages: [...selectedTicket.messages, newMessage],
      updatedAt: new Date().toISOString(),
    };

    setTickets(
      tickets.map((t) => (t.id === selectedTicket.id ? updatedTicket : t)),
    );
    setSelectedTicket(updatedTicket);
    setReplyText('');
  };

  const handleStatusChange = (
    ticketId: string,
    newStatus: SupportTicket['status'],
  ) => {
    setTickets(
      tickets.map((t) =>
        t.id === ticketId
          ? { ...t, status: newStatus, updatedAt: new Date().toISOString() }
          : t,
      ),
    );
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket({
        ...selectedTicket,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-7xl mx-auto space-y-4 md:space-y-6 animate-fade-in px-2 md:px-0">
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl md:rounded-2xl p-4 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-transparent to-amber-500/10" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-amber-500/20 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-emerald-400 text-sm font-medium">
              {slaConfig.label} Support
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white via-orange-100 to-amber-200 bg-clip-text text-transparent">
            Support Center
          </h1>
          <p className="text-slate-400 mt-2 text-lg">{currentDate}</p>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Shield size={16} className="text-emerald-400" />
              <span>{slaConfig.responseHours}h Response SLA</span>
            </div>
            <div className="w-px h-4 bg-slate-700 hidden md:block" />
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Zap size={16} className="text-amber-400" />
              <span>
                {tickets.filter((t) => t.status === 'open').length} Open Tickets
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2 space-y-4">
          <PremiumCard className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-bold text-slate-900">Your Tickets</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <input
                    type="text"
                    placeholder="Search tickets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 w-full sm:w-48"
                  />
                </div>
                <div className="relative">
                  <Filter
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                  />
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="pl-9 pr-8 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 appearance-none bg-white cursor-pointer"
                  >
                    <option value="all">All Status</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-lg hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25"
                >
                  <Plus size={18} />
                  <span>New Ticket</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {filteredTickets.length === 0 ? (
                <div className="text-center py-12">
                  <div className="p-4 bg-slate-100 rounded-full w-fit mx-auto mb-4">
                    <Ticket className="text-slate-400" size={32} />
                  </div>
                  <p className="text-slate-600 font-medium">No tickets found</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Create a new ticket to get started
                  </p>
                </div>
              ) : (
                filteredTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className={`border rounded-lg transition-all duration-200 ${
                      selectedTicket?.id === ticket.id
                        ? 'border-orange-300 bg-orange-50/30'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full text-left p-4 cursor-pointer"
                      onClick={() => {
                        setSelectedTicket(ticket);
                        setExpandedTicketId(
                          expandedTicketId === ticket.id ? null : ticket.id,
                        );
                      }}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-slate-900 truncate">
                              {ticket.subject}
                            </h4>
                            <PriorityBadge priority={ticket.priority} />
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-sm text-slate-500 flex-wrap">
                            <span className="capitalize">
                              {ticket.category.replace('_', ' ')}
                            </span>
                            <span>•</span>
                            <span>Created {formatDate(ticket.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <SLAIndicator ticket={ticket} slaConfig={slaConfig} />
                          <StatusBadge status={ticket.status} />
                          {expandedTicketId === ticket.id ? (
                            <ChevronUp className="text-slate-400" size={20} />
                          ) : (
                            <ChevronDown className="text-slate-400" size={20} />
                          )}
                        </div>
                      </div>
                    </button>

                    {expandedTicketId === ticket.id && (
                      <div className="border-t border-slate-100 p-4 bg-slate-50/50">
                        <div className="space-y-4 max-h-64 overflow-y-auto mb-4">
                          {ticket.messages.map((message) => (
                            <div
                              key={message.id}
                              className={`flex ${message.senderType === 'customer' ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[80%] p-3 rounded-lg ${
                                  message.senderType === 'customer'
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-white border border-slate-200'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  {message.senderType === 'staff' ? (
                                    <Headphones
                                      size={14}
                                      className="text-orange-500"
                                    />
                                  ) : (
                                    <User size={14} />
                                  )}
                                  <span
                                    className={`text-xs font-medium ${message.senderType === 'customer' ? 'text-orange-100' : 'text-slate-600'}`}
                                  >
                                    {message.senderName}
                                  </span>
                                  <span
                                    className={`text-xs ${message.senderType === 'customer' ? 'text-orange-200' : 'text-slate-400'}`}
                                  >
                                    {formatDate(message.createdAt)}
                                  </span>
                                </div>
                                <p
                                  className={`text-sm ${message.senderType === 'customer' ? 'text-white' : 'text-slate-700'}`}
                                >
                                  {message.content}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Type your reply..."
                            value={
                              selectedTicket?.id === ticket.id ? replyText : ''
                            }
                            onChange={(e) => {
                              setSelectedTicket(ticket);
                              setReplyText(e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendReply();
                              }
                            }}
                            className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTicket(ticket);
                              handleSendReply();
                            }}
                            className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                          >
                            <Send size={18} />
                          </button>
                        </div>

                        {ticket.status !== 'closed' && (
                          <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
                            <SLACountdown
                              ticket={ticket}
                              slaConfig={slaConfig}
                            />
                            <select
                              value={ticket.status}
                              onChange={(e) =>
                                handleStatusChange(
                                  ticket.id,
                                  e.target.value as SupportTicket['status'],
                                )
                              }
                              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                            >
                              <option value="open">Open</option>
                              <option value="in_progress">In Progress</option>
                              <option value="resolved">Resolved</option>
                              <option value="closed">Closed</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </PremiumCard>
        </div>

        <div className="space-y-4">
          <PremiumCard className="p-4 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
                <Shield className="text-white" size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Your SLA</h3>
                <p className="text-sm text-slate-500">
                  {PLANS[currentPlan]?.name || 'Free'} Plan
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">First Response</span>
                  <span className="font-semibold text-slate-900">
                    {slaConfig.responseHours}h
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-orange-500 to-amber-500 h-2 rounded-full"
                    style={{
                      width: `${100 - (slaConfig.responseHours / 72) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">
                    Resolution Time
                  </span>
                  <span className="font-semibold text-slate-900">
                    {slaConfig.resolutionHours}h
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-orange-500 to-amber-500 h-2 rounded-full"
                    style={{
                      width: `${100 - (slaConfig.resolutionHours / 168) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2 text-slate-700">
                  <MessageCircle size={16} className="text-orange-500" />
                  <span className="text-sm font-medium">
                    {slaConfig.label} Support
                  </span>
                </div>
              </div>
            </div>
          </PremiumCard>

          {currentPlan !== PlanType.ENTERPRISE && (
            <PremiumCard className="p-4 md:p-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
                <Crown size={14} />
                <span>Upgrade for Better SLA</span>
              </div>
              <h4 className="text-lg font-bold mb-2">Need Faster Support?</h4>
              <p className="text-slate-400 text-sm mb-4">
                Upgrade to get priority access and faster response times.
              </p>

              <div className="space-y-2 mb-4">
                {currentPlan === PlanType.FREE && (
                  <>
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <ArrowUp size={14} className="text-amber-400" />
                      <span>Starter: 48h → Priority email</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <ArrowUp size={14} className="text-amber-400" />
                      <span>Professional: 24h → Priority chat</span>
                    </div>
                  </>
                )}
                {currentPlan === PlanType.STARTER && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <ArrowUp size={14} className="text-amber-400" />
                    <span>Professional: 24h response + chat support</span>
                  </div>
                )}
                {currentPlan === PlanType.PROFESSIONAL && (
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <ArrowUp size={14} className="text-amber-400" />
                    <span>Enterprise: 4h response + dedicated manager</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="w-full py-2 px-4 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 font-semibold rounded-lg hover:from-amber-300 hover:to-orange-400 transition-all"
              >
                View Upgrade Options
              </button>
            </PremiumCard>
          )}

          <PremiumCard className="p-4 md:p-6">
            <h4 className="font-bold text-slate-900 mb-3">Quick Stats</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Tickets</span>
                <span className="font-semibold text-slate-900">
                  {tickets.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Open</span>
                <span className="font-semibold text-blue-600">
                  {tickets.filter((t) => t.status === 'open').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">In Progress</span>
                <span className="font-semibold text-amber-600">
                  {tickets.filter((t) => t.status === 'in_progress').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Resolved</span>
                <span className="font-semibold text-emerald-600">
                  {
                    tickets.filter(
                      (t) => t.status === 'resolved' || t.status === 'closed',
                    ).length
                  }
                </span>
              </div>
            </div>
          </PremiumCard>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">
                  Create Support Ticket
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label
                  className="block text-sm font-medium text-slate-700 mb-2"
                  htmlFor={subjectId}
                >
                  Subject
                </label>
                <input
                  id={subjectId}
                  type="text"
                  value={newTicket.subject}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, subject: e.target.value })
                  }
                  placeholder="Brief description of your issue"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-sm font-medium text-slate-700 mb-2"
                    htmlFor={priorityId}
                  >
                    Priority
                  </label>
                  <select
                    id={priorityId}
                    value={newTicket.priority}
                    onChange={(e) =>
                      setNewTicket({
                        ...newTicket,
                        priority: e.target.value as SupportTicket['priority'],
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-slate-700 mb-2"
                    htmlFor={categoryId}
                  >
                    Category
                  </label>
                  <select
                    id={categoryId}
                    value={newTicket.category}
                    onChange={(e) =>
                      setNewTicket({
                        ...newTicket,
                        category: e.target.value as SupportTicket['category'],
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                  >
                    <option value="billing">Billing</option>
                    <option value="technical">Technical</option>
                    <option value="feature_request">Feature Request</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-slate-700 mb-2"
                  htmlFor={messageId}
                >
                  Message
                </label>
                <textarea
                  id={messageId}
                  value={newTicket.message}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, message: e.target.value })
                  }
                  placeholder="Describe your issue in detail..."
                  rows={5}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                />
              </div>

              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock size={16} className="text-orange-500" />
                  <span>
                    Expected first response: within{' '}
                    <strong>{slaConfig.responseHours} hours</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateTicket}
                disabled={
                  !newTicket.subject.trim() ||
                  !newTicket.message.trim() ||
                  isLoading
                }
                className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Submit Ticket</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PLANS: Record<PlanType, { name: string }> = {
  [PlanType.FREE]: { name: 'Free Tier' },
  [PlanType.STARTER]: { name: 'Starter' },
  [PlanType.PROFESSIONAL]: { name: 'Professional' },
  [PlanType.EXECUTIVE]: { name: 'Executive' },
  [PlanType.ENTERPRISE]: { name: 'Enterprise' },
};

export default SupportTicketSystem;
