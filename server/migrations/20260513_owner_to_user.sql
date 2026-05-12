-- Migration: Consolidate 'owner' account role to 'user'
-- Date: 2026-05-13
-- Reason: 'owner' and 'user' roles are identical in behavior; consolidating to a single 'user' role.

-- 1. Migrate all plain 'owner' roles to 'user' in accounts table
UPDATE accounts SET role = 'user' WHERE role = 'owner';

-- 2. Update any comma-separated role strings (e.g. 'owner,admin' -> 'user,admin')
UPDATE accounts
SET role = REPLACE(role, 'owner', 'user')
WHERE role LIKE '%owner%' AND role != 'owner';

-- 3. Update animal_sharing table if role column has 'owner' values
--    Note: schema CHECK constraint only allows ('guest', 'authority', 'vet'),
--    so this is a safety net for any legacy data.
UPDATE animal_sharing SET role = 'user' WHERE role = 'owner';

-- 4. Update audit_log table (cosmetic, not functional)
UPDATE audit_log SET account_role = 'user' WHERE account_role = 'owner';
