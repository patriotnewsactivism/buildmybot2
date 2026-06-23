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
import type { BotDeploymentStatus, BotD } from '../../shared/types';
import { toast } from 'sonner';
import { BotService } from '../../server/services/BotService';

// ... (rest of the file content)

// Add these imports at the top of the file
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BotDeploymentStatus } from '../../shared/types';

// ... (rest of the file content)

// Inside BotBuilder component, add these state variables and functions
const [deploymentStatus, setDeploymentStatus] = useState<BotDeploymentStatus>(bot?.deploymentStatus || BotDeploymentStatus.NOT_DEPLOYED);
const [lastDeploymentError, setLastDeploymentError] = useState<string | null>(bot?.lastDeploymentError || null);
const [deploymentHistory, setDeploymentHistory] = useState<any[]>([]);

const queryClient = useQueryClient();

// Fetch deployment status and history
const { data: currentDeploymentStatus } = useQuery(
  ['botDeploymentStatus', botId],
  async () => {
    if (!botId) return BotDeploymentStatus.NOT_DEPLOYED;
    const response = await fetch(`/api/bots/${botId}/deployment-status`);
    if (!response.ok) throw new Error('Failed to fetch deployment status');
    return response.json();
  },
  {
    enabled: !!botId,
    refetchInterval: (data) => {
      if (data === BotDeploymentStatus.DEPLOYING) return 5000; // Refetch every 5 seconds while deploying
      return false; // Stop refetching otherwise
    },
    onSuccess: (status) => {
      setDeploymentStatus(status);
    },
  }
);

const { data: fetchedDeploymentHistory } = useQuery(
  ['botDeploymentHistory', botId],
  async () => {
    if (!botId) return [];
    const response = await fetch(`/api/bots/${botId}/deployment-history`);
    if (!response.ok) throw new Error('Failed to fetch deployment history');
    return response.json();
  },
  {
    enabled: !!botId,
    onSuccess: (history) => {
      setDeploymentHistory(history);
    },
  }
);

