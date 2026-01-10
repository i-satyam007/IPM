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
    // Row 0 is header. Start from Row 1.
    // Sheet Cols: Sl(0), Name(1), Credit(2), Code(3), Type(4)
    rows.slice(1).forEach((row) => {
        const code = row[3]?.trim(); // Code is at Index 3
        if (!code) return;

        courses[code] = {
            code,
            name: row[1]?.trim() || "", // Name at Index 1
            credits: Number(row[2]) || 0, // Credit at Index 2
            type: (row[4]?.trim() as Course['type']) || "Unknown", // Type at Index 4
        };
    });
    return courses;
};

export const parseSchedule = (data: any): ClassSession[] => {
    const sessions: ClassSession[] = [];
    const rows = data.rowData;

    console.log(`[parseSchedule] Total Rows: ${rows?.length || 0}`);

    if (!rows || rows.length < 3) return sessions;

    // Row 1 (Index 1): Header (Time Slots)
    const headerRow = rows[1]?.values;
    if (!headerRow) {
        console.log("[parseSchedule] No Header Row found at Index 1");
        return sessions;
    }

    const timeSlots: string[] = [];
    // We only care about cols >= 3 (Index 3+ is Slot 1)
    for (let i = 3; i < headerRow.length; i++) {
        // Use formattedValue as fallback
        const val = headerRow[i]?.userEnteredValue?.stringValue || headerRow[i]?.formattedValue;
        timeSlots.push(val || `Slot ${i - 2}`);
    }
    console.log(`[parseSchedule] Found Time Slots: ${timeSlots.join(", ")}`);

    let lastDate: string | null = null; // For merged cells

    // Data starts at Row 2 (Index 2)
    rows.slice(2).forEach((row: any, rIdx: number) => {
        const dateCell = row.values?.[0];
        let date = dateCell?.userEnteredValue?.stringValue || dateCell?.formattedValue;

        // Handle Merged Cells: If current date is empty but we're in a valid block, use lastDate.
        // We need a heuristic to know if it's a valid row. Checking Section (Col 2) is good.
        // If whole row is empty, we skip.

        // Check if row has legitimate data (e.g. check Section or any Slot)
        const hasData = row.values?.some((c: any, i: number) => i > 0 && (c.userEnteredValue?.stringValue || c.formattedValue));
        if (!hasData) return;

        if (date) {
            lastDate = date;
        } else if (lastDate) {
            date = lastDate; // Carry forward
        } else {
            return; // No date context
        }

        // Section Col 2 (Index 2)
        const sectionCell = row.values?.[2];
        const rowSection = (sectionCell?.userEnteredValue?.stringValue || sectionCell?.formattedValue)?.trim();

        // Iterate Time Slots (Cells starting at Col 3)
        timeSlots.forEach((slotName, i) => {
            const colIndex = i + 3;
            const cell = row.values?.[colIndex];

            const text = cell?.userEnteredValue?.stringValue || cell?.formattedValue;

            // Ignore "Lunch", "Break", empty
            if (!text || !text.trim() || text.toLowerCase().includes("lunch") || text.toLowerCase().includes("break")) return;

            // Parse cell: "DE 1 A"
            const parts = text.trim().split(/\s+/);
            if (parts.length < 2) return;

            const courseCode = parts[0];
            const sessionNumber = parts[1];

            let section: 'A' | 'B' | null = null;

            if (parts.length >= 3) {
                const sec = parts[2].toUpperCase();
                if (sec === 'A' || sec === 'B') section = sec;
            }
            if (!section && (rowSection === 'A' || rowSection === 'B')) {
                section = rowSection;
            }

            const isCancelled = cell.effectiveFormat?.textFormat?.strikethrough === true;

            sessions.push({
                date,
                timeSlot: slotName.replace(/\n/g, ' '),
                courseCode,
                sessionNumber,
                section,
                raw: text,
                isCancelled
            });
        });
    });

    console.log(`[parseSchedule] Parsed ${sessions.length} sessions`);
    return sessions;
};

export const parseStudentProfile = (
    email: string,
    studentRows: string[][],
    electiveRowsMap: Record<string, string[][]>
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

    // Case-Insensitive Find
    const courseSheet = sheetList.find(s => s.properties?.title?.toLowerCase().includes("details"))?.properties?.title
        || sheetList[0]?.properties?.title || "Sheet1";

    const timeTableSheet = sheetList.find(s => s.properties?.title?.toLowerCase().includes("time table"))?.properties?.title
        || sheetList[1]?.properties?.title || "Sheet2";

    const studentSheet = sheetList.find(s => s.properties?.title?.toLowerCase().includes("student master"))?.properties?.title
        || sheetList.find(s => s.properties?.title?.toLowerCase().includes("list"))?.properties?.title
        || sheetList[2]?.properties?.title || "Sheet3";

    // Debug Log which sheets are being selected
    console.log(`Selected Sheets: Courses='${courseSheet}', TimeTable='${timeTableSheet}', Students='${studentSheet}'`);

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

    // 2. Fetch Time Table with Formatting AND FormattedValue
    const gridRes = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [timeTableSheet],
        includeGridData: true,
        // added formattedValue
        fields: "sheets.data.rowData.values(userEnteredValue,effectiveFormat,formattedValue)"
    });

    const timeTableSheetData = gridRes.data.sheets?.[0]?.data?.[0]; // First range (Time Table), first grid

    return {
        courses: parseCourses(coursesData),
        schedule: parseSchedule(timeTableSheetData),
        studentMaster: studentData,
    };
}
