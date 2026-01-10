# Admin Permissions Setup

This document explains how to set admin permissions for users in the BuildMyBot system.

## Overview

The system supports multiple admin levels:
- **MasterAdmin**: Highest level access with full system control
- **ADMIN**: Standard admin access

## Setting Admin Permissions

A script has been created to set admin permissions: `scripts/setAdminPermissions.ts`

### Current Admin Configuration

The script is configured to set the following permissions:

1. **mreardon@wtpnews.org** - MasterAdmin role
2. **jadj19@gmail.com** - ADMIN role

### Running the Script

To apply these admin permissions, run:

```bash
npx tsx scripts/setAdminPermissions.ts
```

Or use the npm script:

```bash
npm run set-admin-permissions
```

### What the Script Does

The script will:
1. Connect to the database using the DATABASE_URL environment variable
2. For each configured admin user:
   - Check if the user exists in the database
   - If the user doesn't exist, create them with the specified admin role
   - If the user exists, update their role to the specified admin level
3. Verify and display the final admin configuration

### Requirements

- DATABASE_URL must be set in your `.env` or `.env.local` file
- Database must be accessible and properly migrated

### Modifying Admin Users

To add or modify admin users, edit the `adminUsers` array in `scripts/setAdminPermissions.ts`:

```typescript
const adminUsers = [
  { email: 'user@example.com', role: 'MasterAdmin', description: 'Master Admin' },
  { email: 'admin@example.com', role: 'ADMIN', description: 'Admin' }
];
```

## Admin Permissions in the System

### Role-Based Access

The system uses a three-layer permission model:

1. **User-level roles**: OWNER, ADMIN, RESELLER, CLIENT (and MasterAdmin for system admins)
2. **Organization-level roles**: owner, member
3. **Fine-grained permissions**: Array of permission strings

### Admin Privileges

- **MasterAdmin** and **ADMIN** roles bypass most permission checks (see `server/middleware/auth.ts:137-139`)
- Admins can impersonate users for support purposes
- Admin actions are logged in the audit trail

### Key Files

- `server/middleware/auth.ts` - Authentication and authorization middleware
- `server/routes/admin.ts` - Admin-specific API endpoints
- `shared/schema.ts` - Database schema including users and roles
- `types.ts` - User role enums and interfaces

## Security Notes

- All admin actions are logged in the audit_logs table
- Admin impersonation sessions are time-limited and tracked
- Sensitive operations require additional authentication/authorization
