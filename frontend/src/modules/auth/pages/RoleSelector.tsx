import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, BookOpen, Library, Package, School } from "lucide-react";

export function RoleSelector() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-7xl">
        <div className="text-center mb-8">
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">School ERP System</h1>
          <p className="text-sm text-muted-foreground mt-1">Select your role to continue</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">

          {/* Principal Portal */}
          <Card className="hover:shadow-xl transition-shadow cursor-pointer border-2 hover:border-violet-500 lg:col-span-1">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-20 h-20 bg-violet-100 dark:bg-violet-500/10 rounded-full flex items-center justify-center">
                <School className="h-10 w-10 text-violet-600" />
              </div>
              <CardTitle className="text-xl">Principal Portal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-center text-sm">
                Full school oversight — manage students, teachers, finance, library, inventory and more
              </p>
              <ul className="space-y-2 text-sm text-foreground/80">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-violet-600 rounded-full" />
                  Manage all students & teachers
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-violet-600 rounded-full" />
                  School-wide attendance & marks
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-violet-600 rounded-full" />
                  Finance & fee management
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-violet-600 rounded-full" />
                  Library & inventory control
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-violet-600 rounded-full" />
                  Reports & analytics
                </li>
              </ul>
              <Button
                className="w-full bg-violet-600 hover:bg-violet-700"
                size="lg"
                onClick={() => navigate("/principal")}
              >
                Enter Principal Portal
              </Button>
            </CardContent>
          </Card>

          {/* Teacher Portal */}
          <Card className="hover:shadow-xl transition-shadow cursor-pointer border-2 hover:border-blue-500">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-20 h-20 bg-blue-100 dark:bg-blue-500/10 rounded-full flex items-center justify-center">
                <GraduationCap className="h-10 w-10 text-blue-600" />
              </div>
              <CardTitle className="text-2xl">Teacher Portal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-center">
                Access teacher dashboard with attendance, marks management, notes upload, and student communication
              </p>
              <ul className="space-y-2 text-sm text-foreground/80">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                  Manage student attendance
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                  Upload and track marks
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                  Share study materials
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                  Create assignments
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                  View timetable
                </li>
              </ul>
              <Button
                className="w-full"
                size="lg"
                onClick={() => navigate("/teacher")}
              >
                Enter Teacher Portal
              </Button>
            </CardContent>
          </Card>

          {/* Student Portal */}
          <Card className="hover:shadow-xl transition-shadow cursor-pointer border-2 hover:border-green-500">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-20 h-20 bg-green-100 dark:bg-green-500/10 rounded-full flex items-center justify-center">
                <BookOpen className="h-10 w-10 text-green-600" />
              </div>
              <CardTitle className="text-xl">Student Portal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-center text-sm">
                Access student dashboard with marks, attendance, assignments, fees, and study resources
              </p>
              <ul className="space-y-2 text-sm text-foreground/80">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-600 rounded-full" />
                  View marks & results
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-600 rounded-full" />
                  Track attendance
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-600 rounded-full" />
                  Submit assignments
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-600 rounded-full" />
                  Pay & track fees
                </li>
              </ul>
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => navigate("/student")}
              >
                Enter Student Portal
              </Button>
            </CardContent>
          </Card>

          {/* Librarian Portal */}
          <Card className="hover:shadow-xl transition-shadow cursor-pointer border-2 hover:border-purple-500">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-20 h-20 bg-purple-100 dark:bg-purple-500/10 rounded-full flex items-center justify-center">
                <Library className="h-10 w-10 text-purple-600" />
              </div>
              <CardTitle className="text-xl">Librarian Portal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-center text-sm">
                Manage library books, issue and return books, track overdue items and fines
              </p>
              <ul className="space-y-2 text-sm text-foreground/80">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-600 rounded-full" />
                  Manage book catalogue
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-600 rounded-full" />
                  Issue & return books
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-600 rounded-full" />
                  Track overdue & fines
                </li>
              </ul>
              <Button
                className="w-full bg-purple-600 hover:bg-purple-700"
                onClick={() => navigate("/librarian")}
              >
                Enter Library Portal
              </Button>
            </CardContent>
          </Card>

          {/* Inventory Portal */}
          <Card className="hover:shadow-xl transition-shadow cursor-pointer border-2 hover:border-orange-500">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-20 h-20 bg-orange-100 dark:bg-orange-500/10 rounded-full flex items-center justify-center">
                <Package className="h-10 w-10 text-orange-600" />
              </div>
              <CardTitle className="text-xl">Inventory Portal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-center text-sm">
                Manage school inventory, track stock levels, and monitor asset allocation
              </p>
              <ul className="space-y-2 text-sm text-foreground/80">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-orange-600 rounded-full" />
                  Track stock levels
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-orange-600 rounded-full" />
                  Manage assets
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-orange-600 rounded-full" />
                  Low stock alerts
                </li>
              </ul>
              <Button
                className="w-full bg-orange-600 hover:bg-orange-700"
                onClick={() => navigate("/inventory")}
              >
                Enter Inventory Portal
              </Button>
            </CardContent>
          </Card>

        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Academic Year: 2025-26</p>
        </div>
      </div>
    </div>
  );
}