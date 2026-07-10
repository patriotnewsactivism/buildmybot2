import { CheckCircle, Info, Loader, RefreshCcw, XCircle } from 'lucide-react';
import type React from 'react';

interface DeploymentStatusProps {
  status: 'idle' | 'deploying' | 'success' | 'error';
  message?: string;
  errors?: string[];
  onRetry?: () => void;
}

const DeploymentStatus: React.FC<DeploymentStatusProps> = ({
  status,
  message,
  errors,
  onRetry,
}) => {
  const renderIcon = () => {
    switch (status) {
      case 'deploying':
        return <Loader className="h-5 w-5 animate-spin text-electric-violet" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-luminous-teal" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-warm-coral" />;
      default:
        return <Info className="h-5 w-5 text-soft-gray" />;
    }
  };

  const renderStatusText = () => {
    switch (status) {
      case 'deploying':
        return (
          <span className="font-medium text-electric-violet">Deploying...</span>
        );
      case 'success':
        return (
          <span className="font-medium text-luminous-teal">
            Deployment Successful!
          </span>
        );
      case 'error':
        return (
          <span className="font-medium text-warm-coral">Deployment Failed</span>
        );
      default:
        return (
          <span className="font-medium text-soft-gray">
            Ready for Deployment
          </span>
        );
    }
  };

  const getContainerClasses = () => {
    let classes =
      'p-4 rounded-lg shadow-md flex items-center space-x-3 transition-all duration-300 ease-in-out ';
    switch (status) {
      case 'deploying':
        classes +=
          'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-electric-violet/50';
        break;
      case 'success':
        classes +=
          'bg-gradient-to-r from-green-500/20 to-teal-500/20 border border-luminous-teal/50';
        break;
      case 'error':
        classes +=
          'bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-warm-coral/50';
        break;
      default:
        classes += 'bg-gray-800/30 border border-gray-700';
        break;
    }
    return classes;
  };

  return (
    <div className={getContainerClasses()}>
      <div className="flex-shrink-0">{renderIcon()}</div>
      <div className="flex-grow">
        {renderStatusText()}
        {message && <p className="text-sm text-gray-400 mt-1">{message}</p>}
        {errors && errors.length > 0 && (
          <div className="mt-2 space-y-2">
            <p className="text-sm font-semibold text-warm-coral">
              Common Issues:
            </p>
            {errors.map((error, index) => (
              <div key={index} className="flex items-start space-x-2">
                <Info className="h-4 w-4 flex-shrink-0 text-warm-coral mt-0.5" />
                <div className="text-sm text-gray-300">
                  <p>{error}</p>
                  {/* Example of one-click fixes - these would trigger specific actions */}
                  {error.includes('knowledge base processing') && (
                    <button
                      type="button"
                      onClick={() =>
                        alert('Fixing knowledge base processing...')
                      }
                      className="text-electric-violet hover:underline text-xs mt-1 inline-flex items-center"
                    >
                      <RefreshCcw className="h-3 w-3 mr-1" /> Re-process
                      Knowledge Base
                    </button>
                  )}
                  {error.includes('embed script conflict') && (
                    <button
                      type="button"
                      onClick={() =>
                        alert('Checking embed script configuration...')
                      }
                      className="text-electric-violet hover:underline text-xs mt-1 inline-flex items-center"
                    >
                      <RefreshCcw className="h-3 w-3 mr-1" /> Review Embed
                      Script
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {status === 'error' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto px-4 py-2 bg-electric-violet text-white rounded-md hover:bg-purple-700 transition-colors duration-200 text-sm flex items-center space-x-1"
        >
          <RefreshCcw className="h-4 w-4" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
};

export default DeploymentStatus;
