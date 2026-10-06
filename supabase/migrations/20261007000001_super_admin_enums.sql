-- Adds the Super Admin and Staff roles and the offboarded account status.
-- Kept in its own migration because a new enum value cannot be used in the same
-- transaction that creates it.
alter type public.user_role add value if not exists 'super_admin';
alter type public.user_role add value if not exists 'staff';
alter type public.user_status add value if not exists 'offboarded';
