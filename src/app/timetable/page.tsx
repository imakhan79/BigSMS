import { addEvent, addSlot, publishTimetable, removeEvent, removeSlot, reviewTimetable } from "@/app/timetable/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { EVENT_KINDS, EVENT_SELECT, hhmm, MonthCalendar, monthParam, SLOT_SELECT, WEEKDAYS, WeekTimetable, type CalendarEvent, type Slot } from "@/components/Timetable";
import { Alert, Badge, Card, CardTitle, Flash, type FlashParams, Input, Label, PageHeader, Select, Stat, Table, Tabs, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDay } from "@/lib/utils";

interface Publication {
  id: string;
  publication_no: string;
  status: string;
  note: string;
  review_note: string;
  slot_count: number;
  event_count: number;
  requested_by: string | null;
  requested_at: string;
  reviewed_at: string | null;
  requester: { full_name: string } | null;
}

const PUB_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Awaiting the Principal", tone: "pending_approval" },
  approved: { label: "Approved and published", tone: "published" },
  published: { label: "Published by the Principal", tone: "published" },
  rejected: { label: "Rejected", tone: "rejected" },
  withdrawn: { label: "Withdrawn", tone: "withdrawn" },
};

/** Fingerprint of a set of slots and events, to tell whether the draft differs from what is live. */
const fingerprint = (slots: Slot[], events: CalendarEvent[]) =>
  JSON.stringify([
    slots.map((s) => [s.course?.id, s.batch_id, s.weekday, hhmm(s.starts_at), hhmm(s.ends_at), s.room]).sort(),
    events.map((e) => [e.title, e.kind, e.starts_on, e.ends_on, e.notes]).sort(),
  ]);

/**
 * Timetable management. The Principal and the Admin Manager edit a draft class schedule and
 * calendar and publish it; the Admin Manager's publication needs the Principal's approval.
 */
