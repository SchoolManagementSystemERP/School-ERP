import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { itemStore, updateSettings, useInventorySettings, useItems } from "@/store/inventory";

/** Add / remove entries of a simple string list (warehouses, units). */
export function ListEditor({
  values, onChange, placeholder, usage,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  /** How many items use a value; values in use cannot be removed. */
  usage: (value: string) => number;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) { toast.error(`"${v}" already exists`); return; }
    onChange([...values, v]);
    setDraft("");
    toast.success(`"${v}" added`);
  };

  const remove = (v: string) => {
    const used = usage(v);
    if (used) { toast.error(`"${v}" is used by ${used} item${used > 1 ? "s" : ""}`); return; }
    onChange(values.filter((x) => x !== v));
    toast.success(`"${v}" removed`);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button onClick={add} className="gap-1"><Plus className="h-4 w-4" /> Add</Button>
      </div>
      <div className="divide-y divide-border border border-border rounded-lg">
        {values.map((v) => (
          <div key={v} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-foreground">{v}</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-foreground/50">{usage(v)} items</span>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(v)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        {values.length === 0 && <p className="px-3 py-4 text-sm text-foreground/50">Nothing added yet.</p>}
      </div>
    </div>
  );
}

/** Add, rename and delete item categories. Renaming moves its items along. */
export function CategoryEditor() {
  const settings = useInventorySettings();
  const items = useItems();
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", description: "" });

  const countIn = (name: string) => items.filter((i) => i.category === name).length;

  const add = () => {
    const name = draft.name.trim();
    if (!name) { toast.error("Category name is required"); return; }
    if (settings.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) { toast.error(`"${name}" already exists`); return; }
    updateSettings({ categories: [...settings.categories, { name, description: draft.description.trim() }] });
    setDraft({ name: "", description: "" });
    toast.success(`Category "${name}" added`);
  };

  const save = (old: string) => {
    const name = edit.name.trim();
    if (!name) { toast.error("Category name is required"); return; }
    if (name !== old && settings.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) { toast.error(`"${name}" already exists`); return; }
    updateSettings({ categories: settings.categories.map((c) => (c.name === old ? { name, description: edit.description.trim() } : c)) });
    if (name !== old) items.filter((i) => i.category === old).forEach((i) => itemStore.update({ ...i, category: name }));
    setEditing(null);
    toast.success("Category updated");
  };

  const remove = (name: string) => {
    const used = countIn(name);
    if (used) { toast.error(`Move or delete the ${used} item${used > 1 ? "s" : ""} in "${name}" first`); return; }
    updateSettings({ categories: settings.categories.filter((c) => c.name !== name) });
    toast.success(`Category "${name}" deleted`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Category name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="sm:w-56" />
        <Input placeholder="Description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <Button onClick={add} className="gap-1"><Plus className="h-4 w-4" /> Add</Button>
      </div>
      <div className="divide-y divide-border border border-border rounded-lg">
        {settings.categories.map((c) => (
          <div key={c.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5">
            {editing === c.name ? (
              <div className="flex flex-col sm:flex-row gap-2 flex-1">
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="sm:w-56" />
                <Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-foreground">{c.name}</p>
                {c.description && <p className="text-xs text-foreground/60">{c.description}</p>}
              </div>
            )}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-foreground/50">{countIn(c.name)} items</span>
              {editing === c.name ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => save(c.name)}><Save className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(c.name); setEdit({ ...c }); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(c.name)}><Trash2 className="h-4 w-4" /></Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
