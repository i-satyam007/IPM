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

export const parseSchedule = (data: any, courses: Record<string, Course>): ClassSession[] => {
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
        // Clean up slot: "Slot 1\n09:00 am - ..." -> "09:00 am - ..."
        // Regex to find time range
        let cleanSlot = val || `Slot ${i - 2}`;
        const timeMatch = cleanSlot.match(/(\d{1,2}:\d{2}\s*(?:am|pm|noon|AM|PM).*?)(?:\r\n|\r|\n|$)/s);
        if (timeMatch) {
            cleanSlot = cleanSlot.replace(/Slot\s*\d+\s*/i, '').trim(); // Remove "Slot 1"
            cleanSlot = cleanSlot.replace(/\n/g, ' ').trim();
        }
        timeSlots.push(cleanSlot);
    }
    console.log(`[parseSchedule] Found Time Slots: ${timeSlots.join(", ")}`);

    let lastDate: string | null = null; // For merged cells

    // Data starts at Row 2 (Index 2)
    rows.slice(2).forEach((row: any, rIdx: number) => {
        const dateCell = row.values?.[0];
        let date = dateCell?.userEnteredValue?.stringValue || dateCell?.formattedValue;

        const hasData = row.values?.some((c: any, i: number) => i > 0 && (c.userEnteredValue?.stringValue || c.formattedValue));
        if (!hasData) return;

        if (date) {
            lastDate = date;
        } else if (lastDate) {
            date = lastDate; // Carry forward
        } else {
            return; // No date context
        }

        const sectionCell = row.values?.[2];
        const rowSection = (sectionCell?.userEnteredValue?.stringValue || sectionCell?.formattedValue)?.trim();

        // Iterate Time Slots (Cells starting at Col 3)
        timeSlots.forEach((slotName, i) => {
            const colIndex = i + 3;
            const cell = row.values?.[colIndex];

            const text = cell?.userEnteredValue?.stringValue || cell?.formattedValue;

            // Ignore "Lunch", "Break", empty
            if (!text || !text.trim() || text.toLowerCase().includes("lunch") || text.toLowerCase().includes("break")) return;

            const parts = text.trim().split(/\s+/);
            if (parts.length < 1) return;

            let courseCode = parts[0];
            let sessionNumber = parts[1] || "";

            // VALIDATE COURSE CODE
            // If the code is not in our known courses list, it might be "Term" or "and"
            // We can just skip it, or add it with a flag.
            // For now, let's SKIP unknown courses to fix the "Term" / "and" bug.
            if (!courses[courseCode]) {
                // Try removing punctuation?
                courseCode = courseCode.replace(/[^a-zA-Z0-9]/g, '');
                if (!courses[courseCode]) {
                    // console.log(`[parseSchedule] Skipping unknown code: ${parts[0]} (${text})`);
                    return;
                }
            }

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
                timeSlot: slotName,
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
    // 1. Find User Section from Student Master / Section Sheets
    // Based on screenshots:
    // Email is in Column D (Index 3)
    // Section is in Column J (Index 9) - observed in "Section A" sheet

    // Safety check: trim and lowercase checks
    const targetEmail = email.trim().toLowerCase();

    const studentRow = studentRows.find(row => row[3]?.trim().toLowerCase() === targetEmail);

    // Default to 'A' if not found, or try to read from Column J
    // If Row found, read Col J. If no row, default A.
    let section: 'A' | 'B' = 'A';
    if (studentRow) {
        const secVal = studentRow[9]?.trim().toUpperCase();
        if (secVal === 'A' || secVal === 'B') {
            section = secVal;
        }
    }

    // 2. Find User Electives
    // Elective Sheets also have Email in Column D (Index 3)
    const electives: string[] = [];
    Object.entries(electiveRowsMap).forEach(([courseCode, rows]) => {
        // Map rows to Emails (Col D / Index 3)
        const distinctEmails = new Set(rows.map(r => r[3]?.trim().toLowerCase()));
        if (distinctEmails.has(targetEmail)) {
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

    console.log("Found Sheets:", sheetList.map(s => s.properties?.title));

    // 1. Identify Sheets
    const courseSheet = sheetList.find(s => s.properties?.title?.toLowerCase().includes("details"))?.properties?.title
        || sheetList[0]?.properties?.title || "Sheet1";

    const timeTableSheet = sheetList.find(s => s.properties?.title?.toLowerCase().includes("time table"))?.properties?.title
        || sheetList[1]?.properties?.title || "Sheet2";

    // 2. Fetch Courses First (to know what Electives to look for)
    // We need to fetch Course Sheet NOW to build the map
    const courseValues = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: courseSheet,
    });
    const courses = parseCourses(courseValues.data.values || []);

    // 3. Dynamic Elective Sheet Discovery
    // Identify sheets that match Elective Names
    const electiveSheetRanges: string[] = [];
    const electiveCodeToSheetTitle: Record<string, string> = {};

    Object.values(courses).forEach(course => {
        if (course.type.toLowerCase().includes("elective") || course.type.toLowerCase().includes("compl.")) {
            // Fuzzy match: Does any sheet title include the Course Name?
            // e.g. Name "Game Theory" -> Sheet "List of ... Game Theory"
            const match = sheetList.find(s =>
                s.properties?.title?.toLowerCase().includes(course.name.toLowerCase())
            );
            if (match && match.properties?.title) {
                electiveSheetRanges.push(match.properties.title);
                electiveCodeToSheetTitle[course.code] = match.properties.title;
            }
        }
    });

    // 4. Student Master / Section Sheets
    const sectionASheet = sheetList.find(s => s.properties?.title?.toLowerCase().includes("section a"))?.properties?.title;
    const sectionBSheet = sheetList.find(s => s.properties?.title?.toLowerCase().includes("section b"))?.properties?.title;

    const rangesToFetch = [
        ...(sectionASheet ? [sectionASheet] : []),
        ...(sectionBSheet ? [sectionBSheet] : []),
        ...electiveSheetRanges
    ];

    let studentDataMap: Record<string, string[][]> = {};
    let electiveRowsMap: Record<string, string[][]> = {};

    if (rangesToFetch.length > 0) {
        const batchRes = await sheets.spreadsheets.values.batchGet({
            spreadsheetId,
            ranges: rangesToFetch
        });

        const returnedRanges = batchRes.data.valueRanges || [];

        // Map back to what we requested
        returnedRanges.forEach((rangeObj, index) => {
            const rangeName = rangeObj.range; // "SheetName!A1:Z99"
            const val = rangeObj.values || [];

            // Check if it's Section A or B
            // Note: rangeName usually includes full syntax. We just check inclusion.
            if (sectionASheet && rangeName?.includes(sectionASheet)) {
                studentDataMap['A'] = val;
            }
            else if (sectionBSheet && rangeName?.includes(sectionBSheet)) {
                studentDataMap['B'] = val;
            } else {
                // Must be elective
                // Find which code maps to this sheet
                const entries = Object.entries(electiveCodeToSheetTitle);
                for (const [code, sheetTitle] of entries) {
                    if (rangeName?.includes(sheetTitle)) {
                        electiveRowsMap[code] = val;
                        break;
                    }
                }
            }
        });
    }

    // Combine Section A and B into one master list for the parser (legacy support)
    // Or update parser to just check both.
    const combinedStudentRows = [...(studentDataMap['A'] || []), ...(studentDataMap['B'] || [])];

    // 5. Fetch Time Table with Formatting
    const gridRes = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [timeTableSheet],
        includeGridData: true,
        fields: "sheets.data.rowData.values(userEnteredValue,effectiveFormat,formattedValue)"
    });

    const timeTableSheetData = gridRes.data.sheets?.[0]?.data?.[0];

    return {
        courses,
        schedule: parseSchedule(timeTableSheetData, courses),
        studentMaster: combinedStudentRows,
        electiveRowsMap // Pass this out so route can use it
    };
}
