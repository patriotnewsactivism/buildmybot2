import fs from 'node:fs';

function replaceOnce(path, from, to) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(from)) {
    throw new Error(`Expected patch anchor not found in ${path}`);
  }
  fs.writeFileSync(path, source.replace(from, to));
}

replaceOnce(
  'types.ts',
  `export interface PhoneAgentConfig {\n  enabled: boolean;\n  phoneNumber?: string;\n  voiceId: string;\n  introMessage: string;\n  delegationLink?: string;\n  twilioSid?: string;\n}`,
  `export interface PhoneAgentConfig {\n  enabled: boolean;\n  phoneNumber?: string;\n  voiceId: string;\n  introMessage: string;\n  geminiVoice?: string;\n  transferNumber?: string;\n  hotLeadNumber?: string;\n  bookingWebhookUrl?: string;\n  delegationLink?: string;\n  twilioSid?: string;\n}`,
);

replaceOnce(
  'components/PhoneAgent/PhoneAgent.tsx',
  `import {\n  Database,\n  Loader,\n  Mic,\n  Phone,\n  Save,\n  Settings,\n  Sparkles,\n  Voicemail,\n  Volume2,\n} from 'lucide-react';`,
  `import {\n  Bell,\n  Calendar,\n  Database,\n  Loader,\n  Mic,\n  Phone,\n  PhoneForwarded,\n  Save,\n  Settings,\n  Sparkles,\n  Voicemail,\n  Volume2,\n} from 'lucide-react';`,
);

replaceOnce(
  'components/PhoneAgent/PhoneAgent.tsx',
  `  const [introMessage, setIntroMessage] = useState(\n    user?.phoneConfig?.introMessage ||\n      'Hi! Thanks for calling. This is your AI assistant. How can I help you today?',\n  );\n  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);`,
  `  const [introMessage, setIntroMessage] = useState(\n    user?.phoneConfig?.introMessage ||\n      'Hi! Thanks for calling. This is your AI assistant. How can I help you today?',\n  );\n  const [geminiVoice, setGeminiVoice] = useState(\n    user?.phoneConfig?.geminiVoice || 'Aoede',\n  );\n  const [transferNumber, setTransferNumber] = useState(\n    user?.phoneConfig?.transferNumber || '',\n  );\n  const [hotLeadNumber, setHotLeadNumber] = useState(\n    user?.phoneConfig?.hotLeadNumber || '',\n  );\n  const [bookingWebhookUrl, setBookingWebhookUrl] = useState(\n    user?.phoneConfig?.bookingWebhookUrl || '',\n  );\n  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);`,
);

replaceOnce(
  'components/PhoneAgent/PhoneAgent.tsx',
  `      if (user.phoneConfig.introMessage)\n        setIntroMessage(user.phoneConfig.introMessage);\n    }\n  }, [user?.phoneConfig]);`,
  `      if (user.phoneConfig.introMessage)\n        setIntroMessage(user.phoneConfig.introMessage);\n      setGeminiVoice(user.phoneConfig.geminiVoice || 'Aoede');\n      setTransferNumber(user.phoneConfig.transferNumber || '');\n      setHotLeadNumber(user.phoneConfig.hotLeadNumber || '');\n      setBookingWebhookUrl(user.phoneConfig.bookingWebhookUrl || '');\n    }\n  }, [user?.phoneConfig]);`,
);

replaceOnce(
  'components/PhoneAgent/PhoneAgent.tsx',
  `            enabled,\n            voiceId: voice,\n            introMessage,`,
  `            enabled,\n            voiceId: voice,\n            introMessage,\n            geminiVoice,\n            transferNumber: transferNumber.trim() || undefined,\n            hotLeadNumber: hotLeadNumber.trim() || undefined,\n            bookingWebhookUrl: bookingWebhookUrl.trim() || undefined,`,
);

