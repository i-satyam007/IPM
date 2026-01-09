export interface Course {
    code: string;
    name: string;
    credits: number;
    type: 'Core' | 'Elective' | 'Unknown';
}

export interface ClassSession {
    date: string; // ISO date string YYYY-MM-DD
    timeSlot: string; // e.g. "09:00 - 10:15"
    courseCode: string;
    sessionNumber: string;
    section: 'A' | 'B' | null; // null means common
    raw: string; // Original cell content
    isCancelled?: boolean;
}

export interface UserProfile {
    name?: string;
    email?: string;
    section: 'A' | 'B';
    electives: string[]; // List of Course Codes
}

export interface AttendanceRecord {
    courseCode: string; // e.g., "DE"
    sessionNumber: string; // "1"
    status: 'Present' | 'Absent';
    timestamp: number;
}
