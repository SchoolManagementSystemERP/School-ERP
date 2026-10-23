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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Edit, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { BOOK_CATEGORIES } from "@/data/library";
import { availableCopies, bookStore, copiesOut, removeBook, useBooks, useLoans } from "@/store/library";

const emptyBook = { title: "", author: "", isbn: "", category: "", publisher: "", edition: "", publishYear: "", totalCopies: "", rack: "" };

export function LibraryBooks() {
  const allBooks = useBooks();
  const loans = useLoans();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  // null = adding a new book, otherwise the id being edited
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyBook);

  const categories = [
    { value: "all", label: "All Categories" },
    ...BOOK_CATEGORIES.map((c) => ({ value: c.toLowerCase(), label: c })),
  ];

  const books = allBooks.map((b) => ({ ...b, availableCopies: availableCopies(b, loans) }));

  const filteredBooks = books.filter((book) => {
    const matchesSearch =
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.isbn.includes(searchQuery);
    const matchesCategory =
      selectedCategory === "all" ||
      book.category.toLowerCase() === categories.find((c) => c.value === selectedCategory)?.label.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyBook);
    setIsAddDialogOpen(true);
  };

  const handleAddBook = () => {
    const totalCopies = Number(form.totalCopies);
    if (!form.title.trim() || !form.author.trim() || !form.category || !totalCopies || totalCopies < 1) {
      toast.error("Title, author, category and copies are required");
      return;
    }
    const record = {
      title: form.title.trim(), author: form.author.trim(), isbn: form.isbn.trim(), category: form.category,
      publisher: form.publisher.trim(), edition: form.edition.trim(), rack: form.rack.trim(),
      publishYear: Number(form.publishYear) || new Date().getFullYear(), totalCopies,
    };
    if (editingId === null) {
      bookStore.add(record);
      toast.success("Book added successfully!");
    } else {
      const out = copiesOut(editingId, loans);
      if (totalCopies < out) { toast.error(`${out} copies are issued — total copies cannot be less than that`); return; }
      bookStore.update({ ...record, id: editingId });
      toast.success("Book updated successfully!");
    }
    setIsAddDialogOpen(false);
  };

  const handleEditBook = (bookId: number) => {
    const book = allBooks.find((b) => b.id === bookId);
    if (!book) return;
    setEditingId(bookId);
    setForm({
      title: book.title, author: book.author, isbn: book.isbn, category: book.category, publisher: book.publisher,
      edition: book.edition, publishYear: String(book.publishYear), totalCopies: String(book.totalCopies), rack: book.rack,
    });
    setIsAddDialogOpen(true);
  };

  const handleDeleteBook = (bookId: number) => {
    const error = removeBook(bookId);
    if (error) toast.error(error);
    else toast.success("Book deleted successfully!");
  };

  const getAvailabilityBadge = (available: number, total: number) => {
    const percentage = (available / total) * 100;
    if (percentage === 0) {
      return <Badge variant="destructive">All Issued</Badge>;
    } else if (percentage < 50) {
      return <Badge className="bg-orange-600">Low Availability</Badge>;
    }
    return <Badge variant="default" className="bg-green-600">Available</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Library Books Catalog</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all books in the library collection</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add New Book
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId === null ? "Add New Book" : "Edit Book"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>Book Title</Label>
                <Input placeholder="Enter book title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Author</Label>
                <Input placeholder="Enter author name" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>ISBN</Label>
                <Input placeholder="Enter ISBN" value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter((c) => c.value !== "all").map((cat) => (
                      <SelectItem key={cat.value} value={cat.label}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Publisher</Label>
                <Input placeholder="Enter publisher name" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Edition</Label>
                <Input placeholder="Enter edition" value={form.edition} onChange={(e) => setForm({ ...form, edition: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Publish Year</Label>
                <Input type="number" placeholder="Enter year" value={form.publishYear} onChange={(e) => setForm({ ...form, publishYear: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Total Copies</Label>
                <Input type="number" placeholder="Enter number of copies" value={form.totalCopies} onChange={(e) => setForm({ ...form, totalCopies: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Rack Location</Label>
                <Input placeholder="Enter rack number" value={form.rack} onChange={(e) => setForm({ ...form, rack: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddBook}>{editingId === null ? "Add Book" : "Save Changes"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by title, author, or ISBN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Books Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredBooks.map((book) => (
          <Card key={book.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
                    <BookOpen className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{book.title}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{book.author}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary">{book.category}</Badge>
                      {getAvailabilityBadge(book.availableCopies, book.totalCopies)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditBook(book.id)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteBook(book.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">ISBN</p>
                  <p className="font-medium text-foreground">{book.isbn}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Publisher</p>
                  <p className="font-medium text-foreground">{book.publisher}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Edition</p>
                  <p className="font-medium text-foreground">{book.edition}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Year</p>
                  <p className="font-medium text-foreground">{book.publishYear}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Rack Location</p>
                  <p className="font-medium text-foreground">{book.rack}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Availability</p>
                  <p className="font-semibold text-foreground">
                    {book.availableCopies} / {book.totalCopies}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredBooks.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No books found matching your criteria</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
