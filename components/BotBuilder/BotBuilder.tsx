import {
  Bot as BotIcon,
  Briefcase,
  Building2,
  ChevronDown,
  Clock,
  Code,
  DollarSign,
  ExternalLink,
  Facebook,
  File,
  FileText,
  FileType,
  Globe,
  Image as ImageIcon,
  Layout,
  LayoutTemplate,
  Link,
  Linkedin,
  Loader2,
  type LucideIcon,
  Menu,
  MessageSquare,
  Monitor,
  Phone,
  Plane,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  Share2,
  Shield,
  Sparkles,
  Trash2,
  Twitter,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AVAILABLE_MODELS } from '../../constants';
import { dbService } from '../../services/dbService';
import {
  generateBotResponseDemo,
  scrapeWebsiteContent,
} from '../../services/openaiService';
import type { BotDocument, Bot as BotType } from '../../types';
import { SaveIndicator } from '../UI/SaveIndicator';
import { KnowledgeBaseManager } from './KnowledgeBaseManager';
import SimplifiedBotWizard from "./SimplifiedBotWizard";
import { VoiceAgentConfigComponent } from './VoiceAgentConfig';

interface BotBuilderProps {
  bots: BotType[];
  onSave: (bot: BotType) => Promise<BotType>;
  customDomain?: string;
  onLeadDetected?: (email: string) => void;
  onRefresh?: () => Promise<void>;
}

type BotBuilderTab = 'config' | 'knowledge' | 'voice' | 'embed' | 'test';

type TabConfig = {
  id: BotBuilderTab;
  label: string;
  fullLabel: string;
  icon: LucideIcon;
};

const HUMAN_NAMES = [
  'Sarah',
  'Michael',
  'Jessica',
  'David',
  'Emma',
  'James',
  'Emily',
  'Robert',
];
const AVATAR_COLORS = [
  '#1e3a8a',
  '#be123c',
  '#047857',
  '#d97706',
  '#7c3aed',
  '#db2777',
];

const PERSONAS = [
  {
    id: 'support',
    name: 'Customer Support Agent',
    prompt:
      'You are a helpful customer support agent for {company}. Be polite, patient, and concise. Your goal is to resolve issues quickly. If you do not know the answer, ask for their contact info.',
  },
  {
    id: 'sales',
    name: 'Sales Representative',
    prompt:
      'You are a top-performing sales representative for {company}. Your goal is to qualify leads and close deals. Be persuasive but not pushy. Focus on value and benefits. Always try to get a meeting booked.',
  },
  {
    id: 'receptionist',
    name: 'AI Receptionist',
    prompt:
      'You are the front desk receptionist for {company}. Be warm and welcoming. Help schedule appointments and route calls. Keep responses short and professional.',
  },
  {
    id: 'city_gov',
    name: 'City Services Agent',
    prompt:
      'You are the official AI agent for {company} (City Government). Assist citizens with utility bill payments, trash pickup schedules, and permit applications. Be authoritative, helpful, and community-focused. If a citizen reports an emergency, tell them to dial 911 immediately.',
  },
  {
    id: 'hr',
    name: 'HR Assistant',
    prompt:
      'You are a Human Resources assistant. Answer employee questions about benefits, holidays, and company policy. Maintain strict confidentiality and professionalism.',
  },
  {
    id: 'tech',
    name: 'Technical Support',
    prompt:
      'You are a Tier 1 Technical Support agent. Walk users through troubleshooting steps logically. Ask clarifying questions to diagnose the issue.',
  },
  {
    id: 'scheduler',
    name: 'Appointment Scheduler',
    prompt:
      'You are a dedicated scheduling assistant for {company}. Your primary goal is to book appointments. Be efficient and accommodating. Always offer specific time slots and confirm details.',
  },
  {
    id: 'product',
    name: 'Product Specialist',
    prompt:
      'You are an expert product specialist for {company}. Assist customers in finding the perfect product. Ask about their needs, compare options, and explain benefits clearly.',
  },
  {
    id: 'realestate',
    name: 'Real Estate Agent',
    prompt:
      'You are a knowledgeable real estate agent for {company}. Qualify buyers by asking about budget, location, and preferences. Schedule property viewings.',
  },
  {
    id: 'legal',
    name: 'Legal Intake',
    prompt:
      'You are a legal intake specialist for {company}. Collect potential client details and case information with empathy and discretion. Do not provide legal advice.',
  },
  {
    id: 'coach',
    name: 'Lifestyle Coach',
    prompt:
      'You are a lifestyle and wellness coach representing {company}. Motivate users, track progress, and provide encouraging feedback. Maintain a positive, energetic tone.',
  },
  {
    id: 'recruiter',
    name: 'Recruitment Assistant',
    prompt:
      'You are a recruitment assistant for {company}. Screen candidates by asking about their experience, availability, and skills. Be professional, encouraging, and efficient. If they seem qualified, ask for their email to schedule an interview.',
  },
  {
    id: 'travel',
    name: 'Travel Concierge',
    prompt:
      'You are a knowledgeable travel concierge for {company}. Help users plan their perfect trip by asking about their budget, preferred climate, and interests. Suggest destinations and activities. Be enthusiastic and descriptive.',
  },
  {
    id: 'financial',
    name: 'Financial Guide',
    prompt:
      'You are a financial guide for {company}. Help users understand our banking products, credit cards, and loan options. Explain complex terms simply. Be trustworthy and precise. Do not give personal investment advice.',
  },
];

