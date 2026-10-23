import {
  Atom, Award, Baby, BookOpen, Brush, Bus, Calculator, Camera, Cpu, Dumbbell, FlaskConical, Globe2, HeartPulse, Leaf,
  Medal, Microscope, Monitor, Music, Palette, Presentation, ShieldCheck, Theater, Trophy, Utensils, Video, type LucideIcon,
} from "lucide-react";

export const SITE_NAV = [
  { label: "Home", to: "" },
  { label: "About", to: "about" },
  { label: "Academics", to: "academics" },
  { label: "Admissions", to: "admissions" },
  { label: "Facilities", to: "facilities" },
  { label: "Student Life", to: "student-life" },
  { label: "Notices", to: "notices" },
  { label: "Careers", to: "careers" },
  { label: "Contact", to: "contact" },
];

export const SITE_MORE = [
  { label: "Faculty", to: "faculty" },
  { label: "Gallery", to: "gallery" },
  { label: "Alumni", to: "alumni" },
  { label: "Mandatory Disclosure", to: "disclosure" },
];

export interface Facility {
  icon: LucideIcon;
  title: string;
  text: string;
  tone: string;
}

export const FACILITIES: Facility[] = [
  { icon: Monitor, title: "Smart Classrooms", text: "Every classroom has an interactive panel, projector and audio system, with digital content for every subject.", tone: "from-sky-500 to-blue-700" },
  { icon: FlaskConical, title: "Science Laboratories", text: "Separate Physics, Chemistry and Biology labs equipped for the full CBSE practical syllabus.", tone: "from-emerald-500 to-teal-700" },
  { icon: Cpu, title: "Computer & Robotics Lab", text: "90 computers, high-speed internet, robotics kits and a 3D printer for coding and AI clubs.", tone: "from-violet-500 to-indigo-700" },
  { icon: Atom, title: "Atal Tinkering Lab", text: "A maker space with electronics, sensors and tools where students build their own projects.", tone: "from-fuchsia-500 to-purple-700" },
  { icon: BookOpen, title: "Library", text: "18,000+ books, 40 magazines and journals, e-library access and a quiet reading zone.", tone: "from-amber-500 to-orange-700" },
  { icon: Dumbbell, title: "Sports Complex", text: "Football and cricket grounds, basketball and tennis courts, indoor badminton and a skating rink.", tone: "from-rose-500 to-red-700" },
  { icon: Music, title: "Music & Dance Studios", text: "Indian and western music rooms, instruments, and a sprung-floor dance studio.", tone: "from-pink-500 to-rose-700" },
  { icon: Theater, title: "Auditorium", text: "An 800-seat air-conditioned auditorium for assemblies, annual day and performances.", tone: "from-indigo-500 to-blue-800" },
  { icon: Bus, title: "Transport", text: "GPS-tracked buses covering 32 routes across Lucknow, each with a trained attendant.", tone: "from-yellow-500 to-amber-700" },
  { icon: HeartPulse, title: "Medical Room", text: "A full-time nurse, visiting doctor, first-aid at every floor and regular health check-ups.", tone: "from-red-500 to-rose-700" },
  { icon: Utensils, title: "Cafeteria", text: "Hygienic, nutritious vegetarian meals planned by a dietician, served in a spacious dining hall.", tone: "from-lime-500 to-green-700" },
  { icon: ShieldCheck, title: "Safety & Security", text: "CCTV across the campus, trained guards, visitor management, fire safety and drills every term.", tone: "from-slate-500 to-slate-800" },
];

export const STAGES = [
  { icon: Baby, title: "Pre-Primary", classes: "Nursery – UKG", text: "Play-based learning that builds language, numbers, motor skills and confidence in a warm, safe environment." },
  { icon: Palette, title: "Primary", classes: "Classes 1 – 5", text: "Strong foundations in reading, writing and maths through activities, stories, projects and experiments." },
  { icon: Microscope, title: "Middle", classes: "Classes 6 – 8", text: "Subject specialists, labs and clubs help students explore science, languages, arts and technology." },
  { icon: Calculator, title: "Secondary", classes: "Classes 9 – 10", text: "Focused CBSE board preparation with regular tests, remedial classes and career guidance." },
  { icon: Award, title: "Senior Secondary", classes: "Classes 11 – 12", text: "Science, Commerce and Humanities streams with competitive-exam foundation and university counselling." },
];

