export type TeacherStatus = "Active" | "On Leave" | "Suspended" | "Resigned";
export type EmploymentType = "Permanent" | "Probation" | "Contract" | "Part-Time" | "Guest Faculty";

export interface ClassSubjectEntry {
  className: string;
  subjects: string[];
}

export interface Qualification {
  degree: string;
  institute: string;
  board: string;
  year: string;
  percentage: string;
}

export interface Experience {
  schoolName: string;
  designation: string;
  from: string;
  to: string;
  reasonLeaving: string;
}

export interface Teacher {
  id: number;
  empId: string;
  name: string;
  gender: string;
  dob: string;
  bloodGroup: string;
  phone: string;
  alternatePhone: string;
  email: string;
  personalEmail: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  permanentAddress: string;
  permanentCity: string;
  permanentState: string;
  permanentPincode: string;
  aadhar: string;
  pan: string;
  nationality: string;
  religion: string;
  category: string;
  maritalStatus: string;
  fatherName: string;
  fatherOccupation: string;
  fatherPhone: string;
  motherName: string;
  motherOccupation: string;
  spouseName: string;
  spouseOccupation: string;
  spousePhone: string;
  children: string;
  emergencyContact: string;
  emergencyRelation: string;
  emergencyPhone: string;
  designation: string;
  department: string;
  positions: string[];
  classTeacherOf: string;
  classSubjects: ClassSubjectEntry[];
  joiningDate: string;
  employmentType: EmploymentType;
  experience: string;
  reportingTo: string;
  academicYear: string;
  medium: string;
  highestQualification: string;
  qualifications: Qualification[];
  bEd: boolean;
  bEdInstitute: string;
  bEdYear: string;
  bEdPercent: string;
  tet: boolean;
  tetLevel: string;
  tetScore: string;
  tetYear: string;
  ctet: boolean;
  ctetPaper: string;
  ctetScore: string;
  ctetYear: string;
  otherCerts: string;
  totalExperience: string;
  experiences: Experience[];
  bankName: string;
  accountNo: string;
  ifscCode: string;
  branchName: string;
  accountType: string;
  basicSalary: string;
  hra: string;
  da: string;
  ta: string;
  otherAllowances: string;
  salaryGrade: string;
  pfNo: string;
  esiNo: string;
  gpfNo: string;
  height: string;
  weight: string;
  bloodGroupHealth: string;
  medicalCondition: string;
  allergies: string;
  specialNeeds: string;
  doctorName: string;
  doctorPhone: string;
  physicallyHandicapped: boolean;
  handicapType: string;
  handicapPercent: string;
  docAadhar: boolean;
  docPan: boolean;
  docDegree: boolean;
  docBEd: boolean;
  docTET: boolean;
  docExperience: boolean;
  docCaste: boolean;
  docResidence: boolean;
  docPassport: boolean;
  docMedical: boolean;
  docPoliceVerification: boolean;
  status: TeacherStatus;
  initials: string;
}