export const BotBuilder: React.FC<BotBuilderProps> = ({
  bots,
  onSave,
  customDomain,
  onLeadDetected,
  onRefresh,
}) => {
  const [showWizard, setShowWizard] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState<string>(
    bots[0]?.id || 'new',
  );
  // Initialize with the selected bot or a default new one
  const [activeBot, setActiveBot] = useState<BotType>(
    bots[0] || {
      id: 'new',
      name: 'New Assistant',
      type: 'Customer Support',
      systemPrompt: 'You are a helpful customer support assistant.',
      model: 'gpt-5o-mini',
      temperature: 0.9,
      knowledgeBase: [],
      active: true,
      conversationsCount: 0,
      themeColor: '#1e3a8a',
      maxMessages: 20,
      randomizeIdentity: true,
      avatar: '',
      responseDelay: 2000,
      embedType: 'hover',
    },
  );

  const [activeTab, setActiveTab] = useState<BotBuilderTab>('config');
  const [testInput, setTestInput] = useState('');
  const [testHistory, setTestHistory] = useState<
    { role: 'user' | 'model'; text: string; timestamp: number }[]
  >([]);
  const [isTesting, setIsTesting] = useState(false);

  // Knowledge Base State
  const [kbInput, setKbInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isScraping, setIsScraping] = useState(false);

  // Document Upload State
  const [documents, setDocuments] = useState<BotDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Embed Config State
  const [embedConfig, setEmbedConfig] = useState({
    position: 'bottom-right',
    welcomeMessage: 'Hi there! How can I help you today?',
    buttonStyle: 'rounded-full',
  });

  // Mobile bot selector state
  const [showMobileBotSelector, setShowMobileBotSelector] = useState(false);

  // Random identity for preview
  const [previewIdentity, setPreviewIdentity] = useState({
    name: 'Bot',
    color: '#1e3a8a',
  });

  // Save state management
  type SaveState = 'idle' | 'saving' | 'saved' | 'error';
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Determine domain for snippets
  const displayDomain =
    customDomain ||
    (typeof window !== 'undefined'
      ? window.location.host
      : 'www.buildmybot.app');
  // Real working link
  const shareLink = `${window.location.protocol}//${displayDomain}/chat/${activeBot.id}`;

  // Sync activeBot with props when bots are updated (e.g., after save returns server-generated UUID)
  useEffect(() => {
    if (activeBot.id === 'new' || selectedBotId === 'new') {
      // If we just saved a new bot, find it in the updated bots list by name
      const savedBot = bots.find(
        (b) => b.name === activeBot.name && b.id !== 'new',
      );
      if (savedBot) {
        setActiveBot(savedBot);
        setSelectedBotId(savedBot.id);
      }
    } else if (selectedBotId && selectedBotId !== 'new') {
      // Update activeBot if the matching bot in props changed
      const updatedBot = bots.find((b) => b.id === selectedBotId);
      if (
        updatedBot &&
        JSON.stringify(updatedBot) !== JSON.stringify(activeBot)
      ) {
        setActiveBot(updatedBot);
      }
    }
  }, [bots, activeBot, selectedBotId]);

  useEffect(() => {
    if (activeBot.randomizeIdentity) {
      const randomName =
        HUMAN_NAMES[Math.floor(Math.random() * HUMAN_NAMES.length)];
      const randomColor =
        AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      setPreviewIdentity({ name: randomName, color: randomColor });
    } else {
      setPreviewIdentity({ name: activeBot.name, color: activeBot.themeColor });
    }
  }, [activeBot.randomizeIdentity, activeBot.name, activeBot.themeColor]);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    const shouldScroll = testHistory.length > 0 || isTesting;
    if (shouldScroll) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [testHistory.length, isTesting]);

  useEffect(() => {
    if (selectedBotId && selectedBotId !== 'new') {
      dbService.getBotDocuments(selectedBotId).then(setDocuments);
    } else {
      setDocuments([]);
    }
  }, [selectedBotId]);

  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (
        !files ||
        files.length === 0 ||
        !activeBot.id ||
        activeBot.id === 'new'
      ) {
        if (activeBot.id === 'new') {
          alert('Please save the bot first before uploading documents.');
        }
        return;
      }

      const file = files[0];
      const allowedTypes = ['.pdf', '.docx', '.txt'];
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

      if (!allowedTypes.includes(ext)) {
        alert('Only PDF, DOCX, and TXT files are allowed.');
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      try {
        const newDoc = await dbService.uploadBotDocument(
          activeBot.id,
          file,
          setUploadProgress,
        );
        if (newDoc) {
          setDocuments((prev) => [newDoc, ...prev]);
        }
      } catch (error) {
        console.error('Upload error:', error);
        alert('Failed to upload document');
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [activeBot.id],
  );

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    const success = await dbService.deleteBotDocument(docId);
    if (success) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } else {
      alert('Failed to delete document');
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFileUpload(e.dataTransfer.files);
    },
    [handleFileUpload],
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return <FileText className="text-red-500" size={20} />;
      case 'docx':
      case 'doc':
        return <FileType className="text-blue-500" size={20} />;
      case 'txt':
        return <File className="text-slate-500" size={20} />;
      default:
        return <File className="text-slate-400" size={20} />;
    }
  };

  const handleBotSelect = (bot: BotType) => {
    setSelectedBotId(bot.id);
    setActiveBot(bot);
    setTestHistory([]);
  };

  const handleSaveBot = async () => {
    // Validation
    if (!activeBot.name?.trim()) {
      setSaveState('error');
      setSaveError('Bot name is required');
      setTimeout(() => {
        setSaveState('idle');
        setSaveError(null);
      }, 3000);
      return;
    }

    if (!activeBot.systemPrompt?.trim()) {
      setSaveState('error');
      setSaveError('System prompt is required');
      setTimeout(() => {
        setSaveState('idle');
        setSaveError(null);
      }, 3000);
      return;
    }

    setSaveState('saving');
    setSaveError(null);

    try {
      const botToSave = { ...activeBot };
      const savedBot = await onSave(botToSave);

      // Update local state with saved bot (including server-generated ID)
      setActiveBot(savedBot);
      if (savedBot.id !== 'new' && selectedBotId === 'new') {
        setSelectedBotId(savedBot.id);
      }

      setSaveState('saved');
      setLastSaved(new Date());

      // Auto-reset to idle after 3 seconds
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (error) {
      setSaveState('error');
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Failed to save bot. Please try again.',
      );
    }
  };

  const handleApplyPersona = (personaId: string) => {
    const persona = PERSONAS.find((p) => p.id === personaId);
    if (persona) {
      setActiveBot({
        ...activeBot,
        systemPrompt: persona.prompt.replace('{company}', 'our organization'),
        type: persona.name,
      });
    }
  };

  const handleAddKnowledge = () => {
    if (!kbInput.trim()) return;
    setActiveBot({
      ...activeBot,
      knowledgeBase: [...(activeBot.knowledgeBase || []), kbInput],
    });
    setKbInput('');
  };

  const handleScrapeUrl = async () => {
    if (!urlInput.trim()) return;
    setIsScraping(true);

    try {
      const extractedData = await scrapeWebsiteContent(urlInput);
      setActiveBot({
        ...activeBot,
        knowledgeBase: [...(activeBot.knowledgeBase || []), extractedData],
      });
      setUrlInput('');
    } catch (error) {
      console.error('Scrape failed', error);
      alert('Failed to scrape website. Please check the URL and try again.');
    } finally {
      setIsScraping(false);
    }
  };

  const handleTestSend = async () => {
    if (!testInput.trim()) return;

    // Check for "hot lead" triggers (simple regex for email)
    const emailMatch = testInput.match(
      /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi,
    );
    if (emailMatch && onLeadDetected) {
      onLeadDetected(emailMatch[0]);
    }

    const newMessage = {
      role: 'user' as const,
      text: testInput,
      timestamp: Date.now(),
    };
    const updatedHistory = [...testHistory, newMessage];

    setTestHistory(updatedHistory);
    setTestInput('');
    setIsTesting(true);

    try {
      const context = activeBot.knowledgeBase.join('\n\n');
      const response = await generateBotResponseDemo(
        activeBot.systemPrompt,
        updatedHistory,
        newMessage.text,
        activeBot.model,
        context,
      );

      // Use configured delay
      setTimeout(() => {
        setTestHistory((prev) => [
          ...prev,
          { role: 'model', text: response, timestamp: Date.now() },
        ]);
        setIsTesting(false);
      }, activeBot.responseDelay || 1500);
    } catch (e) {
      setIsTesting(false);
    }
  };

  // Embed script snippet
  const embedCode = `<script>
  window.bmbConfig = {
    botId: "${activeBot.id}",
    theme: "${activeBot.themeColor}",
    domain: "${displayDomain}"
  };
</script>
<script src="https://${displayDomain}/embed.js" async></script>`;

  const handleMobileBotSelect = (bot: BotType) => {
    handleBotSelect(bot);
    setShowMobileBotSelector(false);
  };

  const tabs: TabConfig[] = [
    {
      id: 'config',
      label: 'Config',
      fullLabel: 'Configuration',
      icon: Settings,
    },
    {
      id: 'knowledge',
      label: 'KB',
      fullLabel: 'Knowledge Base',
      icon: FileText,
    },
    {
      id: 'voice',
      label: 'Voice',
      fullLabel: 'Voice Agent',
      icon: Phone,
    },
    {
      id: 'embed',
      label: 'Embed',
      fullLabel: 'Embed & Share',
      icon: Share2,
    },
    { id: 'test', label: 'Test', fullLabel: 'Test Bot', icon: Play },
  ];

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-4 md:gap-6 animate-fade-in overflow-x-hidden">
      {/* Mobile Bot Selector */}
      <div className="md:hidden">
        <div className="w-full flex items-center justify-between bg-white rounded-xl shadow-sm border border-slate-200 p-3 min-h-[56px]">
          <button
            type="button"
            onClick={() => setShowMobileBotSelector(!showMobileBotSelector)}
            className="flex items-center gap-3 flex-1"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: activeBot.themeColor }}
            >
              {activeBot.name.substring(0, 2)}
            </div>
            <div className="text-left">
              <div className="font-semibold text-slate-800">
                {activeBot.name}
              </div>
              <div className="text-xs text-slate-500">{activeBot.type}</div>
            </div>
            <ChevronDown
              size={20}
              className={`text-slate-400 transition-transform ml-auto ${showMobileBotSelector ? 'rotate-180' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition min-h-[44px] min-w-[44px] flex items-center justify-center ml-2"
            title="Quick Start Wizard"
          >
            <Sparkles size={18} />
          </button>
        </div>

        {/* Mobile Bot Dropdown */}
        {showMobileBotSelector && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 mt-2 max-h-[40vh] overflow-y-auto">
            {bots.map((bot) => (
              <button
                type="button"
                key={bot.id}
                onClick={() => handleMobileBotSelect(bot)}
                className={`w-full text-left p-4 flex items-center gap-3 border-b border-slate-100 last:border-b-0 min-h-[60px] ${selectedBotId === bot.id ? 'bg-blue-50' : 'active:bg-slate-50'}`}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: bot.themeColor }}
                >
                  {bot.name.substring(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`font-medium text-sm truncate ${selectedBotId === bot.id ? 'text-blue-900' : 'text-slate-700'}`}
                  >
                    {bot.name}
                  </div>
                  <div className="text-xs text-slate-500">{bot.type}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop Sidebar List - Professional Design */}
      <div className="w-64 bg-white rounded-lg shadow-sm border border-slate-200 flex-col overflow-hidden hidden md:flex relative z-10 flex-shrink-0">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <BotIcon size={18} className="text-blue-600" />
            My Bots
          </h3>
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all shadow-sm min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Quick Start Wizard"
          >
            <Sparkles size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {bots.map((bot) => (
            <button
              type="button"
              key={bot.id}
              onClick={() => handleBotSelect(bot)}
              className={`w-full text-left p-4 rounded-md flex items-center gap-3 transition-all duration-200 min-h-[60px] group ${selectedBotId === bot.id ? 'bg-blue-50 border-2 border-blue-600 shadow-sm' : 'bg-white border-2 border-transparent hover:border-slate-200 hover:shadow-sm'}`}
            >
              <div className={`w-12 h-12 rounded-md bg-blue-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 shadow-sm ${selectedBotId === bot.id ? '' : 'group-hover:bg-blue-700'}`}>
                {bot.name.substring(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`font-semibold text-sm truncate ${selectedBotId === bot.id ? 'text-blue-700' : 'text-slate-900'}`}
                >
                  {bot.name}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${bot.active ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-600'}`}
                  >
                    {bot.active ? 'Active' : 'Draft'}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        {/* Editor Header - Professional Design */}
        <div className="min-h-20 border-b border-slate-200 px-4 md:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 relative overflow-hidden">
          <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1 relative z-10">
            {/* Bot avatar */}
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-md bg-blue-600 flex items-center justify-center text-white shadow-sm">
                <BotIcon size={24} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={activeBot.name}
                onChange={(e) =>
                  setActiveBot({ ...activeBot, name: e.target.value })
                }
                className="font-semibold text-xl text-slate-900 bg-transparent border-none p-0 focus:ring-0 placeholder-slate-400 w-full truncate"
                placeholder="Bot Name"
              />
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${activeBot.active ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-600'}`}
                >
                  {activeBot.active ? '● Live' : '○ Draft'}
                </span>
                <span className="text-xs text-slate-600 font-medium">{activeBot.model}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3 items-center w-full sm:w-auto relative z-10">
            <button
              type="button"
              onClick={handleSaveBot}
              disabled={saveState === 'saving'}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold transition-all shadow-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={18} />{' '}
              <span className="hidden sm:inline">Save Bot</span>
              <span className="sm:hidden">Save</span>
            </button>
            <SaveIndicator
              state={saveState}
              lastSaved={lastSaved}
              error={saveError}
            />
          </div>
        </div>

        {/* Tabs - Professional Design */}
        <div className="border-b border-slate-200 bg-white px-3 md:px-6 flex flex-wrap md:flex-nowrap gap-1 md:gap-6 overflow-x-hidden">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 md:py-4 px-4 md:px-6 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all duration-200 whitespace-nowrap min-h-[48px] ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-blue-600 hover:border-slate-300'
              }`}
            >
              <tab.icon size={18} className="flex-shrink-0" />
              <span className="md:hidden">{tab.label}</span>
              <span className="hidden md:inline">{tab.fullLabel}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50">
          {activeTab === 'config' && (
            <div className="max-w-3xl mx-auto space-y-4 md:space-y-6 animate-fade-in">
              {/* Persona Selector */}
              <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base">
                  <Users size={18} className="text-blue-900" /> AI Staff Persona
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
                  {PERSONAS.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => handleApplyPersona(p.id)}
                      className={`text-left p-3 rounded-lg border text-sm transition hover:shadow-md relative overflow-hidden min-h-[60px] ${activeBot.type === p.name ? 'border-blue-900 bg-blue-50 ring-1 ring-blue-900' : 'border-slate-200 bg-slate-50 hover:bg-white active:bg-slate-100'}`}
                    >
                      {p.id === 'batesville' && (
                        <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded-bl-lg font-bold">
                          DEMO
                        </div>
                      )}
                      <div className="font-semibold text-slate-900 flex items-center gap-1 text-xs md:text-sm">
                        {p.id.includes('city') || p.id === 'batesville' ? (
                          <Building2
                            size={12}
                            className="text-blue-600 flex-shrink-0"
                          />
                        ) : null}
                        {p.id === 'recruiter' ? (
                          <Briefcase
                            size={12}
                            className="text-blue-600 flex-shrink-0"
                          />
                        ) : null}
                        {p.id === 'travel' ? (
                          <Plane
                            size={12}
                            className="text-blue-600 flex-shrink-0"
                          />
                        ) : null}
                        {p.id === 'financial' ? (
                          <DollarSign
                            size={12}
                            className="text-blue-600 flex-shrink-0"
                          />
                        ) : null}
                        <span className="truncate">{p.name}</span>
                      </div>
                      <div className="text-[10px] md:text-xs text-slate-500 mt-1 truncate">
                        Apply preset
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-3 md:mb-4 text-sm md:text-base">
                  Core Behavior
                </h3>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="bot-builder-system-prompt"
                      className="block text-sm font-medium text-slate-700 mb-2"
                    >
                      System Prompt
                    </label>
                    <textarea
                      id="bot-builder-system-prompt"
                      value={activeBot.systemPrompt}
                      onChange={(e) =>
                        setActiveBot({
                          ...activeBot,
                          systemPrompt: e.target.value,
                        })
                      }
                      className="w-full h-32 rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900 p-3 text-base md:text-sm"
                      placeholder="You are a helpful assistant..."
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      These instructions define how the bot behaves.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div>
                      <label
                        htmlFor="bot-builder-model"
                        className="block text-sm font-medium text-slate-700 mb-2"
                      >
                        AI Model
                      </label>
                      <select
                        id="bot-builder-model"
                        value={activeBot.model}
                        onChange={(e) =>
                          setActiveBot({ ...activeBot, model: e.target.value })
                        }
                        className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900 text-base md:text-sm min-h-[48px] md:min-h-0"
                      >
                        {AVAILABLE_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="bot-builder-temperature"
                        className="block text-sm font-medium text-slate-700 mb-2"
                      >
                        Creativity (Temperature)
                      </label>
                      <input
                        id="bot-builder-temperature"
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={activeBot.temperature}
                        onChange={(e) =>
                          setActiveBot({
                            ...activeBot,
                            temperature: Number.parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-blue-900 h-6"
                      />
                      <div className="flex justify-between text-xs text-slate-400 mt-1">
                        <span>Precise</span>
                        <span>Balanced</span>
                        <span>Creative</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Sparkles size={18} className="text-blue-900" /> Human-Like
                  Behavior
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label
                        htmlFor="bot-builder-randomize"
                        className="text-sm font-medium text-slate-700"
                      >
                        Randomize Identity
                      </label>
                      <p className="text-xs text-slate-500">
                        Bot uses different names/avatars per session to feel
                        human.
                      </p>
                    </div>
                    <input
                      id="bot-builder-randomize"
                      type="checkbox"
                      checked={activeBot.randomizeIdentity}
                      onChange={(e) =>
                        setActiveBot({
                          ...activeBot,
                          randomizeIdentity: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded text-blue-900 focus:ring-blue-900"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="bot-builder-typing-delay"
                      className="text-sm font-medium text-slate-700 mb-2 block"
                    >
                      Typing Delay (ms)
                    </label>
                    <input
                      id="bot-builder-typing-delay"
                      type="range"
                      min="0"
                      max="5000"
                      step="500"
                      value={activeBot.responseDelay || 2000}
                      onChange={(e) =>
                        setActiveBot({
                          ...activeBot,
                          responseDelay: Number.parseInt(e.target.value),
                        })
                      }
                      className="w-full accent-blue-900"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>Instant (Bot)</span>
                      <span>{activeBot.responseDelay}ms</span>
                      <span>Slow (Human)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <MessageSquare size={18} className="text-blue-900" /> Chatbot
                  Display Type
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  Choose how the chatbot appears on your website.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveBot({ ...activeBot, embedType: 'hover' })
                    }
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      activeBot.embedType === 'hover' || !activeBot.embedType
                        ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                        <MessageSquare size={24} className="text-blue-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">
                          Floating Bubble
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          A small chat bubble appears in the corner. Visitors
                          click to open the chat window.
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveBot({ ...activeBot, embedType: 'fixed' })
                    }
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      activeBot.embedType === 'fixed'
                        ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                        <Layout size={24} className="text-emerald-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">
                          Fixed Embed
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Chat window is always visible on the page. Great for
                          dedicated support pages.
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'knowledge' && (
            <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
              {/* Phase 3: Enhanced Knowledge Base Manager */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Upload size={18} className="text-blue-900" /> Upload
                  Documents
                </h3>

                <KnowledgeBaseManager
                  botId={activeBot.id}
                  documents={documents}
                  onDocumentsChange={(newDocs) => {
                    setDocuments(newDocs);
                    // Update bot's knowledge base references if needed
                  }}
                />
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Globe size={18} className="text-blue-900" /> Train from
                  Website
                </h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://yourbusiness.com"
                    className="flex-1 rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                  />
                  <button
                    type="button"
                    onClick={handleScrapeUrl}
                    disabled={isScraping || !urlInput}
                    className="bg-blue-900 text-white px-4 py-2 rounded-lg hover:bg-blue-950 disabled:opacity-50 transition font-medium flex items-center justify-center gap-2 shrink-0"
                  >
                    {isScraping ? (
                      <RefreshCcw className="animate-spin" size={16} />
                    ) : (
                      <Zap size={16} />
                    )}
                    Train Bot
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  We will scrape this URL and add key info to the bot's memory.
                </p>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <FileText size={18} className="text-blue-900" /> Manual
                  Training Data
                </h3>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <input
                    type="text"
                    value={kbInput}
                    onChange={(e) => setKbInput(e.target.value)}
                    placeholder="Add specific fact (e.g. 'We are closed on Sundays')"
                    className="flex-1 rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
                  />
                  <button
                    type="button"
                    onClick={handleAddKnowledge}
                    className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition font-medium shrink-0"
                  >
                    Add Fact
                  </button>
                </div>

                <div className="space-y-2">
                  {activeBot.knowledgeBase.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-lg">
                      No knowledge added yet.
                    </div>
                  )}
                  {activeBot.knowledgeBase.map((item, index) => (
                    <div
                      key={`${activeBot.id}-${item}`}
                      className="flex items-start justify-between bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm"
                    >
                      <p className="text-slate-700 whitespace-pre-wrap">
                        {item}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const newKb = [...activeBot.knowledgeBase];
                          newKb.splice(index, 1);
                          setActiveBot({ ...activeBot, knowledgeBase: newKb });
                        }}
                        className="text-slate-400 hover:text-red-500 ml-2"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'voice' && (
            <div className="max-w-4xl mx-auto animate-fade-in">
              <VoiceAgentConfigComponent
                bot={activeBot}
              />
            </div>
          )}

          {activeTab === 'embed' && (
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
              <div className="space-y-6">
                {/* Warning for unsaved bots */}
                {activeBot.id === 'new' && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-start gap-3">
                    <Shield
                      size={20}
                      className="text-amber-600 shrink-0 mt-0.5"
                    />
                    <div>
                      <p className="font-semibold">Save your bot first</p>
                      <p className="text-sm">
                        Please save your bot before copying the embed code or
                        share link. This ensures visitors can access your
                        chatbot.
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Code size={18} className="text-blue-900" /> Website Embed
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Copy and paste this code into your website's{' '}
                    <code>&lt;head&gt;</code> tag.
                  </p>
                  <div
                    className={`bg-slate-900 text-slate-300 p-4 rounded-lg font-mono text-xs overflow-x-hidden md:overflow-x-auto break-all relative group ${activeBot.id === 'new' ? 'opacity-50' : ''}`}
                  >
                    <pre className="whitespace-pre-wrap break-all">
                      {embedCode}
                    </pre>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(embedCode)}
                      disabled={activeBot.id === 'new'}
                      className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded text-white opacity-0 group-hover:opacity-100 transition disabled:cursor-not-allowed"
                      title="Copy to clipboard"
                    >
                      <Share2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Link size={18} className="text-blue-900" /> Share Public
                    Link
                  </h3>
                  <div
                    className={`flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 mb-4 ${activeBot.id === 'new' ? 'opacity-50' : ''}`}
                  >
                    <input
                      readOnly
                      value={
                        activeBot.id === 'new'
                          ? 'Save bot to generate share link...'
                          : shareLink
                      }
                      className="bg-transparent border-none focus:ring-0 w-full text-sm text-slate-600"
                    />
                    {activeBot.id !== 'new' && (
                      <a
                        href={shareLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-blue-900 hover:bg-blue-100 rounded"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 py-2 bg-[#0077b5] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90"
                    >
                      <Linkedin size={14} /> Post
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-2 bg-[#1877f2] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90"
                    >
                      <Facebook size={14} /> Share
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-2 bg-black text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90"
                    >
                      <Twitter size={14} /> Tweet
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Monitor size={18} className="text-blue-900" /> Widget Preview
                </h3>

                <div className="space-y-4 mb-8">
                  <fieldset>
                    <legend className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                      Brand Color
                    </legend>
                    <div className="flex gap-2">
                      {AVATAR_COLORS.map((c) => (
                        <button
                          type="button"
                          key={c}
                          onClick={() =>
                            setActiveBot({ ...activeBot, themeColor: c })
                          }
                          className={`w-6 h-6 rounded-full border-2 ${activeBot.themeColor === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="bot-builder-embed-position"
                        className="text-xs font-bold text-slate-500 uppercase mb-1 block"
                      >
                        Position
                      </label>
                      <select
                        id="bot-builder-embed-position"
                        value={embedConfig.position}
                        onChange={(e) =>
                          setEmbedConfig({
                            ...embedConfig,
                            position: e.target.value,
                          })
                        }
                        className="w-full text-sm rounded-lg border-slate-200"
                      >
                        <option value="bottom-right">Bottom Right</option>
                        <option value="bottom-left">Bottom Left</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="bot-builder-embed-style"
                        className="text-xs font-bold text-slate-500 uppercase mb-1 block"
                      >
                        Style
                      </label>
                      <select
                        id="bot-builder-embed-style"
                        value={embedConfig.buttonStyle}
                        onChange={(e) =>
                          setEmbedConfig({
                            ...embedConfig,
                            buttonStyle: e.target.value,
                          })
                        }
                        className="w-full text-sm rounded-lg border-slate-200"
                      >
                        <option value="rounded-full">Circle</option>
                        <option value="rounded-xl">Square</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex-1 bg-slate-100 rounded-xl border border-slate-200 relative overflow-hidden min-h-[300px]">
                  {/* Fake Website Content */}
                  <div className="p-4 space-y-3 opacity-30 pointer-events-none">
                    <div className="h-4 bg-slate-300 rounded w-3/4" />
                    <div className="h-4 bg-slate-300 rounded w-1/2" />
                    <div className="h-32 bg-slate-300 rounded w-full" />
                    <div className="h-4 bg-slate-300 rounded w-2/3" />
                  </div>

                  {/* Widget */}
                  <div
                    className={`absolute p-4 flex flex-col items-end gap-2 transition-all ${
                      embedConfig.position === 'bottom-right'
                        ? 'bottom-0 right-0'
                        : 'bottom-0 left-0 items-start'
                    }`}
                  >
                    <div className="bg-white p-3 rounded-xl rounded-br-none shadow-lg border border-slate-100 text-sm text-slate-700 max-w-[200px] animate-fade-in">
                      {embedConfig.welcomeMessage}
                    </div>
                    <div
                      className={`w-14 h-14 ${embedConfig.buttonStyle} shadow-xl flex items-center justify-center text-white cursor-pointer hover:scale-105 transition`}
                      style={{ backgroundColor: activeBot.themeColor }}
                    >
                      <MessageSquare size={24} fill="currentColor" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className="max-w-3xl mx-auto h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
              {/* Chat Header */}
              <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm"
                    style={{ backgroundColor: previewIdentity.color }}
                  >
                    {previewIdentity.name.substring(0, 2)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">
                      {previewIdentity.name}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{' '}
                      Online Preview
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTestHistory([])}
                  className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"
                >
                  <Trash2 size={12} /> Clear Chat
                </button>
              </div>

              {/* Chat History */}
              <div
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50"
                ref={scrollRef}
              >
                {testHistory.length === 0 && (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    <BotIcon size={32} className="mx-auto mb-2 opacity-20" />
                    Start typing to test your bot.
                  </div>
                )}
                {testHistory.map((msg) => (
                  <div
                    key={msg.timestamp}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTesting && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                      <div
                        className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.1s' }}
                      />
                      <div
                        className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.2s' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-4 bg-white border-t border-slate-100">
                <div className="relative">
                  <input
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTestSend()}
                    placeholder="Type a message..."
                    className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 focus:ring-blue-900 focus:border-blue-900 shadow-sm text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleTestSend}
                    disabled={!testInput.trim() || isTesting}
                    className="absolute right-2 top-2 p-2 bg-blue-900 text-white rounded-lg hover:bg-blue-950 disabled:opacity-50 transition"
                  >
                    <Play size={16} fill="currentColor" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Simplified Bot Wizard */}
      {showWizard && (
        <SimplifiedBotWizard
          onComplete={(bot) => {
            setShowWizard(false);
            onSave(bot);
          }}
          onCancel={() => setShowWizard(false)}
        />
      )}
    </div>
  );
};