export const STREAMS = [
  { name: "Science (PCM)", subjects: ["Physics", "Chemistry", "Mathematics", "English", "Computer Science / Physical Education"] },
  { name: "Science (PCB)", subjects: ["Physics", "Chemistry", "Biology", "English", "Mathematics / Psychology"] },
  { name: "Commerce", subjects: ["Accountancy", "Business Studies", "Economics", "English", "Mathematics / Informatics Practices"] },
  { name: "Humanities", subjects: ["History", "Political Science", "Geography / Psychology", "English", "Economics / Fine Arts"] },
];

export const PEDAGOGY = [
  { title: "Experiential learning", text: "Concepts are taught through activities, experiments, field trips and projects." },
  { title: "Small class sizes", text: "A maximum of 35 students per section, so every child gets attention." },
  { title: "Continuous assessment", text: "Periodic tests, projects and portfolios — not just term-end exams." },
  { title: "Remedial & enrichment", text: "Extra support for students who need it and advanced challenges for those ready." },
  { title: "Life skills & values", text: "Weekly sessions on communication, wellbeing, financial literacy and citizenship." },
  { title: "Digital literacy", text: "Coding from Class 3, AI and robotics clubs, and safe-internet education." },
];

export const ADMISSION_STEPS = [
  { title: "Enquire", text: "Fill in the online enquiry form or visit the front office." },
  { title: "Register", text: "Collect / download the registration form and submit it with documents and the registration fee." },
  { title: "Interaction", text: "Informal interaction (Nursery–2) or a short assessment in English, Maths and Science (Class 3 onwards)." },
  { title: "Offer", text: "Selected applicants receive an offer letter by SMS and email." },
  { title: "Confirm", text: "Pay the admission fee and first installment within 7 days to confirm the seat." },
];

export const ADMISSION_DOCUMENTS = [
  "Birth certificate (Municipal Corporation)",
  "Aadhaar card of the child and parents",
  "Report card of the previous class",
  "Transfer certificate (Class 2 onwards) — countersigned if from another state",
  "6 recent passport-size photographs of the child",
  "Caste / EWS certificate, if applicable",
  "Proof of residence (any one)",
  "Medical fitness certificate",
];

export const AGE_CRITERIA = [
  { cls: "Nursery", age: "3+ years as on 31 March" },
  { cls: "LKG", age: "4+ years as on 31 March" },
  { cls: "UKG", age: "5+ years as on 31 March" },
  { cls: "Class 1", age: "6+ years as on 31 March" },
];

export const ADMISSION_DATES = [
  { what: "Registration opens", when: "1 November" },
  { what: "Last date for registration", when: "15 December" },
  { what: "Interaction / assessment", when: "5 – 20 January" },
  { what: "Result & offer letters", when: "1 February" },
  { what: "Fee deposit & confirmation", when: "by 15 February" },
  { what: "New session begins", when: "1 April" },
];

export const ONE_TIME_FEES = [
  { head: "Registration fee", amount: 1000 },
  { head: "Admission fee (one-time)", amount: 25000 },
  { head: "Caution money (refundable)", amount: 5000 },
];

export const CLUBS = [
  { icon: Cpu, name: "Robotics & AI" }, { icon: Presentation, name: "Debate & MUN" }, { icon: Music, name: "Music" },
  { icon: Brush, name: "Art & Craft" }, { icon: Theater, name: "Drama" }, { icon: Camera, name: "Photography" },
  { icon: Leaf, name: "Eco Club" }, { icon: Globe2, name: "Heritage & Quiz" }, { icon: Video, name: "Media & Film" },
  { icon: Calculator, name: "Maths Olympiad" }, { icon: FlaskConical, name: "Science Club" }, { icon: HeartPulse, name: "Yoga & Wellness" },
];

