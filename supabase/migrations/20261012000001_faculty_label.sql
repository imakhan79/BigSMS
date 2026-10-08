-- User-facing wording: the professor role is called Faculty.
create or replace function public.guard_timetable_slot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_clash record;
begin
  new.room := trim(new.room);
  select c.title, s.room, (c.professor_id = me.professor_id) as same_professor into v_clash
    from public.timetable_slots s
    join public.courses c on c.id = s.course_id
    join public.courses me on me.id = new.course_id
   where s.id <> new.id
     and s.weekday = new.weekday
     and s.starts_at < new.ends_at and s.ends_at > new.starts_at
     and c.status <> 'archived'
     and ((new.room <> '' and lower(s.room) = lower(new.room)) or c.professor_id = me.professor_id)
   limit 1;
  if found then
    if v_clash.same_professor then
      raise exception 'This Faculty member already teaches % at that time', v_clash.title;
    end if;
    raise exception 'Room % is already booked for % at that time', v_clash.room, v_clash.title;
  end if;
  return new;
end;
$$;
