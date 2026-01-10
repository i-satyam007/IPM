import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchFullSchedule, parseStudentProfile } from "@/lib/sheets";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken || !session.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
        return NextResponse.json({ error: "Spreadsheet ID not configured" }, { status: 500 });
    }

    try {
        console.log("Fetching schedule...");
        const data = await fetchFullSchedule(session.accessToken, spreadsheetId);

        console.log(`Fetched Data:
            Courses: ${Object.keys(data.courses).length}
            Schedule Rows: ${data.schedule.length}
            Student Master Rows: ${data.studentRows.length}
        `);

        // Parse user (this logic runs on the fetched data)
        const userProfile = parseStudentProfile(session.user.email, data.studentRows, data.electiveRowsMap);

        console.log("User Profile:", JSON.stringify(userProfile));

        return NextResponse.json({
            courses: data.courses,
            schedule: data.schedule,
            userProfile,
            debug: data.debug // Pass to client
        });
    } catch (error: any) {
        console.error("Error fetching sheets:", error);
        return NextResponse.json({ error: error.message || "Failed to fetch schedule" }, { status: 500 });
    }
}