export default async function TimetablePage({ searchParams }: { searchParams: Promise<FlashParams & { tab?: string; month?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole("admin", "admin_manager", "principal");
  const canEdit = profile.role === "principal" || profile.role === "admin_manager";
  const tab = params.tab === "calendar" || params.tab === "publish" || params.tab === "live" ? params.tab : "schedule";
  const month = monthParam(params.month);
  const supabase = await createClient();

  const [{ data: slotRows }, { data: eventRows }, { data: courses }, { data: batches }, { data: pubs }] = await Promise.all([
    supabase.from("timetable_slots").select(`${SLOT_SELECT}, state`).order("weekday").order("starts_at"),
    supabase.from("calendar_events").select(`${EVENT_SELECT}, state`).order("starts_on"),
    supabase.from("courses").select("id, title, code, professor_id").neq("status", "archived").order("title"),
    supabase.from("course_batches").select("id, course_id, name").order("name"),
    supabase
      .from("timetable_publications")
      .select("id, publication_no, status, note, review_note, slot_count, event_count, requested_by, requested_at, reviewed_at, requester:profiles!timetable_publications_requested_by_fkey(full_name)")
      .order("requested_at", { ascending: false })
      .limit(30),
  ]);
  const all = (slotRows ?? []) as unknown as (Slot & { state: string })[];
  const allEvents = (eventRows ?? []) as unknown as (CalendarEvent & { state: string })[];
  const draft = all.filter((s) => s.state === "draft");
  const live = all.filter((s) => s.state === "live");
  const draftEvents = allEvents.filter((e) => e.state === "draft");
  const liveEvents = allEvents.filter((e) => e.state === "live");
  const publications = (pubs ?? []) as unknown as Publication[];
  const pending = publications.find((p) => p.status === "pending");
  const changed = fingerprint(draft, draftEvents) !== fingerprint(live, liveEvents);
  const lastPublished = publications.find((p) => p.status === "approved" || p.status === "published");

  return (
    <>
      <PageHeader
        title="Timetable"
        subtitle={
          profile.role === "admin_manager"
            ? "Edit the draft class schedule and calendar, then publish. Your publication goes live once the Principal approves it."
            : profile.role === "principal"
              ? "Edit the draft class schedule and calendar, then publish. You also approve the Admin Manager's publications."
              : "Read-only. The Principal and the Admin Manager keep the timetable."
        }
      />
      <Flash params={params} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Classes in draft" value={draft.length} />
        <Stat label="Classes published" value={live.length} />
        <Stat label="Draft" value={changed ? "Has changes" : "Same as published"} />
        <Stat label="Last published" value={lastPublished ? formatDay(lastPublished.reviewed_at ?? lastPublished.requested_at) : "Never"} />
      </div>
      {pending && (
        <Alert tone="warning" title={`${pending.publication_no} is awaiting the Principal's approval`} className="mb-5">
          Submitted by {pending.requester?.full_name ?? "the Admin Manager"} {formatDate(pending.requested_at)}. See Publish.
        </Alert>
      )}
      <Tabs
        items={[
          { href: "/timetable", label: "Class schedule (draft)", active: tab === "schedule" },
          { href: `/timetable?tab=calendar&month=${month}`, label: "Calendar (draft)", active: tab === "calendar" },
          { href: "/timetable?tab=publish", label: "Publish", active: tab === "publish", count: pending ? 1 : undefined },
          { href: `/timetable?tab=live&month=${month}`, label: "Published timetable", active: tab === "live" },
        ]}
      />

      {tab === "schedule" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardTitle description="Weekly classes. A class can be for a whole course or one class (batch) of it.">Draft class schedule</CardTitle>
            <Table head={["Day", "Time", "Course", "Class", "Room", ""]} empty={!draft.length}>
              {draft.map((s) => (
                <tr key={s.id}>
                  <Td>{WEEKDAYS[s.weekday - 1]}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{hhmm(s.starts_at)}–{hhmm(s.ends_at)}</Td>
                  <Td><p className="font-medium">{s.course?.title}</p><p className="font-mono text-xs text-muted-foreground">{s.course?.code}</p></Td>
                  <Td>{s.batch?.name ?? "Whole course"}</Td>
                  <Td>{s.room || "—"}</Td>
                  <Td className="text-right">
                    {canEdit && (
                      <form action={removeSlot}>
                        <input type="hidden" name="id" value={s.id} />
                        <SubmitButton size="sm" variant="ghost">Remove</SubmitButton>
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
          {canEdit && (
            <Card className="h-fit">
              <CardTitle description="Clashes of room, Faculty or class are refused.">Add a class</CardTitle>
              <form action={addSlot} className="space-y-3">
                <Label label="Course">
                  <Select name="course_id" required defaultValue="">
                    <option value="" disabled>Choose a course</option>
                    {courses?.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.code})</option>)}
                  </Select>
                </Label>
                <Label label="Class" hint="Leave as whole course unless the class meets separately.">
                  <Select name="batch_id" defaultValue="">
                    <option value="">Whole course</option>
                    {batches?.map((b) => {
                      const course = courses?.find((c) => c.id === b.course_id);
                      return course ? <option key={b.id} value={b.id}>{course.code} · {b.name}</option> : null;
                    })}
                  </Select>
                </Label>
                <Label label="Day">
                  <Select name="weekday" defaultValue="1">
                    {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                  </Select>
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <Label label="Starts"><Input name="starts_at" type="time" required /></Label>
                  <Label label="Ends"><Input name="ends_at" type="time" required /></Label>
                </div>
                <Label label="Room"><Input name="room" placeholder="e.g. Lab 2" /></Label>
                <SubmitButton className="w-full">Add to draft</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === "calendar" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <Card>
              <CardTitle description="Holidays, exam weeks, term dates and events. No classes are shown on holidays.">Draft calendar events</CardTitle>
              <Table head={["Dates", "Event", "Type", "For", ""]} empty={!draftEvents.length}>
                {draftEvents.map((e) => (
                  <tr key={e.id}>
                    <Td className="whitespace-nowrap">{formatDay(e.starts_on)}{e.ends_on !== e.starts_on ? ` – ${formatDay(e.ends_on)}` : ""}</Td>
                    <Td><p className="font-medium">{e.title}</p>{e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}</Td>
                    <Td><Badge value={e.kind}>{EVENT_KINDS[e.kind] ?? e.kind}</Badge></Td>
                    <Td>{e.course?.title ?? "Everyone"}</Td>
                    <Td className="text-right">
                      {canEdit && (
                        <form action={removeEvent}>
                          <input type="hidden" name="id" value={e.id} />
                          <SubmitButton size="sm" variant="ghost">Remove</SubmitButton>
                        </form>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
            {canEdit && (
              <Card className="h-fit">
                <CardTitle>Add an event</CardTitle>
                <form action={addEvent} className="space-y-3">
                  <Label label="Title"><Input name="title" required placeholder="e.g. Independence Day" /></Label>
                  <Label label="Type">
                    <Select name="kind" defaultValue="holiday">
                      {Object.entries(EVENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Label label="From"><Input name="starts_on" type="date" required /></Label>
                    <Label label="To"><Input name="ends_on" type="date" /></Label>
                  </div>
                  <Label label="For">
                    <Select name="course_id" defaultValue="">
                      <option value="">Everyone</option>
                      {courses?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </Select>
                  </Label>
                  <Label label="Notes"><Input name="notes" /></Label>
                  <SubmitButton className="w-full">Add to draft</SubmitButton>
                </form>
              </Card>
            )}
          </div>
          <MonthCalendar month={month} href={(m) => `/timetable?tab=calendar&month=${m}`} slots={draft} events={draftEvents} />
        </div>
      )}

      {tab === "publish" && (
        <div className="space-y-6">
          {canEdit && !pending && (
            <Card>
              <CardTitle
                description={
                  profile.role === "principal"
                    ? "Publishing replaces the live timetable with the draft at once. Faculty and students are notified."
                    : "The Principal must approve your publication. Once approved, it replaces the live timetable and Faculty and students are notified."
                }
              >
                Publish the draft ({draft.length} classes, {draftEvents.length} events)
              </CardTitle>
              {!changed && <Alert tone="info" className="mb-3">The draft is the same as the published timetable.</Alert>}
              <form action={publishTimetable} className="flex flex-wrap items-end gap-3">
                <Label label="Note (optional)" className="min-w-72 flex-1"><Input name="note" placeholder="What changed" /></Label>
                <SubmitButton confirm={profile.role === "principal" ? "The live timetable will be replaced and Faculty and students notified." : "It will be sent to the Principal for approval."}>
                  {profile.role === "principal" ? "Publish now" : "Submit for approval"}
                </SubmitButton>
              </form>
            </Card>
          )}
          {pending && (
            <Card>
              <CardTitle description={`${pending.slot_count} classes, ${pending.event_count} events · submitted by ${pending.requester?.full_name ?? "—"} ${formatDate(pending.requested_at)}`}>
                {pending.publication_no} awaiting approval
              </CardTitle>
              {pending.note && <p className="mb-3 text-sm">{pending.note}</p>}
              {profile.role === "principal" ? (
                <div className="flex flex-wrap items-start gap-3">
                  <form action={reviewTimetable}>
                    <input type="hidden" name="id" value={pending.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <SubmitButton variant="success" confirm="The live timetable will be replaced with this one and Faculty and students notified.">Approve and publish</SubmitButton>
                  </form>
                  <form action={reviewTimetable} className="flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={pending.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <Input name="note" placeholder="Reason" aria-label="Reason for rejecting" className="w-64" required />
                    <SubmitButton variant="outline">Reject</SubmitButton>
                  </form>
                </div>
              ) : pending.requested_by === profile.id ? (
                <form action={reviewTimetable}>
                  <input type="hidden" name="id" value={pending.id} />
                  <input type="hidden" name="decision" value="withdraw" />
                  <SubmitButton variant="outline">Withdraw</SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">Awaiting the Principal.</p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Review the submitted classes under Class schedule; they match the draft as it was when submitted.</p>
            </Card>
          )}
          <Card>
            <CardTitle>Publication history</CardTitle>
            <Table head={["No.", "Contents", "Submitted", "Status", "Note"]} empty={!publications.length}>
              {publications.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono text-xs">{p.publication_no}</Td>
                  <Td>{p.slot_count} classes, {p.event_count} events</Td>
                  <Td className="text-xs">{p.requester?.full_name ?? "—"}<p className="text-muted-foreground">{formatDate(p.requested_at)}</p></Td>
                  <Td><Badge value={PUB_STATUS[p.status]?.tone ?? p.status}>{PUB_STATUS[p.status]?.label ?? p.status}</Badge></Td>
                  <Td className="max-w-64 text-xs text-muted-foreground">{[p.note, p.review_note].filter(Boolean).join(" · ") || "—"}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}

      {tab === "live" && (
        <div className="space-y-6">
          <WeekTimetable slots={live} empty="Nothing has been published yet." />
          <MonthCalendar month={month} href={(m) => `/timetable?tab=live&month=${m}`} slots={live} events={liveEvents} />
        </div>
      )}
    </>
  );
}
