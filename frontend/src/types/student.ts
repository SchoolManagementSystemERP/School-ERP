export type Performance = "Excellent" | "Good" | "Average" | "Poor";

export interface FeeRecord {
  month: string;
  tuition: number;
  transport: number;
  misc: number;
  paid: number;
  status: "Paid" | "Pending" | "Overdue";
  date: string;
}

export interface Student {
  id: number;
  rollNo: string;
  name: string;
  class: string;
  email: string;
  phone: string;
  attendance: number;
  performance: Performance;
  initials: string;

  firstName: string;
  middleName: string;
  lastName: string;
  dob: string;
  gender: string;
  bloodGroup: string;
  nationality: string;
  religion: string;
  category: string;

  admissionClass: string;
  admissionSection: string;
  admissionDate: string;
  admissionNo: string;
  academicYear: string;
  medium: string;

  presentAddress: string;
  presentCity: string;
  presentState: string;
  presentPincode: string;
  permanentAddress: string;
  permanentCity: string;
  permanentState: string;
  permanentPincode: string;

  aadharNo: string;
  birthCertNo: string;

  prevSchoolName: string;
  prevSchoolBoard: string;
  prevClass: string;
  prevPercentage: string;
  tcNo: string;

  fatherName: string;
  fatherOccupation: string;
  fatherPhone: string;
  fatherEmail: string;
  fatherAnnualIncome: string;
  motherName: string;
  motherOccupation: string;
  motherPhone: string;
  motherEmail: string;

  height: string;
  weight: string;
  bloodGroupHealth: string;
  medicalCondition: string;
  allergies: string;
  doctorName: string;
  doctorPhone: string;

  needsTransport: boolean;
  busRoute: string;
  busStop: string;
  pickupAddress: string;

  sports: string[];
  arts: string[];
  otherActivities: string;

  feeCategory: string;
  concessionType: string;
  concessionPercent: string;
  feeRecords: FeeRecord[];

  docBirthCert: boolean;
  docAadhar: boolean;
  docTC: boolean;
  docMarksheet: boolean;
  docPhotos: boolean;
  docCasteCert: boolean;
}
