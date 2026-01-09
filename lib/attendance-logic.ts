import { ClassSession, Course, UserProfile } from "@/types";

export function filterClassesForUser(
    rawSchedule: ClassSession[],
    courses: Record<string, Course>,
    userProfile: UserProfile
): ClassSession[] {
    return rawSchedule.filter((session) => {
        const course = courses[session.courseCode];
        if (!course) return true; // Show unknown courses by default? Or hide? Let's show as fallback.

        // Check 1: Elective
        if (course.type === 'Elective') {
            // ONLY show if in user's electives
            // But wait, the sheet might use short codes "GT" and maybe user profile has "GT".
            return userProfile.electives.includes(session.courseCode);
        }

        // Check 2: Core
        if (course.type === 'Core') {
            // Check Suffix/Section
            if (session.section) {
                // If session has specific section, must match user's section
                return session.section === userProfile.section;
            }
            // If no section (common class), show it
            return true;
        }

        return true;
    });
}

export function calculateStats(
    sessions: ClassSession[],
    attendance: Record<string, 'Present' | 'Absent'>
) {
    // Group by Course
    const stats: Record<string, { total: number; attended: number; leaves: number; allowedLeaves: number }> = {};

    sessions.forEach(session => {
        const code = session.courseCode;
        const key = `${code}-${session.sessionNumber}`; // Unique session ID

        if (!stats[code]) {
            stats[code] = { total: 0, attended: 0, leaves: 0, allowedLeaves: 0 };
        }

        // Total sessions usually implies "Total sessions happened so far" or "Total in curriculum"?
        // The prompt says "Show progress bar: (Classes Attended / Classes Happened So Far)".
        // So we only count sessions that are in the past or today?
        // For now, let's treat the inputs 'sessions' as 'sessions relevant to calculation'.
        // Typically we want Total Scheduled (Future) vs Total Happened.
        // Let's assume 'sessions' passed here are ALL sessions in the sheet.

        // We need to know if the session has happened. 
        // Simplified: Count all sessions in sheet as "Total Course Sessions" for 'AllowedLeaves' calc?
        // "Calculate AllowedLeaves = TotalSessions * 0.20" -> Suggests TotalSessions = Max session number or count of all sessions in sheet.

        stats[code].total += 1;

        // Check attendance (mock logic, relying on passed Record)
        // We assume 'attendance' keys are something unique like "DE-1" or "Date-Slot".
        // Better key: `${session.courseCode}-${session.sessionNumber}` for simplicity, or Date-based unique ID.
        // Let's use `${session.courseCode}-${session.sessionNumber}` as ID.

        const status = attendance[key];
        if (status === 'Present') {
            stats[code].attended += 1;
        } else if (status === 'Absent') {
            stats[code].leaves += 1;
        }
    });

    // Post-process for global totals or percentages
    Object.keys(stats).forEach(code => {
        stats[code].allowedLeaves = Math.floor(stats[code].total * 0.20);
    });

    return stats;
}
