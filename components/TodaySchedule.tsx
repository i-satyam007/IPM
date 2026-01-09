import { ClassSession, Course } from "@/types";
import { CheckCheck, XCircle } from "lucide-react";

interface TodayScheduleProps {
    classes: ClassSession[];
    courses: Record<string, Course>;
    attendance: Record<string, 'Present' | 'Absent'>;
    onMarkAttendance: (id: string, status: 'Present' | 'Absent') => void;
}

export default function TodaySchedule({ classes, courses, attendance, onMarkAttendance }: TodayScheduleProps) {
    if (classes.length === 0) {
        return (
            <div className="p-8 text-center bg-white rounded-xl shadow-sm border border-gray-100">
                <p className="text-gray-500">No classes scheduled for today.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Today's Schedule</h2>
            <div className="space-y-3">
                {classes.map((session, idx) => {
                    const course = courses[session.courseCode];
                    const id = `${session.courseCode}-${session.sessionNumber}`;
                    const status = attendance[id];
                    const isCancelled = session.isCancelled;

                    return (
                        <div key={idx} className={`flex items-center justify-between p-4 border rounded-xl shadow-sm transition-shadow ${isCancelled ? 'bg-red-50 border-red-100 opacity-75' : 'bg-white border-gray-100 hover:shadow-md'
                            }`}>
                            <div className="flex items-center space-x-4">
                                <div className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg font-bold ${isCancelled ? 'bg-red-100 text-red-500 line-through' : 'bg-indigo-50 text-indigo-700'
                                    }`}>
                                    {session.timeSlot.split(' ')[0]} {/* Simple time display */}
                                </div>
                                <div>
                                    <div className="flex items-center space-x-2">
                                        <h3 className={`font-bold text-gray-900 ${isCancelled ? 'line-through decoration-red-500' : ''}`}>
                                            {session.courseCode}
                                        </h3>
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                                            {course?.type || 'Core'}
                                        </span>
                                        {isCancelled && <span className="text-xs px-2 py-0.5 bg-red-200 text-red-700 rounded-full font-bold">Cancelled</span>}
                                    </div>
                                    <p className="text-sm text-gray-500">{course?.name}</p>
                                </div>
                            </div>

                            {!isCancelled && (
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => onMarkAttendance(id, 'Present')}
                                        className={`p-2 rounded-full transition-colors ${status === 'Present'
                                                ? 'bg-green-100 text-green-600 ring-2 ring-green-500 ring-offset-1'
                                                : 'bg-gray-50 text-gray-400 hover:bg-green-50 hover:text-green-500'
                                            }`}
                                        title="Mark Present"
                                    >
                                        <CheckCheck className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => onMarkAttendance(id, 'Absent')}
                                        className={`p-2 rounded-full transition-colors ${status === 'Absent'
                                                ? 'bg-red-100 text-red-600 ring-2 ring-red-500 ring-offset-1'
                                                : 'bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500'
                                            }`}
                                        title="Mark Absent"
                                    >
                                        <XCircle className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
