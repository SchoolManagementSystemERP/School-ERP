import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { NewTeacher } from "@/modules/school/forms/NewTeacher";

export function PrincipalTeacherSetup() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-violet-600" /> Add Teacher
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NewTeacher />
        </CardContent>
      </Card>
    </div>
  );
}

