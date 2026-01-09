import { google } from "googleapis";
import { ClassSession, Course } from "@/types";

export const getCalendarClient = (accessToken: string) => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.calendar({ version: "v3", auth });
};

export async function syncToCalendar(
    accessToken: string,
    classes: ClassSession[],
    courses: Record<string, Course>
) {
    const calendar = getCalendarClient(accessToken);
    const calendarId = "primary";

    // 1. Fetch existing future events tagged as "IPM-App" to avoid duplicates
    // We'll use a private extended property 'app: "ipm-tracker"'

    // Limit to future? Or all? Let's sync upcoming month.
    const now = new Date();
    const timeMin = now.toISOString();

    // List events
    // Note: listing all might be slow. 
    // Optimization: For now, we will just insert new ones if they don't exist?
    // Proper sync is hard without a database of event IDs.
    // Strategy:
    // - List upcoming events with privateExtendedProperty 'source=ipm-tracker'
    // - Compare with 'classes' (generate unique sig for each class: Date-Slot-Code)
    // - If exists, update/skip. If not exists, insert. If event exists but no class, delete (cancelled?).

    // Implementation for MVP: 
    // User clicks "Sync". We process classes from Today onwards.

    const eventsRes = await calendar.events.list({
        calendarId,
        timeMin,
        privateExtendedProperty: ["source=ipm-tracker"],
        singleEvents: true,
    });

    const existingEvents = eventsRes.data.items || [];
    const existingMap = new Map<string, string>(); // Signature -> EventID

    existingEvents.forEach(e => {
        if (e.extendedProperties?.private?.signature) {
            existingMap.set(e.extendedProperties.private.signature, e.id!);
        }
    });

    // Filter classes to future only
    const futureClasses = classes.filter(c => {
        // Parse date c.date "01-Jan-2026"
        // Need robust parsing. 
        const d = new Date(Date.parse(c.date));
        return d >= new Date(now.setHours(0, 0, 0, 0));
    });

    for (const session of futureClasses) {
        // Skip cancelled classes from Calendar? Or mark them as Cancelled in Calendar?
        // If isCancelled, we should specific title or delete the event.
        // Let's delete/remove from calendar if cancelled in sheet.

        const signature = `${session.date}-${session.timeSlot}-${session.courseCode}`;
        const existingEventId = existingMap.get(signature);

        if (session.isCancelled) {
            if (existingEventId) {
                // Delete it
                await calendar.events.delete({ calendarId, eventId: existingEventId });
            }
            continue;
        }

        // Construct Event
        const course = courses[session.courseCode];
        const summary = `${session.courseCode}: ${course?.name || 'Class'}`;
        const description = `Session: ${session.sessionNumber}\nSection: ${session.section || 'Common'}`;

        // Parse Time Slot "09:00 - 10:15"
        // And Date "01-Jan-2026"
        const [startTimeStr, endTimeStr] = session.timeSlot.split('-').map(s => s.trim());

        const startDate = new Date(Date.parse(session.date));
        const [startH, startM] = startTimeStr.split(':').map(Number);
        const [endH, endM] = endTimeStr.split(':').map(Number);

        // Set hours
        const startDateTime = new Date(startDate);
        startDateTime.setHours(startH, startM);

        const endDateTime = new Date(startDate);
        endDateTime.setHours(endH, endM);

        const eventBody = {
            summary,
            description,
            start: { dateTime: startDateTime.toISOString() },
            end: { dateTime: endDateTime.toISOString() },
            extendedProperties: {
                private: {
                    source: "ipm-tracker",
                    signature: signature
                }
            }
        };

        if (existingEventId) {
            // Update
            await calendar.events.update({
                calendarId,
                eventId: existingEventId,
                requestBody: eventBody
            });
        } else {
            // Insert
            await calendar.events.insert({
                calendarId,
                requestBody: eventBody
            });
        }
    }
}
