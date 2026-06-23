import React from 'react';
import { MessageSquare, BookOpen, Gauge } from 'lucide-react';
import { Badge } from '../UI/Badge';

interface ImpactItemProps {
  icon: React.ReactNode;
  label: string;
  impactType: 'positive' | 'negative' | 'neutral';
  description: string;
}

const ImpactItem: React.FC<ImpactItemProps> = ({ icon, label, impactType, description }) => {
  const impactColors = {
    positive: 'bg-green-100 text-green-800',
    negative: 'bg-red-100 text-red-800',
    neutral: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="p-4 border rounded-lg space-y-2 min-h-[120px] flex flex-col justify-between">
      <div className="flex items-center space-x-2">
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <Badge className={`${impactColors[impactType]} text-sm`}>
        {impactType === 'positive' && 'Improved'}
        {impactType === 'negative' && 'Degraded'}
        {impactType === 'neutral' && 'Unchanged'}
      </Badge>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
};

interface ConfigImpactPreviewProps {
  diffResult: any;
}

const ConfigImpactPreview: React.FC<ConfigImpactPreviewProps> = ({ diffResult }) => {
  // Placeholder impacts - to be replaced with actual diff results
  const impacts = [
    {
      icon: <MessageSquare className="h-4 w-4" />,
      label: 'Response Style',
      impactType: 'positive',
      description: 'Responses will be more conversational and friendly.',
    },
    {
      icon: <BookOpen className="h-4 w-4" />,
      label: 'Knowledge Coverage',
      impactType: 'neutral',
      description: 'No significant changes to knowledge base coverage.',
    },
    {
      icon: <Gauge className="h-4 w-4" />,
      label: 'Performance',
      impactType: 'negative',
      description: 'Response times may increase slightly due to additional processing.',
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Configuration Impact Preview</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {impacts.map((impact, index) => (
          <ImpactItem key={index} {...impact} />
        ))}
      </div>
    </div>
  );
};

export default ConfigImpactPreview;