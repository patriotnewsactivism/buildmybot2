import React, { useState, useEffect, useRef } from 'react';
import * as Diff from 'diff-match-patch';
import { Button } from '@/components/UI/Button'; // Assuming a Button component exists
import { Switch } from '@/components/UI/Switch'; // Assuming a Switch component exists
import { Label } from '@/components/UI/Label'; // Assuming a Label component exists
import { ChevronDown, ChevronRight, Copy } from 'lucide-react'; // Assuming Lucide React icons
import { toast } from 'sonner'; // Assuming sonner for toasts

interface ConfigDiffViewerProps {
  currentConfig: Record<string, any>;
  pendingConfig: Record<string, any>;
  onRevert?: (config: Record<string, any>) => void;
  onApply?: (config: Record<string, any>) => void;
  undoStack?: any[]; // Placeholder for undo/redo integration
  redoStack?: any[]; // Placeholder for undo/redo integration
  onUndo?: () => void;
  onRedo?: () => void;
}

const dmp = new Diff.diff_match_patch();

const formatJson = (json: Record<string, any>) => {
  try {
    return JSON.stringify(json, null, 2);
  } catch (e) {
    console.error('Error formatting JSON:', e);
    return JSON.stringify({}); // Return empty object string on error
  }
};

const DiffViewer: React.FC<{ diffs: [number, string][]; type: 'unified' | 'split' }> = ({ diffs, type }) => {
  const renderDiff = (diff: [number, string], index: number) => {
    const op = diff[0]; // Operation (0 = common, 1 = added, -1 = deleted)
    const text = diff[1]; // Text of change

    let className = '';
    if (op === 1) {
      className = 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
    } else if (op === -1) {
      className = 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
    }

    // Split text by newlines to render each line separately
    const lines = text.split(/\n/g);

    return (
      <React.Fragment key={index}>
        {lines.map((line, lineIndex) => (
          <span key={`${index}-${lineIndex}`} className={className}>
            {line}
            {lineIndex < lines.length - 1 && <br />}
          </span>
        ))}
      </React.Fragment>
    );
  };

  if (type === 'unified') {
    return (
      <pre className="whitespace-pre-wrap font-mono text-sm p-2 rounded-md bg-gray-50 dark:bg-gray-800 overflow-x-auto">
        {diffs.map((diff, index) => renderDiff(diff, index))}
      </pre>
    );
  } else { // split view
    const leftDiffs: [number, string][] = [];
    const rightDiffs: [number, string][] = [];

    diffs.forEach(diff => {
      const op = diff[0];
      const text = diff[1];
      if (op === 1) {
        leftDiffs.push([0, '']); // Empty line on left for added content
        rightDiffs.push(diff);
      } else if (op === -1) {
        leftDiffs.push(diff);
        rightDiffs.push([0, '']); // Empty line on right for deleted content
      } else {
        leftDiffs.push(diff);
        rightDiffs.push(diff);
      }
    });

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-sm">
        <pre className="whitespace-pre-wrap p-2 rounded-md bg-gray-50 dark:bg-gray-800 overflow-x-auto">
          {leftDiffs.map((diff, index) => renderDiff(diff, index))}
        </pre>
        <pre className="whitespace-pre-wrap p-2 rounded-md bg-gray-50 dark:bg-gray-800 overflow-x-auto">
          {rightDiffs.map((diff, index) => renderDiff(diff, index))}
        </pre>
      </div>
    );
  }
};

