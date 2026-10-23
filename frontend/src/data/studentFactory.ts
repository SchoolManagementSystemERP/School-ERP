import { parseClassName } from "@/data/classes";
import type { Student } from "@/types/student";

export function getInitials(name: string) {
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

/** Builds a new student record with blank defaults for every field not provided. */
export function createStudent(fields: Partial<Omit<Student, "id">> & Pick<Student, "name" | "class">): Omit<Student, "id"> {
  const [firstName = "", ...rest] = fields.name.trim().split(/\s+/);
  const { grade, section } = parseClassName(fields.class);
  return {
    rollNo: "", email: "", phone: "",
    attendance: 0, performance: "Average", initials: getInitials(fields.name),
    firstName, middleName: "", lastName: rest.join(" "),
    dob: "", gender: "", bloodGroup: "", nationality: "Indian", religion: "", category: "",
    admissionClass: grade ? String(grade) : "", admissionSection: section,
    admissionDate: new Date().toISOString().slice(0, 10),
    admissionNo: `ADM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    academicYear: "2025-26", medium: "",
    presentAddress: "", presentCity: "", presentState: "", presentPincode: "",
    permanentAddress: "", permanentCity: "", permanentState: "", permanentPincode: "",
    aadharNo: "", birthCertNo: "",
    prevSchoolName: "", prevSchoolBoard: "", prevClass: "", prevPercentage: "", tcNo: "",
    fatherName: "", fatherOccupation: "", fatherPhone: "", fatherEmail: "", fatherAnnualIncome: "",
    motherName: "", motherOccupation: "", motherPhone: "", motherEmail: "",
    height: "", weight: "", bloodGroupHealth: "", medicalCondition: "", allergies: "", doctorName: "", doctorPhone: "",
    needsTransport: false, busRoute: "", busStop: "", pickupAddress: "",
    sports: [], arts: [], otherActivities: "",
    feeCategory: "Regular", concessionType: "None", concessionPercent: "", feeRecords: [],
    docBirthCert: false, docAadhar: false, docTC: false, docMarksheet: false, docPhotos: false, docCasteCert: false,
    ...fields,
  };
}
