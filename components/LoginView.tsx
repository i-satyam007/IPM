"use client";

import { signIn } from "next-auth/react";
import { LayoutDashboard } from "lucide-react";

export default function LoginView() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-indigo-100 to-white">
            <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-xl">
                <div className="flex flex-col items-center">
                    <div className="p-3 bg-indigo-600 rounded-full">
                        <LayoutDashboard className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">
                        IPM Tracker
                    </h1>
                    <p className="mt-2 text-center text-gray-600">
                        Manage your attendance and schedule effortlessly.
                    </p>
                </div>

                <button
                    onClick={() => signIn("google")}
                    className="w-full flex items-center justify-center px-4 py-3 text-sm font-semibold text-white transition-all bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                        <path
                            fill="currentColor"
                            d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12.61C5,8.76 8.35,5.82 12.17,5.82C14.09,5.82 15.62,6.54 16.63,7.56L18.73,5.43C16.96,3.84 14.65,2.92 12.16,2.92C6.85,2.92 2.54,7.23 2.54,12.53C2.54,17.83 6.85,22.25 12.16,22.25C17.72,22.25 21.38,18.33 21.38,12.72C21.38,11.83 21.35,11.1 21.35,11.1Z"
                        />
                    </svg>
                    Sign in with Google
                </button>
            </div>
        </div>
    );
}