export const EVENTS = [
  { title: "Annual Day — 'Bharat: Unity in Diversity'", date: "14 February", text: "More than 600 students on stage in a celebration of India's music, dance and stories." },
  { title: "Science & Innovation Fair", date: "28 November", text: "180 projects by students from Classes 5–12, judged by scientists from CDRI Lucknow." },
  { title: "Inter-school Sports Meet", date: "10 – 12 December", text: "24 schools, 1,200 athletes, 30 events across athletics, football and basketball." },
  { title: "Founders' Day & Investiture", date: "15 July", text: "The new Student Council takes oath in the presence of parents and alumni." },
  { title: "Van Mahotsav", date: "5 July", text: "Students planted 500 saplings around the campus and in the neighbourhood." },
  { title: "Educational trip — Rishikesh", date: "October", text: "Classes 9–11 explored river ecology, rafting and team-building over four days." },
];

export const ACHIEVEMENTS = [
  { icon: Trophy, title: "CBSE Class 12 — 100% pass", text: "54 students scored 95% or above in the board examinations." },
  { icon: Medal, title: "National Science Olympiad", text: "12 gold medals and an international rank of 43." },
  { icon: Award, title: "State Football Champions", text: "Under-17 boys' team won the state school games." },
  { icon: Trophy, title: "Best Eco School (UP)", text: "Recognised for solar power, rainwater harvesting and zero-plastic campus." },
];

export const TOPPERS = [
  { name: "Ananya Mishra", cls: "Class 12 · Science", score: "99.2%", note: "Physics 100, Maths 100" },
  { name: "Arjun Tiwari", cls: "Class 12 · Commerce", score: "98.6%", note: "Accountancy 100" },
  { name: "Saanvi Kapoor", cls: "Class 12 · Humanities", score: "98.4%", note: "Political Science 100" },
  { name: "Vivaan Srivastava", cls: "Class 10", score: "99.0%", note: "Maths 100, Science 100" },
];

export const RESULTS = [
  { year: "2026", c10: "100%", c10avg: "88.4%", c12: "100%", c12avg: "86.9%" },
  { year: "2025", c10: "100%", c10avg: "87.1%", c12: "99.4%", c12avg: "85.2%" },
  { year: "2024", c10: "99.6%", c10avg: "86.3%", c12: "100%", c12avg: "84.8%" },
];

export interface GalleryItem {
  title: string;
  album: "Events" | "Sports" | "Campus" | "Academics" | "Celebrations";
  icon: LucideIcon;
  tone: string;
}

export const GALLERY: GalleryItem[] = [
  { title: "Annual Day finale", album: "Events", icon: Theater, tone: "from-fuchsia-500 to-purple-700" },
  { title: "Football finals", album: "Sports", icon: Trophy, tone: "from-emerald-500 to-green-700" },
  { title: "Science fair projects", album: "Academics", icon: FlaskConical, tone: "from-sky-500 to-blue-700" },
  { title: "Independence Day parade", album: "Celebrations", icon: Award, tone: "from-orange-500 to-amber-700" },
  { title: "Main building", album: "Campus", icon: Globe2, tone: "from-slate-500 to-slate-800" },
  { title: "Robotics workshop", album: "Academics", icon: Cpu, tone: "from-violet-500 to-indigo-700" },
  { title: "Athletics meet", album: "Sports", icon: Medal, tone: "from-rose-500 to-red-700" },
  { title: "Diwali celebrations", album: "Celebrations", icon: Palette, tone: "from-amber-500 to-orange-700" },
  { title: "Library reading week", album: "Academics", icon: BookOpen, tone: "from-yellow-500 to-amber-700" },
  { title: "Music concert", album: "Events", icon: Music, tone: "from-pink-500 to-rose-700" },
  { title: "Eco club plantation", album: "Events", icon: Leaf, tone: "from-lime-500 to-green-700" },
  { title: "Yoga day", album: "Sports", icon: HeartPulse, tone: "from-teal-500 to-cyan-700" },
];

