import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Eye, Filter, ScrollText } from "lucide-react";
import { api, errorMessage } from "@/api/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "EXPORT" | "READ" | "ACTION";
type AuditEvent = {
  id: string;
  createdAt: string;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  branch: string;
  user: string;
  username: string;
  ip: string | null;
  before: string | null;
  after: string | null;
};
type AuditResponse = { total: number; page: number; pageSize: number; events: AuditEvent[] };
type Filters = { action: string; entity: string; from: string; to: string };

const ACTION_TONE: Record<AuditAction, string> = {
  CREATE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  UPDATE: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  DELETE: "bg-red-500/10 text-red-700 dark:text-red-300",
  LOGIN: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  EXPORT: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  READ: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  ACTION: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
};
const ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  LOGIN: "Login",
  EXPORT: "Exported",
  READ: "Viewed",
  ACTION: "Activity",
};

function parseDetails(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function detailLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function DetailValue({ value }: { value: unknown }): ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
  if (typeof value === "boolean") return <Badge variant="outline" className={value ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "border-muted-foreground/30"}>{value ? "Yes" : "No"}</Badge>;
  if (typeof value === "number") return <span className="font-medium tabular-nums">{value.toLocaleString()}</span>;
  if (typeof value === "string") return <span className="break-words">{value}</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-muted-foreground">None</span>;
    return (
      <ul className="space-y-1.5">
        {value.map((item, index) => <li key={index} className="rounded-md border bg-background/70 p-2"><DetailValue value={item} /></li>)}
      </ul>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return <span className="text-muted-foreground">No fields</span>;
    return (
      <dl className="divide-y rounded-md border bg-background/70">
        {entries.map(([key, item]) => (
          <div key={key} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(8rem,0.8fr)_2fr] sm:gap-4">
            <dt className="text-xs font-medium text-muted-foreground">{detailLabel(key)}</dt>
            <dd className="min-w-0 text-sm"><DetailValue value={item} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

export function AuditLog() {
  const [filters, setFilters] = useState<Filters>({ action: "ALL", entity: "", from: "", to: "" });
  const [applied, setApplied] = useState<Filters>(filters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (applied.action !== "ALL") params.set("action", applied.action);
    if (applied.entity.trim()) params.set("entity", applied.entity.trim());
    if (applied.from) params.set("from", applied.from);
    if (applied.to) params.set("to", applied.to);
    setLoading(true);
    setError("");
    api.get<AuditResponse>(`/audit-log?${params.toString()}`)
      .then((data) => { if (active) setResult(data); })
      .catch((cause: unknown) => { if (active) setError(errorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, page]);

  const applyFilters = () => {
    setPage(1);
    setApplied({ ...filters });
  };
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / 50));
  const rangeStart = result?.total ? (page - 1) * 50 + 1 : 0;
  const rangeEnd = Math.min(page * 50, result?.total ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="Read-only history of system activity and changes across school modules, with actor, time, branch and recorded details." />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
          <div className="space-y-1.5">
            <Label>Action</Label>
            <Select value={filters.action} onValueChange={(action) => setFilters({ ...filters, action })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All actions</SelectItem>
                {(["CREATE", "UPDATE", "DELETE", "LOGIN", "EXPORT", "READ", "ACTION"] as const).map((action) => <SelectItem key={action} value={action}>{action === "READ" ? "Viewed" : action === "ACTION" ? "Action" : action}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Record type</Label><Input placeholder="e.g. FeePlan" value={filters.entity} onChange={(event) => setFilters({ ...filters, entity: event.target.value })} /></div>
          <div className="space-y-1.5"><Label>From date</Label><Input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></div>
          <div className="space-y-1.5"><Label>To date</Label><Input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></div>
          <Button className="gap-2" onClick={applyFilters}><Filter className="h-4 w-4" />Apply</Button>
        </CardContent>
      </Card>

      {error && <Card><CardContent className="p-5 text-sm text-destructive">{error}</CardContent></Card>}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Record</TableHead>
                <TableHead>Branch</TableHead><TableHead>Performed by</TableHead><TableHead>IP</TableHead><TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result?.events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap">
                    <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />{new Date(event.createdAt).toLocaleString()}</span>
                  </TableCell>
                  <TableCell><Badge className={ACTION_TONE[event.action]}>{ACTION_LABEL[event.action]}</Badge></TableCell>
                  <TableCell><span className="font-medium">{event.entity}</span><span className="block max-w-48 truncate font-mono text-xs text-muted-foreground" title={event.entityId ?? ""}>{event.entityId ?? "—"}</span></TableCell>
                  <TableCell>{event.branch}</TableCell>
                  <TableCell><span className="font-medium">{event.user}</span><span className="block text-xs text-muted-foreground">{event.username}</span></TableCell>
                  <TableCell className="font-mono text-xs">{event.ip ?? "—"}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelectedEvent(event)}>
                      <Eye className="h-3.5 w-3.5" />View details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && !error && !result?.events.length && <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground"><ScrollText className="mx-auto mb-2 h-5 w-5" />No audit events match these filters.</TableCell></TableRow>}
              {loading && <TableRow><TableCell colSpan={7} className="h-20 text-center text-muted-foreground">Loading audit events…</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}>
        {selectedEvent && (
          <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={ACTION_TONE[selectedEvent.action]}>{ACTION_LABEL[selectedEvent.action]}</Badge>
                <span className="text-sm text-muted-foreground">{selectedEvent.entity}</span>
              </div>
              <DialogTitle>Activity details</DialogTitle>
              <DialogDescription>Review who made this change, where it happened, and the recorded field values.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Date and time</p><p className="mt-1 text-sm font-medium">{new Date(selectedEvent.createdAt).toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">Performed by</p><p className="mt-1 text-sm font-medium">{selectedEvent.user}</p><p className="text-xs text-muted-foreground">{selectedEvent.username}</p></div>
              <div><p className="text-xs text-muted-foreground">Branch</p><p className="mt-1 text-sm font-medium">{selectedEvent.branch}</p></div>
              <div><p className="text-xs text-muted-foreground">IP address</p><p className="mt-1 break-all font-mono text-sm">{selectedEvent.ip ?? "—"}</p></div>
              <div className="sm:col-span-2 lg:col-span-4"><p className="text-xs text-muted-foreground">Record ID</p><p className="mt-1 break-all font-mono text-xs">{selectedEvent.entityId ?? "—"}</p></div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {(["before", "after"] as const).map((side) => {
                const details = parseDetails(selectedEvent[side]);
                return (
                  <section key={side} className="min-w-0 space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <span className={`h-2 w-2 rounded-full ${side === "before" ? "bg-amber-500" : "bg-emerald-500"}`} />
                      {side === "before" ? "Before change" : "After change"}
                    </h3>
                    <div className="max-h-[38vh] overflow-auto rounded-lg bg-muted/40 p-3">
                      {details === null ? <p className="py-4 text-center text-sm text-muted-foreground">No details recorded</p> : <DetailValue value={details} />}
                    </div>
                  </section>
                );
              })}
            </div>
          </DialogContent>
        )}
      </Dialog>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{rangeStart}–{rangeEnd} of {result?.total ?? 0} events</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" />Previous</Button>
          <span>Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