const ConfigDiffViewer: React.FC<ConfigDiffViewerProps> = ({
  currentConfig,
  pendingConfig,
  onRevert,
  onApply,
  undoStack = [],
  redoStack = [],
  onUndo,
  onRedo,
}) => {
  const [showDiff, setShowDiff] = useState(false);
  const [diffType, setDiffType] = useState<'unified' | 'split'>('unified');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const diffContainerRef = useRef<HTMLDivElement>(null);

  const currentConfigStr = formatJson(currentConfig);
  const pendingConfigStr = formatJson(pendingConfig);

  const diffs = dmp.diff_main(currentConfigStr, pendingConfigStr);
  dmp.diff_cleanupSemantic(diffs);

  const hasChanges = diffs.some(diff => diff[0] !== 0);

  useEffect(() => {
    if (showDiff && diffContainerRef.current) {
      // Ensure the diff viewer is visible when opened
      diffContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showDiff]);

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionKey)) {
        newSet.delete(sectionKey);
      } else {
        newSet.add(sectionKey);
      }
      return newSet;
    });
  };

  const renderCollapsibleDiff = (fullDiffs: [number, string][]) => {
    const sections: { key: string; diffs: [number, string][]; hasChanges: boolean }[] = [];
    let currentSection: { key: string; diffs: [number, string][]; hasChanges: boolean } | null = null;
    let lineCount = 0;

    fullDiffs.forEach(diff => {
      const text = diff[1];
      const lines = text.split(/\n/g);

      lines.forEach((line, lineIndex) => {
        if (line.trim().startsWith('"') && line.trim().endsWith('": {') && lineCount > 0) {
          // Start a new section if we encounter a new top-level key
          if (currentSection) {
            sections.push(currentSection);
          }
          currentSection = { key: line.trim().replace(/"|: {/g, ''), diffs: [], hasChanges: false };
        }

        if (!currentSection) {
          // Handle initial lines before the first section key
          currentSection = { key: 'root', diffs: [], hasChanges: false };
        }

        currentSection.diffs.push([diff[0], line + (lineIndex < lines.length - 1 ? '\n' : '')]);
        if (diff[0] !== 0) {
          currentSection.hasChanges = true;
        }
        lineCount++;
      });
    });

    if (currentSection) {
      sections.push(currentSection);
    }

    // If only one section, or no meaningful sections, just render the full diff
    if (sections.length <= 1 || sections.every(s => s.key === 'root')) {
      return <DiffViewer diffs={fullDiffs} type={diffType} />;
    }

    return (
      <div className="space-y-2">
        {sections.map((section, index) => {
          const isCollapsed = collapsedSections.has(section.key);
          const sectionHasChanges = section.diffs.some(d => d[0] !== 0);

          // Only show section header if it's not the 'root' and has changes or is explicitly collapsed
          const showSectionHeader = section.key !== 'root' && (sectionHasChanges || isCollapsed);

          return (
            <div key={section.key || `section-${index}`} className="border rounded-md border-gray-200 dark:border-gray-700">
              {showSectionHeader && (
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent parent click if this were nested
                    toggleSection(section.key);
                  }}
                  className="flex items-center justify-between w-full p-3 text-left text-sm font-medium bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-md focus:outline-none focus-visible:ring focus-visible:ring-blue-500 focus-visible:ring-opacity-75 min-h-[44px]"
                >
                  <span className={`flex items-center gap-2 ${sectionHasChanges ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'}`}>
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {section.key}
                    {sectionHasChanges && <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Changes</span>}
                  </span>
                </button>
              )}
              {!isCollapsed && (
                <div className="p-3">
                  <DiffViewer diffs={section.diffs} type={diffType} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Diff copied to clipboard!');
    }).catch(err => {
      toast.error('Failed to copy diff.');
      console.error('Failed to copy diff:', err);
    });
  };

  return (
    <div className="w-full space-y-4" ref={diffContainerRef}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Button
          onClick={() => setShowDiff(!showDiff)}
          variant="outline"
          className="w-full sm:w-auto min-h-[44px]"
        >
          {showDiff ? 'Hide Changes' : 'View Pending Changes'}
          {hasChanges && <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{diffs.filter(d => d[0] !== 0).length}</span>}
        </Button>

        {showDiff && hasChanges && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center space-x-2 min-h-[44px]">
              <Switch
                id="diff-view-toggle"
                checked={diffType === 'split'}
                onCheckedChange={(checked) => setDiffType(checked ? 'split' : 'unified')}
                className="data-[state=checked]:bg-blue-600"
              />
              <Label htmlFor="diff-view-toggle" className="text-sm font-medium cursor-pointer">Split View</Label>
            </div>
            <Button
              onClick={() => handleCopy(Diff.diff_prettyHtml(dmp.diff_main(currentConfigStr, pendingConfigStr)))} // Copy HTML diff
              variant="ghost"
              size="sm"
              className="min-h-[44px]"
            >
              <Copy className="mr-2 h-4 w-4" /> Copy Diff
            </Button>
          </div>
        )}
      </div>

      {showDiff && (
        <div className="border rounded-lg p-4 bg-white dark:bg-gray-900 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Configuration Changes</h3>
          {!hasChanges ? (
            <p className="text-gray-600 dark:text-gray-400">No pending changes detected.</p>
          ) : (
            <div className="space-y-4">
              {renderCollapsibleDiff(diffs)}
            </div>
          )}

          {(onUndo || onRedo) && (
            <div className="flex justify-end gap-2 mt-4">
              <Button
                onClick={onUndo}
                disabled={undoStack.length === 0}
                variant="outline"
                className="min-h-[44px]"
              >
                Undo ({undoStack.length})
              </Button>
              <Button
                onClick={onRedo}
                disabled={redoStack.length === 0}
                variant="outline"
                className="min-h-[44px]"
              >
                Redo ({redoStack.length})
              </Button>
            </div>
          )}

          {(onRevert || onApply) && hasChanges && (
            <div className="flex justify-end gap-2 mt-4">
              {onRevert && (
                <Button onClick={() => onRevert(currentConfig)} variant="destructive" className="min-h-[44px]">
                  Revert to Current
                </Button>
              )}
              {onApply && (
                <Button onClick={() => onApply(pendingConfig)} className="min-h-[44px]">
                  Apply Changes
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConfigDiffViewer;
