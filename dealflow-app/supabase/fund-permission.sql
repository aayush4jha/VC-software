-- Adds the 'fund' page permission.
--
-- The Fund page previously reused the 'portfolio' permission, so it now has
-- its own key. Without this backfill everyone who could see Fund yesterday
-- would silently lose it: grant 'fund' to anyone who already holds
-- 'portfolio', which reproduces the old behaviour exactly.
--
-- Profiles with an empty permissions array are left alone — the app treats
-- empty as "no restrictions", so adding a key would *reduce* their access.
--
-- permissions is text[] (see permissions-redesign.sql), not jsonb.

UPDATE profiles
SET permissions = array_append(permissions, 'fund')
WHERE 'portfolio' = ANY(permissions)
  AND NOT ('fund' = ANY(permissions));

-- Same for invites that have been issued but not yet accepted.
UPDATE pending_invites
SET permissions = array_append(permissions, 'fund')
WHERE 'portfolio' = ANY(permissions)
  AND NOT ('fund' = ANY(permissions));

-- Verify
SELECT email, role, 'fund' = ANY(permissions) AS has_fund, permissions
FROM profiles
ORDER BY email;
