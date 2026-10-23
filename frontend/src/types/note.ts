export interface StudyNote {
  id: number;
  title: string;
  subject: string;
  /** e.g. "Class 10-A" */
  class: string;
  description: string;
  fileName: string;
  fileSize: string;
  /** YYYY-MM-DD */
  uploadDate: string;
  uploadedBy: string;
  downloads: number;
}