const deployBotMutation = useMutation(
  async (id: string) => {
    const response = await fetch(`/api/bots/${id}/deploy`, {
      method: 'POST',
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Deployment failed');
    }
    return response.json();
  },
  {
    onMutate: async (id) => {
      toast.info('Deployment initiated...');
      setDeploymentStatus(BotDeploymentStatus.DEPLOYING);
      setLastDeploymentError(null);
      // Optimistically update cache
      await queryClient.cancelQueries(['botDeploymentStatus', id]);
      const previousStatus = queryClient.getQueryData(['botDeploymentStatus', id]);
      queryClient.setQueryData(['botDeploymentStatus', id], BotDeploymentStatus.DEPLOYING);
      return { previousStatus };
    },
    onSuccess: (data, id) => {
      toast.success('Bot deployed successfully!');
      setDeploymentStatus(BotDeploymentStatus.DEPLOYED);
      setLastDeploymentError(null);
      queryClient.invalidateQueries(['botDeploymentStatus', id]);
      queryClient.invalidateQueries(['botDeploymentHistory', id]);
      queryClient.invalidateQueries(['bots']); // Invalidate all bots to refresh list
    },
    onError: (error: Error, id, context) => {
      toast.error(`Deployment failed: ${error.message}`);
      setDeploymentStatus(BotDeploymentStatus.FAILED);
      setLastDeploymentError(error.message);
      queryClient.setQueryData(['botDeploymentStatus', id], context?.previousStatus);
      queryClient.invalidateQueries(['botDeploymentHistory', id]);
      queryClient.invalidateQueries(['bots']);
    },
    onSettled: (data, error, id) => {
      queryClient.invalidateQueries(['botDeploymentStatus', id]);
      queryClient.invalidateQueries(['botDeploymentHistory', id]);
    },
  }
);

const handleDeployBot = async () => {
  if (!bot?.id) {
    toast.error('No bot selected for deployment.');
    return;
  }
  deployBotMutation.mutate(bot.id);
};

// Update the useEffect that sets bot data
useEffect(() => {
  if (bot) {
    setBotName(bot.name);
    setBotDescription(bot.description || '');
    setBotModel(bot.model || 'gpt-4o');
    setBotTemperature(bot.temperature || 0.7);
    setBotPrompt(bot.prompt || '');
    setBotKnowledgeBase(bot.knowledgeBaseId || null);
    setBotTools(bot.tools || []);
    setBotChannels(bot.channels || []);
    setDeploymentStatus(bot.deploymentStatus || BotDeploymentStatus.NOT_DEPLOYED);
    setLastDeploymentError(bot.lastDeploymentError || null);
  }
}, [bot]);

// In the BotBuilder component's JSX, add a section for deployment status and actions
// You can place this near the 'Save Bot' button or in a new 'Deployment' tab/section.

<div className="mt-8 p-4 border rounded-lg shadow-sm bg-white">
  <h3 className="text-lg font-semibold mb-4 flex items-center">
    <Plane className="w-5 h-5 mr-2" /> Deployment Status
  </h3>
  <div className="flex items-center mb-4">
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
      deploymentStatus === BotDeploymentStatus.DEPLOYED ? 'bg-green-100 text-green-800'
      : deploymentStatus === BotDeploymentStatus.DEPLOYING ? 'bg-blue-100 text-blue-800'
      : deploymentStatus === BotDeploymentStatus.FAILED ? 'bg-red-100 text-red-800'
      : 'bg-gray-100 text-gray-800'
    }`}>
      {deploymentStatus === BotDeploymentStatus.DEPLOYING && <Loader2 className="inline w-4 h-4 mr-2 animate-spin" />}
      {deploymentStatus.replace(/_/g, ' ')}
    </span>
    {lastDeploymentError && (
      <p className="ml-4 text-red-600 text-sm">Error: {lastDeploymentError}</p>
    )}
  </div>
  <button
    onClick={handleDeployBot}
    disabled={!bot?.id || deployBotMutation.isLoading}
    className={`flex items-center px-4 py-2 rounded-md text-white font-medium transition-colors ${
      deployBotMutation.isLoading ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
    }`}
  >
    {deployBotMutation.isLoading ? (
      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
    ) : (
      <Plane className="w-4 h-4 mr-2" />
    )}
    {deployBotMutation.isLoading ? 'Deploying...' : 'Deploy Bot'}
  </button>

  {deploymentHistory.length > 0 && (
    <div className="mt-6">
      <h4 className="text-md font-semibold mb-2">Deployment History</h4>
      <ul className="border rounded-md divide-y divide-gray-200">
        {deploymentHistory.map((entry, index) => (
          <li key={index} className="p-3 text-sm flex justify-between items-center">
            <div>
              <span className="font-medium">{entry.status.replace(/_/g, ' ')}</span>
              {entry.message && <span className="text-gray-600 ml-2">- {entry.message}</span>}
            </div>
            <span className="text-gray-500 text-xs">
              {new Date(entry.timestamp).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )}
</div>

// Ensure BotDeploymentStatus is imported from shared/types
// Make sure to add the new API routes for deployment status and history in server/routes/bots.ts (or relevant file)

// Example API routes (to be added in server/routes/bots.ts or similar)
// router.post('/bots/:botId/deploy', async (req, res) => {
//   try {
//     const { botId } = req.params;
//     const userId = req.user.id; // Assuming user is authenticated
//     const organizationId = req.user.organizationId; // Assuming organizationId is available
//     const bot = await botService.deployBot(botId, userId, organizationId);
//     res.json(bot);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// router.get('/bots/:botId/deployment-status', async (req, res) => {
//   try {
//     const { botId } = req.params;
//     const organizationId = req.user.organizationId; // Assuming organizationId is available
//     const status = await botService.getDeploymentStatus(botId, organizationId);
//     res.json(status);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// router.get('/bots/:botId/deployment-history', async (req, res) => {
//   try {
//     const { botId } = req.params;
//     const organizationId = req.user.organizationId; // Assuming organizationId is available
//     const history = await botService.getDeploymentHistory(botId, organizationId);
//     res.json(history);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// End of additions