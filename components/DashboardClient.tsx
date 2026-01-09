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

        const today = new Date();
        const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
        const todayStr = today.toLocaleDateString('en-GB', options).replace(/ /g, '-');

        const todaysClasses = myClasses.filter(c => c.date === todayStr);

        const stats = calculateStats(myClasses, attendance);

        return { myClasses, todaysClasses, stats };
    }, [data, attendance]);

    // View State
    const [view, setView] = useState<'today' | 'upcoming'>('today');

    // Group Upcoming Classes
    const groupedUpcoming = useMemo(() => {
        if (!filteredData?.myClasses) return {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const future = filteredData.myClasses.filter(c => {
            const d = new Date(c.date); // Ensure c.date parses correctly "DD-MMM-YYYY"
            return d >= today;
        });

        const grouped: Record<string, typeof future> = {};
        future.forEach(c => {
            if (!grouped[c.date]) grouped[c.date] = [];
            grouped[c.date].push(c);
        });
        return grouped;
    }, [filteredData]);

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

            <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* Tabs */}
                <div className="flex space-x-1 bg-white p-1 rounded-xl shadow-sm border border-gray-100">
                    {['today', 'upcoming'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setView(tab as any)}
                            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${view === tab
                                    ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                {view === 'today' && (
                    <>
                        <CourseStats stats={filteredData.stats} courses={data.courses} />
                        <TodaySchedule
                            classes={filteredData.todaysClasses}
                            courses={data.courses}
                            attendance={attendance}
                            onMarkAttendance={handleMarkAttendance}
                        />
                    </>
                )}

                {view === 'upcoming' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-800">Upcoming Schedule</h2>
                            <button
                                onClick={handleSync}
                                disabled={syncing}
                                className="md:hidden text-sm text-indigo-600 font-medium"
                            >
                                {syncing ? "Syncing..." : "Sync to Calendar"}
                            </button>
                        </div>

                        {Object.keys(groupedUpcoming).length === 0 ? (
                            <div className="p-8 text-center bg-white rounded-xl shadow-sm border border-gray-100">
                                <p className="text-gray-500">No classes found from today onwards.</p>
                            </div>
                        ) : (
                            Object.entries(groupedUpcoming).map(([date, sessions]) => (
                                <div key={date} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                                        <h3 className="font-semibold text-gray-700">{date}</h3>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {sessions.map((session, idx) => (
                                            <div key={idx} className={`p-4 flex justify-between items-center ${session.isCancelled ? 'bg-red-50 opacity-75' : ''
                                                }`}>
                                                <div className="flex items-center space-x-3">
                                                    <div className="text-sm font-bold text-indigo-600 w-16">
                                                        {session.timeSlot.split('-')[0]}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center space-x-2">
                                                            <span className={`font-medium ${session.isCancelled ? 'line-through decoration-red-500' : ''}`}>
                                                                {session.courseCode}
                                                            </span>
                                                            {session.isCancelled && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Cancelled</span>}
                                                        </div>
                                                        <p className="text-xs text-gray-500">{data.courses[session.courseCode]?.name}</p>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-gray-400">
                                                    Session {session.sessionNumber}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
