/** School grading scale used on every marks page. 33% is the pass mark. */
export function gradeFor(percentage: number): string {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 33) return "D";
  return "F";
}

export const PASS_PERCENTAGE = 33;