replaceOnce(
  'components/PhoneAgent/PhoneAgent.tsx',
  `            Powered by the platform voice engine\n          </p>\n          <p className="text-sm text-slate-600 mt-0.5">\n            Realistic Grok voices are built in — no third-party API key to set\n            up. Pick a voice, write your greeting, and test it live below.`,
  `            Powered by Gemini Live\n          </p>\n          <p className="text-sm text-slate-600 mt-0.5">\n            Production phone calls use a realtime two-way Gemini Live session\n            with natural pauses, barge-in, business knowledge, tool actions,\n            hot-lead alerts, and optional human handoff.`,
);

const voiceCardAnchor = `          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">\n            <div className="flex items-center gap-2 mb-4">\n              <div className="p-2 bg-blue-50 text-blue-900 rounded-lg">\n                <Mic size={18} />\n              </div>\n              <h3 className="font-bold text-slate-800">Select Voice</h3>`;

const realtimeCard = `          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">\n            <div className="flex items-center gap-2 mb-4">\n              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">\n                <PhoneForwarded size={18} />\n              </div>\n              <div>\n                <h3 className="font-bold text-slate-800">Realtime Call Actions</h3>\n                <p className="text-xs text-slate-500">\n                  Configure the actions Gemini Live is allowed to perform on real calls.\n                </p>\n              </div>\n            </div>\n\n            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">\n              <label className="text-sm text-slate-700">\n                <span className="block font-medium mb-1">Gemini Live voice</span>\n                <select\n                  value={geminiVoice}\n                  onChange={(event) => setGeminiVoice(event.target.value)}\n                  className="w-full rounded-lg border border-slate-200 p-2.5 bg-white focus:ring-2 focus:ring-blue-500"\n                >\n                  {['Aoede', 'Puck', 'Charon', 'Kore', 'Fenrir'].map((name) => (\n                    <option key={name} value={name}>\n                      {name}\n                    </option>\n                  ))}\n                </select>\n              </label>\n\n              <label className="text-sm text-slate-700">\n                <span className="flex items-center gap-1 font-medium mb-1">\n                  <PhoneForwarded size={14} /> Human handoff number\n                </span>\n                <input\n                  type="tel"\n                  value={transferNumber}\n                  onChange={(event) => setTransferNumber(event.target.value)}\n                  placeholder="+1 555 123 4567"\n                  className="w-full rounded-lg border border-slate-200 p-2.5 focus:ring-2 focus:ring-blue-500"\n                />\n              </label>\n\n              <label className="text-sm text-slate-700">\n                <span className="flex items-center gap-1 font-medium mb-1">\n                  <Bell size={14} /> Hot-lead SMS number\n                </span>\n                <input\n                  type="tel"\n                  value={hotLeadNumber}\n                  onChange={(event) => setHotLeadNumber(event.target.value)}\n                  placeholder="Defaults to handoff number"\n                  className="w-full rounded-lg border border-slate-200 p-2.5 focus:ring-2 focus:ring-blue-500"\n                />\n              </label>\n\n              <label className="text-sm text-slate-700">\n                <span className="flex items-center gap-1 font-medium mb-1">\n                  <Calendar size={14} /> Appointment webhook\n                </span>\n                <input\n                  type="url"\n                  value={bookingWebhookUrl}\n                  onChange={(event) => setBookingWebhookUrl(event.target.value)}\n                  placeholder="https://your-app.example/webhooks/book"\n                  className="w-full rounded-lg border border-slate-200 p-2.5 focus:ring-2 focus:ring-blue-500"\n                />\n              </label>\n            </div>\n\n            <p className="text-xs text-slate-500 mt-4">\n              The agent never claims an action succeeded unless the connected\n              service confirms it. Leave an action blank to disable it.\n            </p>\n          </div>\n\n${voiceCardAnchor}`;

replaceOnce(
  'components/PhoneAgent/PhoneAgent.tsx',
  voiceCardAnchor,
  realtimeCard,
);

replaceOnce(
  'components/PhoneAgent/PhoneAgent.tsx',
  `              <span className="text-xs text-slate-500 ml-auto">\n                Powered by Grok\n              </span>`,
  `              <span className="text-xs text-slate-500 ml-auto">\n                Preview / fallback voice\n              </span>`,
);
