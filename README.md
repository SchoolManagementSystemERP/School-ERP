# School ERP

# School ERP System Documentation

## 1. Introduction

### 1.1 Project Overview

School ERP (Enterprise Resource Planning) System is a web-based application designed to automate and manage the daily operations of educational institutions. The system provides a centralized platform for administrators, principals, teachers, students, and parents to access and manage school-related information efficiently.

### 1.2 Objectives

* Automate school management processes.
* Reduce paperwork and manual errors.
* Improve communication among stakeholders.
* Provide real-time access to academic and administrative data.
* Generate reports and analytics for decision-making.

### 1.3 Scope

The system supports multiple schools and offers role-based access control (RBAC) for secure management of academic, administrative, and financial operations.

---

# 2. System Architecture

## 2.1 Technology Stack

### Frontend

* React.js
* Tailwind CSS
* ShadCN UI
* Axios

### Backend

* Node.js
* Express.js

### Database

* MongoDB

### Authentication

* JWT (JSON Web Token)
* Role-Based Access Control (RBAC)

### Cloud Services

* AWS EC2
* AWS S3
* AWS RDS (Optional)
* CloudFront

---

# 3. User Roles

## 3.1 Super Admin

Responsible for managing multiple schools.

### Permissions

* Create schools
* Manage subscriptions
* Manage school administrators
* Monitor system usage
* View analytics

---

## 3.2 School Admin

### Permissions

* Manage students
* Manage teachers
* Manage classes
* Manage sections
* Manage fee structure
* Generate reports

---

## 3.3 Principal

### Permissions

* Monitor academic performance
* Approve results
* View attendance reports
* Manage school operations

---

## 3.4 Teacher

### Permissions

* Mark attendance
* Enter marks
* Upload assignments
* View timetable
* Communicate with parents

---

## 3.5 Student

### Permissions

* View attendance
* View assignments
* View results
* Download report cards
* View timetable

---

## 3.6 Parent

### Permissions

* Track attendance
* Monitor academic performance
* View fee status
* Communicate with teachers

---

# 4. Functional Modules

## 4.1 Authentication Module

### Features

* Login
* Logout
* Password Reset
* JWT Authentication
* Role-Based Authorization

---

## 4.2 Student Management Module

### Features

* Student Registration
* Admission Management
* Student Profile Management
* Student Promotion
* Transfer Certificate Generation

### Student Information

* Name
* Roll Number
* Class
* Section
* Parent Details
* Address
* Documents

---

## 4.3 Teacher Management Module

### Features

* Teacher Registration
* Subject Allocation
* Class Assignment
* Attendance Monitoring

### Teacher Details

* Employee ID
* Qualification
* Experience
* Salary Information

---

## 4.4 Class & Section Management

### Features

* Create Classes
* Create Sections
* Assign Class Teachers
* Manage Capacity

Example:

* Class 10

  * Section A
  * Section B
  * Section C

---

## 4.5 Attendance Management

### Features

* Daily Attendance
* Monthly Reports
* Attendance Analytics

Attendance Status:

* Present
* Absent
* Leave
* Holiday

---

## 4.6 Timetable Management

### Features

* Create Timetable
* Subject Scheduling
* Teacher Allocation
* Room Allocation

Example:

Period 1 → Mathematics

Period 2 → English

Period 3 → Science

---

## 4.7 Examination Management

### Features

* Create Exams
* Subject-wise Marks Entry
* Result Generation
* Grade Calculation

Exam Types:

* Unit Test
* Half-Yearly
* Annual Examination

---

## 4.8 Report Card Management

### Features

* Automatic Result Calculation
* Grade Generation
* PDF Report Card Generation

Report Card Includes:

* Subject Marks
* Attendance Percentage
* Teacher Remarks
* Principal Signature

---

## 4.9 Assignment Management

### Features

* Create Assignments
* Upload Files
* Submission Tracking
* Evaluation

---

## 4.10 Fee Management

### Features

* Fee Structure Creation
* Online Payment
* Receipt Generation
* Due Tracking

Fee Categories:

* Tuition Fee
* Admission Fee
* Transport Fee
* Examination Fee

---

## 4.11 Library Management

### Features

* Book Inventory
* Issue Books
* Return Books
* Fine Calculation

---

## 4.12 Transport Management

### Features

* Route Management
* Vehicle Management
* Driver Information
* Student Allocation

---

## 4.13 Communication Module

### Features

* SMS Notifications
* Email Notifications
* In-App Messaging
* Announcements

---

## 4.14 Document Management

### Features

* Upload Certificates
* Upload Marksheets
* Store Student Documents
* Secure Access

---

## 4.15 Analytics & Reports

### Reports

* Attendance Reports
* Fee Collection Reports
* Performance Reports
* Staff Reports

Dashboard Metrics:

* Total Students
* Total Teachers
* Attendance Rate
* Fee Collection

---

# 5. Database Design

## Main Collections

### Schools

* schoolId
* schoolName
* domain
* address

### Users

* userId
* role
* email
* password

### Students

* studentId
* classId
* sectionId

### Teachers

* teacherId
* subjectAssigned

### Attendance

* attendanceId
* studentId
* date
* status

### Exams

* examId
* examName

### Marks

* markId
* studentId
* subjectId
* marksObtained

---

# 6. Multi-Tenant Architecture

The ERP follows a Multi-Tenant SaaS Model.

Example:

School 1:

* davpublicschool.com

School 2:

* stxaviersschool.com

School 3:

* modernacademy.com

Each school accesses the same ERP platform while maintaining complete data isolation.

Benefits:

* Cost Effective
* Scalable
* Centralized Maintenance
* Secure Data Separation

---

# 7. Security Features

* JWT Authentication
* Password Hashing (bcrypt)
* HTTPS Encryption
* Role-Based Access Control
* Audit Logs
* Data Backup

---

# 8. Future Enhancements

* AI-powered Performance Analysis
* Online Examination System
* Mobile Applications
* Video Conferencing Integration
* Biometric Attendance
* Learning Management System (LMS)

---

# 9. Conclusion

The School ERP System provides a comprehensive solution for managing educational institutions digitally. It improves operational efficiency, enhances communication, ensures data security, and supports academic excellence through automation and centralized management.


## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

  Run `npm run dev` to start the development server.
  
