# SMS

The School Management System API is a powerful tool for managing various aspects of a school, including students, staff, classes, sessions, and more. It provides a flexible and efficient way to handle administrative tasks and facilitate communication within educational institutions.

## Table of Contents

- Features
- Getting Started
  - Prerequisites
  - Installation
- Usage
- Authentication
- Sample Requests
- Meet The Developers

## Features
- User Management: Create and manage user accounts for students, teachers, and administrators.
- Admission/Enrollment (Students and Staff): registering new students and staffs
- Academics: manage educational services including classes, assignments, grades, etc.
- Fee Management: handle financial transactions, generate invoices
- Inventory: manage schools' physical assets and resources
- Communication: Send notifications and messages to students and staff.
- Authentication: Secure access with user authentication and authorization.
- Flexible Configuration: Customize the system according to your school's needs.

## Getting Started

### Prerequisites

Before you begin, ensure you have met the following requirements:

- Node.js and npm installed.
- A running instance of MongoDB or a MongoDB cloud service.
- Environment variables set up (see `.env.example` for required variables).

### Installation

- Clone this repository:
```bash
git clone git@github.com:Basitech-sms/SMS.git
```
- Navigate to the project directory:
```bash
cd SMS
```

- Install dependencies:
```bash
npm install
```

- Create a `.env` file based on `.env.example` and provide your configuration.
- Start the API server:
```bash
npm run dev
```

- Your SMS should now be running at `http://localhost:3000` (or a different port if specified in your `.env` file).


## Usage
To use the SMS, follow these steps:
- The developer will verify the creation of a superior account for you. Then, you can exercise the following:
  - Register users (students, teachers, administrators).
  - Create courses, classes, and sessions.
  - Manage attendance and grades.
  - Send notifications and messages.
  - Authenticate users for secure access.

Refer to the [API endpoints documentation](https://documenter.getpostman.com/view/23410424/2s9YJc23F7) section for detailed information on available routes and operations.

## Authentication

The School Management API uses token-based authentication. Users must authenticate to access protected routes. To obtain a token as a super admin, make a POST request to the `/superadmin/login` endpoint with valid credentials. You can either use the obtained token as a bearer token in the Authorization header for subsequent requests to protected routes or the token is automatically set as a cookie, and is perceived in every request you make.

Authentication and Authorization for different level of users can be checked [here](https://documenter.getpostman.com/view/23410424/2s9YJc23F7)

## Sample Requests

Below are some sample requests to help you get started:

### User(Super Admin) Registration
```http
POST /superadmin/register

{
    "fullName": "Salam",
    "emailAddress": "ayodejiabdussalam@gmail.com",
    "phoneNumber": "09035169648",
    "schoolName": "Hamdallah",
    "schoolEmailAddress": "hamdallah@gmail.com",
    "schoolAddress": {
        "number": 1,
        "street": "Ososa Avenue",
        "city": "Bariga",
        "state": "Lagos",
        "postalCode": "23110",
        "country": "Nigeria"
    }
}
```

### User(Super Admin) Login
```http
POST /superadmin/login

{
  "email": "john@example.com",
  "password": "secretpassword"
}
```
Visit [API documentation](https://documenter.getpostman.com/view/23410424/2s9YJc23F7) to learn about more requests.



