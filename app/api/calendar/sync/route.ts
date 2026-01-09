import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchFullSchedule, parseStudentProfile } from "@/lib/sheets";
import { filterClassesForUser } from "@/lib/attendance-logic"; // Note capital A typo fix
import { syncToCalendar } from "@/lib/calendar";
import { NextResponse } from "next/server";

export async function POST() {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken || !session.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
        return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }

    try {
        // 1. Fetch Data
        const data = await fetchFullSchedule(session.accessToken, spreadsheetId);

        // 2. Filter for User
        const userProfile = parseStudentProfile(session.user.email, data.studentMaster, {});
        // Need logic to filter

        // Import filter logic - wait, checking import path case sensitivity
        // In previous steps I created `lib/attendance-logic.ts` (lowercase)
        // The import above has `Attendance-logic`. Fixing.

        const { filterClassesForUser } = require("@/lib/attendance-logic");

        const myClasses = filterClassesForUser(data.schedule, data.courses, userProfile);

        // 3. Sync
        await syncToCalendar(session.accessToken, myClasses, data.courses);

        return NextResponse.json({ success: true, count: myClasses.length });
    } catch (error: any) {
        console.error("Sync Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
