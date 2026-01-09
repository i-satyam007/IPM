import { google } from "googleapis";
import { Course, ClassSession, UserProfile } from "@/types";

// Helper to get Google Sheets API client
export const getSheetsClient = (accessToken: string) => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.sheets({ version: "v4", auth });
};

// --- Parsers ---

export const parseCourses = (rows: string[][]): Record<string, Course> => {
    const courses: Record<string, Course> = {};
    // Assuming Row 0 is header. Start from Row 1.
    // Columns: Code (0), Name (1), Credit (2), Type (3)
    rows.slice(1).forEach((row) => {
        const code = row[0]?.trim();
        if (!code) return;
        courses[code] = {
            code,
            name: row[1]?.trim() || "",
            credits: Number(row[2]) || 0,
            type: (row[3]?.trim() as Course['type']) || "Unknown",
        };
    });
    return courses;
};

export const parseSchedule = (data: any): ClassSession[] => {
    const sessions: ClassSession[] = [];
    const rows = data.rowData;
    if (!rows || rows.length < 2) return sessions;

    // Row 0: Header (Time Slots)
    const headerRow = rows[0].values;
    const timeSlots: string[] = [];

    headerRow.slice(1).forEach((cell: any, index: number) => {
        timeSlots.push(cell.userEnteredValue?.stringValue || `Slot ${index + 1}`);
    });

    rows.slice(1).forEach((row: any) => {
        const dateCell = row.values?.[0];
        const date = dateCell?.userEnteredValue?.stringValue; // e.g. "01-Jan-2026"
        if (!date) return;

        // Iterate time slots
        row.values?.slice(1).forEach((cell: any, index: number) => {
            const text = cell.userEnteredValue?.stringValue;
            if (!text || !text.trim()) return;

            const timeSlot = timeSlots[index] || `Slot ${index + 1}`;

            // Parse cell: "DE 1 A" or "GT 1"
            const parts = text.trim().split(/\s+/);
            if (parts.length < 2) return;

            const courseCode = parts[0];
            const sessionNumber = parts[1];
            let section: 'A' | 'B' | null = null;

            if (parts.length >= 3) {
                const sec = parts[2].toUpperCase();
                if (sec === 'A' || sec === 'B') section = sec;
            }

            // Check Formatting (Strikethrough)
            const isCancelled = cell.effectiveFormat?.textFormat?.strikethrough === true;

            // Handle "Updated to some other date" ?
            // If cancelled, the app should probably show it as "Cancelled" or "Rescheduled"
            // The prompt says "strikedthrough... and updated to some other date".
            // This implies the cell might have text that indicates the change, OR there is another cell elsewhere.
            // If this cell is struck, it is cancelled for THIS slot.
            // We will mark isCancelled = true. The frontend can display it as struck.

            sessions.push({
                date,
                timeSlot,
                courseCode,
                sessionNumber,
                section,
                raw: text,
                isCancelled
            });
        });
    });
    return sessions;
};

export const parseStudentProfile = (
    email: string,
    studentRows: string[][],
    electiveRowsMap: Record<string, string[][]> // CourseCode -> Rows of that elective sheet
): UserProfile | null => {
    // 1. Find User Section from Student Master Sheet (C)
    // Cols: Email (0), Section (1)
    const studentRow = studentRows.find(row => row[0]?.trim().toLowerCase() === email.toLowerCase());

    // Default to A if not found? Or return null? User says "Match email". Let's return defaults if not found to allow viewing something.
    // Actually, strictly need section.
    const section = (studentRow?.[1]?.trim().toUpperCase() as 'A' | 'B') || 'A'; // Defaulting to A for now if missing

    // 2. Find User Electives from Elective Sheets (D)
    const electives: string[] = [];

    Object.entries(electiveRowsMap).forEach(([courseCode, rows]) => {
        // If user email acts as participant
        // Assuming elective sheets have Email in Col 0
        const distinctEmails = new Set(rows.map(r => r[0]?.trim().toLowerCase()));
        if (distinctEmails.has(email.toLowerCase())) {
            electives.push(courseCode);
        }
    });

    return {
        email,
        section,
        electives
    };
};

export async function fetchFullSchedule(accessToken: string, spreadsheetId: string) {
    const sheets = getSheetsClient(accessToken);

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetList = meta.data.sheets || [];

    // Log for debugging
    console.log("Found Sheets:", sheetList.map(s => s.properties?.title));

    const courseSheet = sheetList.find(s => s.properties?.title?.includes("Details"))?.properties?.title
        || sheetList[0]?.properties?.title || "Sheet1";

    const timeTableSheet = sheetList.find(s => s.properties?.title?.includes("Time Table"))?.properties?.title
        || sheetList[1]?.properties?.title || "Sheet2";

    const studentSheet = sheetList.find(s => s.properties?.title?.includes("Student Master"))?.properties?.title
        || sheetList.find(s => s.properties?.title?.includes("List"))?.properties?.title
        || sheetList[2]?.properties?.title || "Sheet3";

    // We need to fetch 'gridData' for the Time Table to get formatting.
    // Standard 'values.batchGet' ONLY returns values, not formatting.
    // We must use 'spreadsheets.get' with 'ranges' and 'includeGridData: true' for the Time Table.
    // For others, values.batchGet is faster/easier (parsing strings).

    // 1. Fetch Courses & Student Master (Values only)
    const valuesRes = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: [courseSheet, studentSheet]
    });

    const coursesData = valuesRes.data.valueRanges?.[0].values || [];
    const studentData = valuesRes.data.valueRanges?.[1].values || [];

    // 2. Fetch Time Table with Formatting
    const gridRes = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [timeTableSheet],
        includeGridData: true,
        // optimize fields to reduce payload
        fields: "sheets.data.rowData.values(userEnteredValue,effectiveFormat)"
    });

    const timeTableSheetData = gridRes.data.sheets?.[0]?.data?.[0]; // First range (Time Table), first grid

    return {
        courses: parseCourses(coursesData),
        schedule: parseSchedule(timeTableSheetData), // Now passing gridData
        studentMaster: studentData,
    };
}
