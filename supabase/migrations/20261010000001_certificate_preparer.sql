-- Issued certificates carry the full workflow: Prepared by Admin Manager -> Approved by Principal.
-- Students, parents and professors cannot read certificate lists, so the preparer is copied
-- onto the certificate when the list is approved and cannot be changed afterwards.

alter table public.certificates add column prepared_by uuid references public.profiles (id) on delete set null;
create index certificates_prepared_by_idx on public.certificates (prepared_by);

update public.certificates c
   set prepared_by = l.prepared_by
  from public.certificate_lists l
 where l.id = c.list_id;

create or replace function public.set_certificate_preparer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.prepared_by := (select prepared_by from public.certificate_lists where id = new.list_id);
  else
    new.prepared_by := old.prepared_by;
  end if;
  return new;
end;
$$;
create trigger certificates_preparer before insert or update on public.certificates
  for each row execute function public.set_certificate_preparer();

-- The preparer's name must show on the certificate, so the Admin Manager is visible to
-- active users the same way the Principal already is.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select public.is_overseer())
  or ((select public.is_admin_manager()) and role in ('professor', 'staff', 'student', 'parent'))
  or ((select public.app_role()) = 'professor' and role = 'student')
  or ((select public.is_active()) and role in ('professor', 'principal', 'admin_manager'))
  or public.is_parent_of(id)
);
