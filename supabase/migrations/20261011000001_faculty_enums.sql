-- Assignment submission statuses Faculty can record for a student who did not submit online.
-- Kept in its own migration because a new enum value cannot be used in the same
-- transaction that creates it.
alter type public.submission_status add value if not exists 'missing';
alter type public.submission_status add value if not exists 'excused';
