import { Course } from "@/types";

interface CourseStatsProps {
    stats: Record<string, { total: number; attended: number; leaves: number; allowedLeaves: number }>;
    courses: Record<string, Course>;
}

export default function CourseStats({ stats, courses }: CourseStatsProps) {
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Attendance Overview</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(stats).map(([code, stat]) => {
                    const course = courses[code];
                    const courseName = course?.name || code;
                    const percentage = stat.total > 0 ? Math.round((stat.attended / stat.total) * 100) : 0;

                    let statusColor = "bg-green-50 text-green-700 border-green-200";
                    let barColor = "bg-green-500";
                    let ringColor = "ring-green-500";

                    // Warning System
                    const leavesRemaining = stat.allowedLeaves - stat.leaves;

                    if (stat.leaves > stat.allowedLeaves) {
                        statusColor = "bg-red-50 text-red-700 border-red-200";
                        barColor = "bg-red-500";
                        ringColor = "ring-red-500";
                    } else if (leavesRemaining <= 1) {
                        statusColor = "bg-yellow-50 text-yellow-700 border-yellow-200";
                        barColor = "bg-yellow-500";
                        ringColor = "ring-yellow-500";
                    }

                    return (
                        <div key={code} className={`relative p-3 border rounded-lg shadow-sm transition-all hover:shadow-md ${statusColor}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold">{code}</span>
                                    <span className="text-[10px] opacity-75 truncate w-24" title={courseName}>{courseName}</span>
                                </div>
                                <span className={`text-xl font-bold ${stat.leaves > stat.allowedLeaves ? 'text-red-600' : ''}`}>
                                    {percentage}%
                                </span>
                            </div>

                            <div className="w-full bg-black/5 rounded-full h-1.5 mb-3">
                                <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${percentage}%` }}></div>
                            </div>

                            <div className="flex justify-between text-[11px] font-medium opacity-90">
                                <div className="flex flex-col">
                                    <span className="text-[9px] uppercase tracking-wider opacity-70">Attended</span>
                                    <span>{stat.attended} / {stat.total}</span>
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="text-[9px] uppercase tracking-wider opacity-70">Leaves</span>
                                    <span>{stat.leaves} / {stat.allowedLeaves}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
