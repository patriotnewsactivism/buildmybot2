import { CheckCircle2, ClipboardList, Plus, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { dbService } from '../../../services/dbService';
import type { PartnerNote, PartnerTask } from '../../../types';

export const CollaborationHub: React.FC = () => {
  const [notes, setNotes] = useState<PartnerNote[]>([]);
  const [tasks, setTasks] = useState<PartnerTask[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCollaboration = async () => {
    try {
      const [notesData, tasksData] = await Promise.all([
        dbService.getPartnerNotes(),
        dbService.getPartnerTasks(),
      ]);
      setNotes(notesData);
      setTasks(tasksData);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Collaboration load error:', err);
      setError('Failed to load collaboration data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollaboration();
  }, []);

  const handleAddNote = async () => {
    if (!noteInput.trim()) return;
    try {
      const note = await dbService.createPartnerNote({
        note: noteInput.trim(),
      });
      setNotes((prev) => [note, ...prev]);
      setNoteInput('');
    } catch (err) {
      console.error('Note create error:', err);
    }
  };

  const handleAddTask = async () => {
    if (!taskInput.trim()) return;
    try {
      const task = await dbService.createPartnerTask({
        title: taskInput.trim(),
      });
      setTasks((prev) => [task, ...prev]);
      setTaskInput('');
    } catch (err) {
      console.error('Task create error:', err);
    }
  };

  const handleToggleTask = async (task: PartnerTask) => {
    const nextStatus = task.status === 'completed' ? 'open' : 'completed';
    try {
      const updated = await dbService.updatePartnerTask(task.id, {
        status: nextStatus,
      });
      setTasks((prev) =>
        prev.map((entry) => (entry.id === task.id ? updated : entry)),
      );
    } catch (err) {
      console.error('Task update error:', err);
    }
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">{error}</p>
        <button
          type="button"
          onClick={fetchCollaboration}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <RefreshCw size={16} className="inline mr-2" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Client Notes</h3>
          <button
            type="button"
            onClick={fetchCollaboration}
            className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs hover:bg-slate-200"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="flex gap-2 mb-4">
          <input
            value={noteInput}
            onChange={(event) => setNoteInput(event.target.value)}
            placeholder="Add a note..."
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={handleAddNote}
            className="px-3 py-2 bg-orange-600 text-white rounded-lg text-sm"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {notes.map((note) => (
            <div
              key={note.id}
              className="border border-slate-200 rounded-lg p-3 text-sm text-slate-700"
            >
              <div className="text-xs text-slate-400 mb-2">
                {note.createdAt
                  ? new Date(note.createdAt).toLocaleString()
                  : 'Just now'}
              </div>
              {note.note}
            </div>
          ))}
          {!loading && notes.length === 0 && (
            <div className="text-sm text-slate-500">No notes yet.</div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            Onboarding Tasks
          </h3>
          <button
            type="button"
            onClick={fetchCollaboration}
            className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs hover:bg-slate-200"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="flex gap-2 mb-4">
          <input
            value={taskInput}
            onChange={(event) => setTaskInput(event.target.value)}
            placeholder="Add a task..."
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={handleAddTask}
            className="px-3 py-2 bg-orange-600 text-white rounded-lg text-sm"
          >
            <ClipboardList size={16} />
          </button>
        </div>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {tasks.map((task) => (
            <button
              type="button"
              key={task.id}
              onClick={() => handleToggleTask(task)}
              className={`w-full text-left border rounded-lg p-3 text-sm ${
                task.status === 'completed'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2
                  size={16}
                  className={
                    task.status === 'completed'
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }
                />
                <span className="font-medium">{task.title}</span>
              </div>
              {task.dueAt && (
                <div className="text-xs text-slate-400 mt-1">
                  Due {new Date(task.dueAt).toLocaleDateString()}
                </div>
              )}
            </button>
          ))}
          {!loading && tasks.length === 0 && (
            <div className="text-sm text-slate-500">No tasks yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};
