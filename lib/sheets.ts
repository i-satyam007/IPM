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
            // Robust cleaning: remove newlines, multiple spaces, trim
            type: (row[4]?.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() as Course['type']) || "Unknown",
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
        // COMPATIBILITY FIX: Use [\s\S] instad of /s flag for dotAll to avoid target version issues
        const timeMatch = cleanSlot.match(/(\d{1,2}:\d{2}\s*(?:am|pm|noon|AM|PM)[\s\S]*?)(?:\r\n|\r|\n|$)/);
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
    console.log(`[parseStudentProfile] Checking for email: ${targetEmail}`);

    Object.entries(electiveRowsMap).forEach(([courseCode, rows]) => {
        // Map rows to Emails (Col D / Index 3)
        // Debug first 5 rows
        // console.log(`[parseStudentProfile] Checking ${courseCode}, first row emails:`, rows.slice(0, 5).map(r => r[3]));

        const distinctEmails = new Set(rows.map(r => r[3]?.trim().toLowerCase()));
        if (distinctEmails.has(targetEmail)) {
            console.log(`[parseStudentProfile] Found match in ${courseCode}`);
            electives.push(courseCode);
        }
    });

    return {
        email,
        section,
        electives
    };
};

interface ScheduleData {
    courses: Record<string, Course>;
    schedule: ClassSession[];
    studentRows: string[][];
    electiveRowsMap: Record<string, string[][]>;
    debug: {
        sheetNames: string[];
        electiveLog: string[];
    };
}

export const fetchFullSchedule = async (spreadsheetId: string, accessToken: string): Promise<ScheduleData> => {
    const sheets = getSheetsClient(accessToken);

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetList = meta.data.sheets || [];

    const allSheetNames = sheetList.map(s => s.properties?.title || 'Untitled Sheet');
    console.log("Found Sheets:", allSheetNames);

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
    const electiveSheetRanges: string[] = [];
    const electiveCodeToSheetTitle: Record<string, string> = {};
    const debugLog: string[] = [];

    debugLog.push("Scanning for elective sheets...");
    Object.values(courses).forEach(course => {
        // Robust check for elective type
        if (course.type.toLowerCase().includes("elective") || course.type.toLowerCase().includes("compl.")) {
            // Strategy 1: Title includes Name (e.g. "Game Theory")
            let match = sheetList.find(s =>
                s.properties?.title?.toLowerCase().includes(course.name.toLowerCase())
            );

            // Strategy 2: Title includes Code AND "List" (e.g. "List of ... GT")
            if (!match) {
                match = sheetList.find(s => {
                    const title = s.properties?.title?.toLowerCase() || "";
                    return title.includes(course.code.toLowerCase()) && title.includes("list");
                });
            }

            // Strategy 3: Split Code (e.g. "LSF-III" -> "LSF")
            if (!match) {
                const shortCode = course.code.split('-')[0].toLowerCase();
                if (shortCode.length > 1) { // Avoid matching single letters
                    match = sheetList.find(s => {
                        const title = s.properties?.title?.toLowerCase() || "";
                        return title.includes(shortCode) && title.includes("list");
                    });
                }
            }

            if (match && match.properties?.title) {
                // QUOTE THE SHEET NAME to handle spaces safely in A1 notation
                const safeTitle = `'${match.properties.title}'`;
                electiveSheetRanges.push(safeTitle);
                // Store the raw title for mapping back later
                electiveCodeToSheetTitle[course.code] = match.properties.title;
                debugLog.push(`Found sheet for ${course.code}: ${match.properties.title}`);
            } else {
                debugLog.push(`No sheet found for ${course.code} (${course.name})`);
            }
        }
    });

    console.log("[fetchFullSchedule] Discovered:", electiveCodeToSheetTitle);

    // 4. Student Master / Section Sheets
    const sectionASheet = sheetList.find(s => s.properties?.title?.toLowerCase().includes("section a"))?.properties?.title;
    const sectionBSheet = sheetList.find(s => s.properties?.title?.toLowerCase().includes("section b"))?.properties?.title;

    const rangesToFetch = [
        ...(sectionASheet ? [`'${sectionASheet}'`] : []),
        ...(sectionBSheet ? [`'${sectionBSheet}'`] : []),
        ...electiveSheetRanges
    ];

    console.log("[fetchFullSchedule] Fetching Ranges:", rangesToFetch);

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
            const rangeName = rangeObj.range; // "'List of ...'!A1:Z99" or "Section A!..."
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
                let found = false;
                for (const [code, sheetTitle] of entries) {
                    // Check if rangeName contains the sheet title (careful of quotes)
                    // rangeName usually comes back as "'Sheet Name'!Range"
                    if (rangeName?.includes(sheetTitle)) {
                        electiveRowsMap[code] = val;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    console.log(`[fetchFullSchedule] Warning: Could not map range ${rangeName} to any elective.`);
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
    const schedule = parseSchedule(timeTableSheetData, courses);

    return {
        courses,
        schedule,
        studentRows: combinedStudentRows,
        electiveRowsMap,
        debug: {
            sheetNames: allSheetNames,
            electiveLog: debugLog
        }
    };
}

