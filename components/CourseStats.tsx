import { Course } from "@/types";

interface CourseStatsProps {
    stats: Record<string, { total: number; attended: number; leaves: number; allowedLeaves: number }>;
    courses: Record<string, Course>;
}

export default function CourseStats({ stats, courses }: CourseStatsProps) {
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Attendance Overview</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(stats).map(([code, stat]) => {
                    const course = courses[code];
                    const courseName = course?.name || code;
                    const percentage = stat.total > 0 ? Math.round((stat.attended / stat.total) * 100) : 0;

                    let statusColor = "bg-green-100 text-green-800 border-green-200";
                    let progressColor = "bg-green-500";

                    // Warning System
                    // Green: Safe
                    // Yellow: 1 leave remaining
                    // Red: Leaves exhausted
                    const leavesRemaining = stat.allowedLeaves - stat.leaves;

                    if (stat.leaves > stat.allowedLeaves) {
                        statusColor = "bg-red-100 text-red-800 border-red-200";
                        progressColor = "bg-red-500";
                    } else if (leavesRemaining <= 1) {
                        statusColor = "bg-yellow-100 text-yellow-800 border-yellow-200";
                        progressColor = "bg-yellow-500";
                    }

                    return (
                        <div key={code} className={`p-4 border rounded-xl shadow-sm ${statusColor}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-bold text-lg">{code}</h3>
                                    <p className="text-xs opacity-80 truncate max-w-[200px]" title={courseName}>{courseName}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-2xl font-bold">{percentage}%</span>
                                </div>
                            </div>

                            <div className="w-full bg-white/50 rounded-full h-2.5 mb-2">
                                <div className={`h-2.5 rounded-full ${progressColor}`} style={{ width: `${percentage}%` }}></div>
                            </div>

                            <div className="flex justify-between text-xs font-semibold">
                                <span>Attended: {stat.attended}/{stat.total}</span>
                                <span>Leaves: {stat.leaves}/{stat.allowedLeaves}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
