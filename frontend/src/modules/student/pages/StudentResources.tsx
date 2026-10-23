import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Download, FileText, File, Search, Calendar } from "lucide-react";
import { toast } from "sonner";
import { downloadNote, useNotes } from "@/store/notes";
import { useCurrentStudent } from "@/store/session";

export function StudentResources() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");

  const student = useCurrentStudent();
  const notes = useNotes().filter((n) => student && n.class === student.class);

  const resources = notes.map((n) => ({
    id: n.id,
    title: n.title,
    subject: n.subject,
    type: (n.fileName.split(".").pop() ?? "file").toUpperCase(),
    size: n.fileSize,
    uploadedBy: n.uploadedBy,
    uploadedDate: n.uploadDate,
    downloads: n.downloads,
    description: n.description,
  }));

  const subjects = [
    { value: "all", label: "All Subjects" },
    ...[...new Set(resources.map((r) => r.subject))].map((sub) => ({ value: sub.toLowerCase(), label: sub })),
  ];

  const filteredResources = resources.filter((resource) => {
    const matchesSearch =
      resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject =
      selectedSubject === "all" ||
      resource.subject.toLowerCase() === subjects.find((s) => s.value === selectedSubject)?.label.toLowerCase();
    return matchesSearch && matchesSubject;
  });

  const handleDownload = (resourceId: number, title: string) => {
    const note = notes.find((n) => n.id === resourceId);
    if (note) downloadNote(note);
    toast.success(`Downloading ${title}...`);
  };

  const getFileIcon = (type: string) => {
    if (type === "PDF") {
      return <FileText className="h-5 w-5 text-red-600" />;
    } else if (type === "DOCX") {
      return <File className="h-5 w-5 text-blue-600" />;
    } else if (type === "PPTX") {
      return <File className="h-5 w-5 text-orange-600" />;
    }
    return <File className="h-5 w-5 text-muted-foreground" />;
  };

  const totalResources = filteredResources.length;
  const subjectCounts = subjects
    .filter((s) => s.value !== "all")
    .map((subject) => ({
      subject: subject.label,
      count: resources.filter((r) => r.subject === subject.label).length,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Study Resources</h1>
        <p className="text-sm text-muted-foreground mt-1">Access notes, study materials, and resources</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{totalResources}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Resources</p>
            </div>
          </CardContent>
        </Card>
        {subjectCounts.map((item, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{item.count}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.subject}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search resources by title or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div>
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.value} value={subject.value}>
                      {subject.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredResources.map((resource) => (
          <Card key={resource.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-1">{getFileIcon(resource.type)}</div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{resource.title}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{resource.description}</p>
                  </div>
                </div>
                <Badge variant="secondary">{resource.type}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Subject</p>
                  <p className="font-medium text-foreground">{resource.subject}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Size</p>
                  <p className="font-medium text-foreground">{resource.size}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Uploaded By</p>
                  <p className="font-medium text-foreground">{resource.uploadedBy}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Downloads</p>
                  <p className="font-medium text-foreground">{resource.downloads}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                <Calendar className="h-3 w-3" />
                Uploaded on {resource.uploadedDate}
              </div>

              <Button
                className="w-full gap-2"
                onClick={() => handleDownload(resource.id, resource.title)}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredResources.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No resources found matching your criteria</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
