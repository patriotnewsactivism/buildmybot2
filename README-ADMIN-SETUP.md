# Admin Permissions Setup

This document explains how to set admin permissions for users in the BuildMyBot system.

## Overview

The system supports multiple admin levels:
- **MasterAdmin**: Highest level access with full system control
- **ADMIN**: Standard admin access

## Setting Admin Permissions

A script (`scripts/setAdminPermissions.ts`) previously managed admin permissions, but this method is now **DEPRECATED**.

### Current Admin Configuration

Admin permissions are now primarily managed as part of the database seeding process, specifically via the `user-roles` seed.

The `scripts/seed.ts` file, when run with the `--only=user-roles` flag, will ensure the following default admin users are configured (if they exist or are created):

1. **mreardon@wtpnews.org** - MasterAdmin role
2. **jadj19@gmail.com** - ADMIN role

To modify these default users or add new ones, you would typically edit the relevant seeding logic in `server/seeds/seedUserRoles.ts` (or the file referenced by the `user-roles` seed).

### Running the Seed Script for Admin Permissions

To apply or update admin permissions using the recommended method, run:

```bash
npm run db:seed -- --only=user-roles
```

This command will:
1. Connect to the database using the DATABASE_URL environment variable.
2. For each configured admin user in the `user-roles` seed:
   - Check if the user exists in the database.
   - If the user doesn't exist, create them with the specified admin role.
   - If the user exists, update their role to the specified admin level.
3. Verify and display the final admin configuration (as implemented by the seed script).

### Requirements

- DATABASE_URL must be set in your `.env` or `.env.local` file
- Database must be accessible and properly migrated

### Modifying Admin Users

To add or modify admin users, you should primarily update the logic within the `user-roles` seed script (e.g., `server/seeds/seedUserRoles.ts` or similar files responsible for defining initial user roles during seeding).

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
