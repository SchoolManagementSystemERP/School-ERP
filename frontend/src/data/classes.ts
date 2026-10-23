export interface SchoolClass {
  /** Display name used across the app, e.g. "Class 10-A". */
  name: string;
  grade: number;
  section: string;
  classTeacher: string;
}

export const SCHOOL_CLASSES: SchoolClass[] = [
  { name: "Class 8-A",  grade: 8,  section: "A", classTeacher: "Mr. Nair"     },
  { name: "Class 8-B",  grade: 8,  section: "B", classTeacher: "Ms. Reddy"    },
  { name: "Class 9-A",  grade: 9,  section: "A", classTeacher: "Mrs. Sharma"  },
  { name: "Class 9-B",  grade: 9,  section: "B", classTeacher: "Mr. Patel"    },
  { name: "Class 10-A", grade: 10, section: "A", classTeacher: "Mrs. Gupta"   },
  { name: "Class 10-B", grade: 10, section: "B", classTeacher: "Mr. Roy"      },
  { name: "Class 11-A", grade: 11, section: "A", classTeacher: "Mr. Banerjee" },
  { name: "Class 11-B", grade: 11, section: "B", classTeacher: "Ms. Singh"    },
  { name: "Class 12-A", grade: 12, section: "A", classTeacher: "Mrs. Das"     },
  { name: "Class 12-B", grade: 12, section: "B", classTeacher: "Mr. Kapoor"   },
];

/** "Class 10-A" → "10-A" */
export function shortClassName(name: string) {
  return name.replace(/^Class\s+/, "");
}

/** Parses "Class 10-A" (or "10-A") into grade + section. Unknown formats get grade 0. */
export function parseClassName(name: string): { grade: number; section: string } {
  const [gradePart = "", section = ""] = shortClassName(name).split("-");
  return { grade: parseInt(gradePart, 10) || 0, section };
}

/** Sorts class names by grade, then section. */
export function sortClassNames(names: string[]) {
  return [...names].sort((a, b) => {
    const pa = parseClassName(a), pb = parseClassName(b);
    return pa.grade - pb.grade || pa.section.localeCompare(pb.section) || a.localeCompare(b);
  });
}
