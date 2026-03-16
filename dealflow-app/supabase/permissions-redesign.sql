-- Permissions Redesign Migration
-- Decouples permissions from roles: roles become titles, permissions are page-based

-- 1. Add permissions column (text array) to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions text[] DEFAULT '{}';

-- 2. Remove the role CHECK constraint to allow custom roles
-- The constraint name may vary; try both common naming patterns
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 3. Set default permissions for existing admin users (backward compatibility)
UPDATE public.profiles
SET permissions = ARRAY['dashboard', 'dealflow', 'portfolio', 'contacts', 'emails', 'ai', 'admin', 'settings']
WHERE role = 'admin' AND (permissions = '{}' OR permissions IS NULL);

-- 4. Set default permissions for partners
UPDATE public.profiles
SET permissions = ARRAY['dashboard', 'dealflow', 'portfolio', 'contacts', 'emails', 'ai']
WHERE role = 'partner' AND (permissions = '{}' OR permissions IS NULL);

-- 5. Set default permissions for analysts
UPDATE public.profiles
SET permissions = ARRAY['dashboard', 'dealflow', 'portfolio', 'contacts', 'emails', 'ai']
WHERE role = 'analyst' AND (permissions = '{}' OR permissions IS NULL);
