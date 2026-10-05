-- Adds the Principal role. Kept in its own migration because a new enum value
-- cannot be used in the same transaction that creates it.
alter type public.user_role add value if not exists 'principal';
