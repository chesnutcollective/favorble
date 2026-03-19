import { db } from "@/db/drizzle";
import { calendarEvents, users } from "@/db/schema";
import { eq, and, isNull, asc, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Calendar } from "lucide-react";

const EVENT_TYPE_COLORS: Record<string, string> = {
	hearing: "text-blue-600 border-blue-300",
	deadline: "text-red-600 border-red-300",
	appointment: "text-green-600 border-green-300",
	follow_up: "text-amber-600 border-amber-300",
	reminder: "text-gray-600 border-gray-300",
};

export default async function CaseCalendarPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id: caseId } = await params;

	const events = await db
		.select({
			id: calendarEvents.id,
			title: calendarEvents.title,
			description: calendarEvents.description,
			eventType: calendarEvents.eventType,
			startAt: calendarEvents.startAt,
			endAt: calendarEvents.endAt,
			location: calendarEvents.location,
			hearingOffice: calendarEvents.hearingOffice,
			adminLawJudge: calendarEvents.adminLawJudge,
			createdByName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
		})
		.from(calendarEvents)
		.leftJoin(users, eq(calendarEvents.createdBy, users.id))
		.where(
			and(
				eq(calendarEvents.caseId, caseId),
				isNull(calendarEvents.deletedAt),
			),
		)
		.orderBy(asc(calendarEvents.startAt));

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					Events ({events.length})
				</CardTitle>
			</CardHeader>
			<CardContent>
				{events.length === 0 ? (
					<EmptyState
						icon={Calendar}
						title="No events"
						description="Hearings, deadlines, and appointments for this case will appear here."
					/>
				) : (
					<div className="space-y-3">
						{events.map((event) => {
							const colorClass =
								EVENT_TYPE_COLORS[event.eventType] ??
								"text-gray-600 border-gray-300";
							const isPast = event.startAt < new Date();
							return (
								<div
									key={event.id}
									className={`rounded-md border p-3 space-y-1 ${
										isPast ? "opacity-60" : ""
									}`}
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<Badge
												variant="outline"
												className={`text-xs ${colorClass}`}
											>
												{event.eventType}
											</Badge>
											<span className="text-sm font-medium text-gray-900">
												{event.title}
											</span>
										</div>
										<span className="text-xs text-gray-500">
											{event.startAt.toLocaleString()}
										</span>
									</div>
									{event.description && (
										<p className="text-sm text-gray-700">
											{event.description}
										</p>
									)}
									<div className="flex flex-wrap gap-3 text-xs text-gray-500">
										{event.location && (
											<span>Location: {event.location}</span>
										)}
										{event.hearingOffice && (
											<span>Office: {event.hearingOffice}</span>
										)}
										{event.adminLawJudge && (
											<span>ALJ: {event.adminLawJudge}</span>
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
