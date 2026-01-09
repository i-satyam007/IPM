"use client";

import { Session } from "next-auth";
import { useEffect, useState, useMemo } from "react";
import { Loader2, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { UserProfile, Course, ClassSession } from "@/types";
import { filterClassesForUser, calculateStats } from "@/lib/attendance-logic";
import TodaySchedule from "./TodaySchedule";
import CourseStats from "./CourseStats";
import { clsx } from "clsx";

interface DashboardProps {
    session: Session;
}

export default function DashboardClient({ session }: DashboardProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [data, setData] = useState<{
        courses: Record<string, Course>;
        schedule: ClassSession[];
        userProfile: UserProfile;
    } | null>(null);

    const [attendance, setAttendance] = useState<Record<string, 'Present' | 'Absent'>>({});

    // Fetch Data
    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch("/api/schedule");
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || "Failed to fetch schedule");
                }
                const json = await res.json();
                setData(json);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Load Attendance from LocalStorage
    useEffect(() => {
        const stored = localStorage.getItem("ipm_attendance");
        if (stored) {
            setAttendance(JSON.parse(stored));
        }
    }, []);

    // Save Attendance
    const handleMarkAttendance = (id: string, status: 'Present' | 'Absent') => {
        const newRecord = { ...attendance, [id]: status };
        setAttendance(newRecord);
        localStorage.setItem("ipm_attendance", JSON.stringify(newRecord));
    };

    // Filter Data
    const filteredData = useMemo(() => {
        if (!data) return null;
        const myClasses = filterClassesForUser(data.schedule, data.courses, data.userProfile);

        // Sort logic? Date is string "01-Jan...". Need parsing if sorting desired.
        // Assuming sheet order is chronological.

        // Filter Today
        const today = new Date();
        // Format today to match sheet date format if possible "01-Jan-2026"
        // This requires strict date parsing logic matching the sheet.
        // Simplified: Check if date string contains today's formatted string.
        // Let's implement a helper or use a library if date formats are complex.
        // For now, let's just show ALL classes or implement a 'Today' filter if date format is standard.
        // "Strings like DE 1 A... Rows = Dates"
        // If Row[0] is "01-Jan-2026", we need to match that.

        const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
        const todayStr = today.toLocaleDateString('en-GB', options).replace(/ /g, '-');
        // e.g. "08 Jan 2026" -> "08-Jan-2026"

        const todaysClasses = myClasses.filter(c => c.date === todayStr);

        const stats = calculateStats(myClasses, attendance);

        return { myClasses, todaysClasses, stats };
    }, [data, attendance]);

    const [syncing, setSyncing] = useState(false);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await fetch("/api/calendar/sync", { method: "POST" });
            const json = await res.json();
            if (res.ok) {
                alert(`Synced ${json.count} classes to Google Calendar!`);
            } else {
                throw new Error(json.error);
            }
        } catch (e: any) {
            alert("Sync failed: " + e.message);
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }
    // ... error block kept similar ...
    if (error) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-red-600 font-bold">Error</h2>
                <p>{error}</p>
                <button onClick={() => window.location.reload()} className="mt-4 text-indigo-600 underline">Retry</button>
            </div>
        );
    }

    if (!data || !filteredData) return null;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <header className="bg-white shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        IPM Dashboard
                    </h1>
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={handleSync}
                            disabled={syncing}
                            className="hidden md:flex px-3 py-1.5 text-sm bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-colors disabled:opacity-50"
                        >
                            {syncing ? "Syncing..." : "Sync Calendar"}
                        </button>
                        <div className="text-sm text-right hidden sm:block">
                            <p className="font-semibold text-gray-900">{session.user?.name}</p>
                            <p className="text-gray-500">Section {data.userProfile.section}</p>
                        </div>
                        <button
                            onClick={() => signOut()}
                            className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                {/* Stats */}
                <CourseStats stats={filteredData.stats} courses={data.courses} />

                {/* Today's Schedule */}
                <TodaySchedule
                    classes={filteredData.todaysClasses}
                    courses={data.courses}
                    attendance={attendance}
                    onMarkAttendance={handleMarkAttendance}
                />

                {/* Debug / All Classes View (Optional) */}
                {/* <details>
          <summary>Debug: All My Classes</summary>
          <pre>{JSON.stringify(filteredData.myClasses, null, 2)}</pre>
        </details> */}
            </main>
        </div>
    );
}
