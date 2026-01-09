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
        const data = await fetchFullSchedule(session.accessToken, spreadsheetId);

        // Parse User Profile
        // Passing empty object for electives map for now (MVP)
        const userProfile = parseStudentProfile(session.user.email, data.studentMaster, {});

        return NextResponse.json({
            courses: data.courses,
            schedule: data.schedule,
            userProfile,
        });
    } catch (error: any) {
        console.error("Error fetching sheets:", error);
        return NextResponse.json({ error: error.message || "Failed to fetch schedule" }, { status: 500 });
    }
}