export const DOWNLOADS = [
  { title: "Prospectus", size: "School profile, admissions and fees" },
  { title: "Registration form", size: "Fill and submit at the front office" },
  { title: "Book list & uniform details", size: "Class-wise for the new session" },
  { title: "Transport routes & stops", size: "All routes with pickup times" },
  { title: "Fee payment guide", size: "How to pay online with UPI / cards" },
  { title: "Academic calendar", size: "Exams, holidays and events" },
];

/** CBSE Mandatory Public Disclosure (Appendix IX of the Affiliation Bye-Laws). */
export const DISCLOSURE = {
  documents: [
    "Copies of affiliation / upgradation letter and recent extension of affiliation",
    "Copies of societies / trust / company registration and renewal certificate",
    "Copy of No Objection Certificate (NOC) issued by the State Government",
    "Copies of recognition certificate under RTE Act, 2009 and its renewal",
    "Copy of valid building safety certificate as per the National Building Code",
    "Copy of valid fire safety certificate issued by the competent authority",
    "Copy of the DEO certificate submitted by the school for affiliation / upgradation",
    "Copies of valid water, health and sanitation certificates",
  ],
  academics: [
    "Fee structure of the school",
    "Annual academic calendar",
    "List of School Management Committee (SMC)",
    "List of Parents Teachers Association (PTA) members",
    "Last three-year result of the board examination as per applicability",
  ],
  staff: [
    ["Principal", "1"],
    ["Total number of teachers", "140"],
    ["PGT", "38"],
    ["TGT", "52"],
    ["PRT", "44"],
    ["Teachers section ratio", "1 : 1.5"],
    ["Details of special educator", "2 (RCI registered)"],
    ["Details of counsellor and wellness teacher", "3"],
  ],
  infrastructure: [
    ["Total campus area (sq. m.)", "48,562"],
    ["Number and size of classrooms (sq. m.)", "72 × 50"],
    ["Number and size of laboratories incl. computer labs (sq. m.)", "9 × 75"],
    ["Internet facility", "Yes (1 Gbps)"],
    ["Number of girls' toilets", "36"],
    ["Number of boys' toilets", "34"],
    ["Link of YouTube video of inspection of school", "Available on request"],
  ],
  smc: [
    ["Shri Alok Narayan", "Chairman, Greenwood Education Trust", "Chairperson"],
    ["Dr. Meenakshi Srivastava", "Principal", "Member Secretary"],
    ["Mrs. Kavita Rastogi", "Parent representative", "Member"],
    ["Mr. Sandeep Bajpai", "Parent representative", "Member"],
    ["Mr. Rakesh Dubey", "Teacher representative", "Member"],
    ["Ms. Farida Ansari", "Teacher representative", "Member"],
    ["Dr. R. K. Saxena", "Educationist (nominated)", "Member"],
    ["CBSE nominee", "Principal of a nearby CBSE school", "Member"],
  ],
};

export const NOTABLE_ALUMNI = [
  { name: "Dr. Priya Agarwal", batch: "2006", now: "Cardiologist, AIIMS New Delhi" },
  { name: "Capt. Rohan Singh", batch: "2009", now: "Indian Army (Para SF)" },
  { name: "Aditi Bhatnagar", batch: "2012", now: "Product Manager, Bengaluru" },
  { name: "Kunal Mehrotra", batch: "2014", now: "IAS (UP cadre)" },
  { name: "Sara Khan", batch: "2016", now: "National-level badminton player" },
  { name: "Nikhil Gupta", batch: "2018", now: "Founder, agri-tech start-up" },
];

export const FAQ_ADMISSION = [
  { q: "Is there a school bus for my area?", a: "We run 32 routes across Lucknow. Check the Transport routes download or ask the front office for your locality." },
  { q: "Are there sibling or staff concessions?", a: "Yes — 10% tuition concession for the second child and 15% for the third. Merit and EWS concessions are also available." },
  { q: "What is the student-teacher ratio?", a: "About 17 : 1, with a maximum of 35 students per section." },
  { q: "Can fees be paid online?", a: "Yes. Parents can pay through the parent app or the fee portal using UPI, cards or net banking." },
];
