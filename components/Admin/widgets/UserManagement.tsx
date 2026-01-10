import {
  Download,
  RefreshCw,
  Search,
  UserCheck,
  User as UserIcon,
  UserX,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { dbService } from '../../../services/dbService';
import { type Column, DataTable } from '../../UI/DataTable';

interface UserData {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  role: string;
  plan: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
}

interface UserUsage {
  botCount: number;
  leadCount: number;
  conversationCount: number;
  lastLoginAt: string | null;
}

interface UserManagementProps {
  onImpersonate: (userId: string, reason: string) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({
  onImpersonate,
}) => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [impersonateUserId, setImpersonateUserId] = useState<string | null>(
    null,
  );
  const [impersonationReason, setImpersonationReason] = useState<string>('');
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [usageUser, setUsageUser] = useState<UserData | null>(null);
  const [usageData, setUsageData] = useState<UserUsage | null>(null);
  const [showUsageModal, setShowUsageModal] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterRole) params.role = filterRole;
      if (filterStatus) params.status = filterStatus;
      if (searchTerm) params.search = searchTerm;

      const data = await dbService.getAdminUsers(params);
      setUsers(data);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
      setLoading(false);
    }
  }, [filterRole, filterStatus, searchTerm]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleBulkAction = async (action: string) => {
    if (selectedUsers.size === 0) {
      alert('Please select at least one user');
      return;
    }

    const confirmMessage = `Are you sure you want to ${action} ${selectedUsers.size} user(s)?`;
    if (!confirm(confirmMessage)) return;

    try {
      await dbService.bulkUpdateUsers({
        userIds: Array.from(selectedUsers),
        action,
      });

      alert(`Successfully ${action}ed ${selectedUsers.size} user(s)`);
      setSelectedUsers(new Set());
      fetchUsers();
    } catch (err) {
      console.error(`Error performing ${action}:`, err);
      alert(`Failed to ${action} users`);
    }
  };

  const handleImpersonate = async () => {
    if (!impersonateUserId || !impersonationReason.trim()) {
      alert('Please provide a reason for impersonation');
      return;
    }

    try {
      await onImpersonate(impersonateUserId, impersonationReason.trim());
      setShowImpersonateModal(false);
      setImpersonationReason('');
      setImpersonateUserId(null);
    } catch (err) {
      console.error('Error starting impersonation:', err);
      alert('Failed to start impersonation session');
    }
  };

  const handleExportUser = async (userId: string) => {
    try {
      const data = await dbService.exportUserData(userId);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-${userId}-export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting user:', err);
      alert('Failed to export user data');
    }
  };

  const handleViewUsage = async (userId: string) => {
    try {
      const usage = await dbService.getUserUsage(userId);
      const userRecord =
        users.find((candidate) => candidate.id === userId) || null;
      setUsageUser(userRecord);
      setUsageData(usage);
      setShowUsageModal(true);
    } catch (err) {
      console.error('Error fetching usage:', err);
      alert('Failed to fetch user usage');
    }
  };

  const handleMergeUser = async (sourceUserId: string) => {
    const targetUserId = prompt('Enter target user ID to merge into:');
    if (!targetUserId) {
      return;
    }
    try {
      await dbService.mergeUsers(sourceUserId, targetUserId);
      alert('User merge completed');
      fetchUsers();
    } catch (err) {
      console.error('Error merging users:', err);
      alert('Failed to merge users');
    }
  };

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUsers);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUsers(newSelection);
  };

  const columns: Column<UserData>[] = [
    {
      key: 'select',
      label: '',
      render: (user) => (
        <input
          type="checkbox"
          checked={selectedUsers.has(user.id)}
          onChange={() => toggleUserSelection(user.id)}
          className="w-4 h-4 text-orange-600 border-slate-300 rounded focus:ring-orange-500"
        />
      ),
    },
    {
      key: 'name',
      label: 'Name',
      sortable: true,
    },
    {
      key: 'email',
      label: 'Email',
      sortable: true,
    },
    {
      key: 'companyName',
      label: 'Company',
      sortable: true,
      render: (user) => user.companyName || '-',
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (user) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            user.role === 'ADMIN'
              ? 'bg-purple-100 text-purple-800'
              : user.role === 'RESELLER'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-slate-100 text-slate-800'
          }`}
        >
          {user.role}
        </span>
      ),
    },
    {
      key: 'plan',
      label: 'Plan',
      sortable: true,
      render: (user) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            user.plan === 'FREE'
              ? 'bg-slate-100 text-slate-800'
              : user.plan === 'STARTER'
                ? 'bg-green-100 text-green-800'
                : user.plan === 'PRO'
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-purple-100 text-purple-800'
          }`}
        >
          {user.plan}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (user) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            user.status === 'Active'
              ? 'bg-green-100 text-green-800'
              : user.status === 'Suspended'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {user.status}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortable: true,
      render: (user) => new Date(user.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (user) => (
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => {
              setImpersonateUserId(user.id);
              setShowImpersonateModal(true);
            }}
            className="text-blue-600 hover:text-blue-800 text-xs"
            title="Impersonate user"
          >
            <UserCheck size={16} />
          </button>
          <button
            type="button"
            onClick={() => handleViewUsage(user.id)}
            className="text-slate-600 hover:text-slate-800 text-xs"
            title="View usage"
          >
            <UserIcon size={16} />
          </button>
          <button
            type="button"
            onClick={() => handleExportUser(user.id)}
            className="text-slate-600 hover:text-slate-800 text-xs"
            title="Export user data"
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={() => handleMergeUser(user.id)}
            className="text-slate-600 hover:text-slate-800 text-xs"
            title="Merge account"
          >
            <Users size={16} />
          </button>
        </div>
      ),
    },
  ];

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800">{error}</p>
        <button
          type="button"
          onClick={fetchUsers}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <RefreshCw size={16} className="inline mr-2" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">User Management</h2>
        <button
          type="button"
          onClick={fetchUsers}
          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2"
        >
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label
            htmlFor="user-search"
            className="block text-sm font-medium text-slate-700 mb-2"
          >
            Search
          </label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
              size={20}
            />
            <input
              id="user-search"
              type="text"
              placeholder="Search by name, email, or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="user-role"
            className="block text-sm font-medium text-slate-700 mb-2"
          >
            Role
          </label>
          <select
            id="user-role"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="">All Roles</option>
            <option value="USER">User</option>
            <option value="RESELLER">Reseller</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="user-status"
            className="block text-sm font-medium text-slate-700 mb-2"
          >
            Status
          </label>
          <select
            id="user-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedUsers.size > 0 && (
        <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-slate-700">
            {selectedUsers.size} user(s) selected
          </span>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => handleBulkAction('activate')}
              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm flex items-center space-x-1"
            >
              <UserCheck size={14} />
              <span>Activate</span>
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('suspend')}
              className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm flex items-center space-x-1"
            >
              <UserX size={14} />
              <span>Suspend</span>
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('delete')}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm flex items-center space-x-1"
            >
              <UserX size={14} />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* User Table */}
      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        emptyMessage="No users found"
      />

      {/* Impersonation Modal */}
      {showImpersonateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-slate-900 mb-4">
              Impersonate User
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              This will allow you to access the system as this user for 30
              minutes. Please provide a reason for audit purposes.
            </p>
            <textarea
              value={impersonationReason}
              onChange={(e) => setImpersonationReason(e.target.value)}
              placeholder="Reason for impersonation (e.g., Customer support ticket #1234)"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent mb-4"
              rows={3}
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShowImpersonateModal(false);
                  setImpersonationReason('');
                  setImpersonateUserId(null);
                }}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImpersonate}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                Start Impersonation
              </button>
            </div>
          </div>
        </div>
      )}
      {showUsageModal && usageData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Usage Snapshot
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              {usageUser?.name || 'User'} activity summary
            </p>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>Bots</span>
                <span className="font-semibold">{usageData.botCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Leads</span>
                <span className="font-semibold">{usageData.leadCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Conversations</span>
                <span className="font-semibold">
                  {usageData.conversationCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Last Login</span>
                <span className="font-semibold">
                  {usageData.lastLoginAt
                    ? new Date(usageData.lastLoginAt).toLocaleString()
                    : 'N/A'}
                </span>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowUsageModal(false);
                  setUsageData(null);
                  setUsageUser(null);
                }}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
